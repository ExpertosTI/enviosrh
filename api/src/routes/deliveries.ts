import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { messengerMessage, customerMessage, waLink } from '../lib/whatsapp.js';

const deliveries = new Hono();

// ── Panel operativo: listar envíos ───────────────────────────
deliveries.get('/', auth, async (c) => {
  const user = c.get('user');
  const { state, date } = c.req.query();

  const isMessenger = user.role === 'messenger';

  const rows = await sql`
    SELECT
      d.id, d.state, d.delivery_fee,
      d.location_link, d.address_override,
      d.assigned_at, d.delivered_at, d.created_at,
      d.messenger_note, d.notes,
      d.external_ref, d.external_source,
      d.customer_confirmed, d.rating,
      c.id    AS customer_id,
      c.name  AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.reference AS customer_reference,
      u.id   AS messenger_id,
      u.name AS messenger_name,
      u.phone AS messenger_phone
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE
      ${isMessenger ? sql`d.messenger_id = ${user.sub}` : sql`1=1`}
      AND ${state ? sql`d.state = ${state}` : sql`d.state NOT IN ('cancelled')`}
      AND ${date ? sql`d.created_at::date = ${date}` : sql`1=1`}
    ORDER BY d.created_at DESC
    LIMIT 200
  `;
  return c.json(rows);
});

// ── Crear envío ──────────────────────────────────────────────
deliveries.post('/', auth, operatorOnly, async (c) => {
  const body = await c.req.json<{
    customer: { name: string; phone: string; address?: string; reference?: string; notes?: string };
    location_link?: string;
    delivery_fee?: number;
    messenger_id?: string;
    notes?: string;
    external_ref?: string;
    external_source?: string;
  }>();

  const { customer, location_link, delivery_fee = 0, messenger_id, notes, external_ref, external_source } = body;

  if (!customer?.name || !customer?.phone) {
    return c.json({ error: 'Nombre y teléfono del cliente requeridos' }, 400);
  }

  // Upsert cliente por teléfono
  const [cust] = await sql`
    INSERT INTO customers (name, phone, address, reference, notes)
    VALUES (${customer.name}, ${customer.phone}, ${customer.address ?? null}, ${customer.reference ?? null}, ${customer.notes ?? null})
    ON CONFLICT (phone) DO UPDATE
      SET name      = EXCLUDED.name,
          address   = COALESCE(EXCLUDED.address, customers.address),
          reference = COALESCE(EXCLUDED.reference, customers.reference)
    RETURNING id, name, phone, address, reference
  `;

  const state = messenger_id ? 'assigned' : 'draft';

  const [delivery] = await sql`
    INSERT INTO deliveries (
      customer_id, location_link, delivery_fee,
      messenger_id, state, assigned_at,
      notes, external_ref, external_source, operator_id
    ) VALUES (
      ${cust.id},
      ${location_link ?? null},
      ${delivery_fee},
      ${messenger_id ?? null},
      ${state},
      ${messenger_id ? sql`now()` : null},
      ${notes ?? null},
      ${external_ref ?? null},
      ${external_source ?? null},
      ${c.get('user').sub}
    )
    RETURNING *
  `;

  // Registrar evento inicial
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${delivery.id}, ${state}, ${c.get('user').sub}, 'operator', 'Envío creado')
  `;

  return c.json({ ...delivery, customer: cust }, 201);
});

// ── Detalle de un envío ──────────────────────────────────────
deliveries.get('/:id', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const [row] = await sql`
    SELECT
      d.id, d.state, d.delivery_fee,
      d.location_link, d.address_override,
      d.assigned_at, d.delivered_at, d.created_at,
      d.messenger_note, d.notes,
      d.external_ref, d.external_source,
      d.customer_confirmed, d.rating,
      c.id    AS customer_id,
      c.name  AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.reference AS customer_reference,
      u.id   AS messenger_id,
      u.name AS messenger_name,
      u.phone AS messenger_phone
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.id = ${id}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);

  // Mensajero solo puede ver sus propios envíos
  if (user.role === 'messenger' && row.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  return c.json(row);
});

// ── Detalle de envío con URLs de WhatsApp ───────────────────
deliveries.get('/:id/share', auth, async (c) => {
  const { id } = c.req.param();

  const [row] = await sql`
    SELECT d.*, c.name AS customer_name, c.phone AS customer_phone,
           c.address AS customer_address, c.reference,
           u.name AS messenger_name, u.phone AS messenger_phone
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.id = ${id}
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);

  const custMsg = customerMessage({ customerName: row.customer_name, customerToken: row.customer_token });
  const custWa  = row.customer_phone ? waLink(row.customer_phone, custMsg) : null;

  let messWa = null;
  if (row.messenger_token && row.messenger_phone) {
    const messMsg = messengerMessage({
      messengerName: row.messenger_name,
      customerName:  row.customer_name,
      address:       row.address_override ?? row.customer_address ?? '',
      locationLink:  row.location_link,
      deliveryFee:   Number(row.delivery_fee),
      messengerToken: row.messenger_token,
    });
    messWa = waLink(row.messenger_phone, messMsg);
  }

  return c.json({
    id: row.id,
    state: row.state,
    customer: { name: row.customer_name, phone: row.customer_phone },
    messenger: row.messenger_id ? { name: row.messenger_name, phone: row.messenger_phone } : null,
    customer_token_url: `${process.env.APP_URL}/p/c/${row.customer_token}`,
    messenger_token_url: `${process.env.APP_URL}/p/m/${row.messenger_token}`,
    whatsapp_customer: custWa,
    whatsapp_messenger: messWa,
  });
});

// ── Asignar / reasignar mensajero ────────────────────────────
deliveries.patch('/:id/assign', auth, operatorOnly, async (c) => {
  const { id } = c.req.param();
  const { messenger_id } = await c.req.json<{ messenger_id: string }>();

  const [updated] = await sql`
    UPDATE deliveries
    SET messenger_id = ${messenger_id},
        state = 'assigned',
        assigned_at = now()
    WHERE id = ${id}
    RETURNING id, state, messenger_id, customer_token, messenger_token
  `;
  if (!updated) return c.json({ error: 'No encontrado' }, 404);

  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'assigned', ${c.get('user').sub}, 'operator', 'Mensajero asignado')
  `;

  return c.json(updated);
});

// ── Mensajero: marcar en ruta ────────────────────────────────
deliveries.patch('/:id/in-transit', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries WHERE id = ${id}
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  await sql`
    UPDATE deliveries SET state = 'in_transit' WHERE id = ${id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role)
    VALUES (${id}, 'in_transit', ${user.sub}, ${user.role})
  `;
  return c.json({ state: 'in_transit' });
});

// ── Mensajero: confirmar entrega ─────────────────────────────
deliveries.patch('/:id/deliver', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries WHERE id = ${id}
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  await sql`
    UPDATE deliveries
    SET state = 'delivered', delivered_at = now(), messenger_note = ${note ?? null}
    WHERE id = ${id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'delivered', ${user.sub}, ${user.role}, ${note ?? null})
  `;
  return c.json({ state: 'delivered' });
});

// ── Cancelar ─────────────────────────────────────────────────
deliveries.patch('/:id/cancel', auth, operatorOnly, async (c) => {
  const { id } = c.req.param();
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  await sql`
    UPDATE deliveries SET state = 'cancelled', notes = ${note ?? null} WHERE id = ${id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'cancelled', ${c.get('user').sub}, 'operator', ${note ?? null})
  `;
  return c.json({ state: 'cancelled' });
});

export default deliveries;
