import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { messengerMessage, customerMessage, waLink } from '../lib/whatsapp.js';
import { sendCustomerTrackingEmail, sendMessengerAssignmentEmail, sendOperatorAlertEmail } from '../lib/email.js';
import { isValidUuid } from '../lib/validation.js';

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
      d.total_amount, d.products,
      c.id    AS customer_id,
      c.name  AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.reference AS customer_reference,
      u.id   AS messenger_id,
      u.name AS messenger_name,
      u.phone AS messenger_phone,
      u.latitude AS messenger_latitude,
      u.longitude AS messenger_longitude,
      u.location_updated_at AS messenger_location_updated_at
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE
      d.tenant_id = ${user.tenant_id}
      AND ${isMessenger ? sql`d.messenger_id = ${user.sub}` : sql`1=1`}
      AND ${state ? sql`d.state = ${state}` : sql`d.state NOT IN ('cancelled')`}
      AND ${date ? sql`d.created_at::date = ${date}` : sql`1=1`}
    ORDER BY d.created_at DESC
    LIMIT 200
  `;
});

// Buscar cliente por número de teléfono
deliveries.get('/customer-by-phone/:phone', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { phone } = c.req.param();

  const [customer] = await sql`
    SELECT id, name, phone, email, address, reference, notes
    FROM customers
    WHERE phone = ${phone.trim()} AND tenant_id = ${user.tenant_id}
    LIMIT 1
  `;

  if (!customer) {
    return c.json({ found: false });
  }

  return c.json({ found: true, customer });
});

// ── Crear envío ──────────────────────────────────────────────
deliveries.post('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    customer: { name: string; phone: string; email?: string; address?: string; reference?: string; notes?: string };
    location_link?: string;
    delivery_fee?: number;
    messenger_id?: string;
    notes?: string;
    external_ref?: string;
    external_source?: string;
    total_amount?: number;
    products?: string;
  }>();

  const { customer, location_link, delivery_fee = 0, messenger_id, notes, external_ref, external_source, total_amount = 0, products } = body;

  if (!customer?.name || !customer?.phone) {
    return c.json({ error: 'Nombre y teléfono del cliente requeridos' }, 400);
  }

  if (messenger_id && !isValidUuid(messenger_id)) {
    return c.json({ error: 'ID de mensajero no válido' }, 400);
  }

  let cust: any;
  let delivery: any;
  const state = messenger_id ? 'assigned' : 'draft';

  try {
    await sql.begin(async (tx) => {
      // Upsert cliente por teléfono Y tenant_id
      const [cResult] = await tx`
        INSERT INTO customers (tenant_id, name, phone, address, reference, notes, email)
        VALUES (${user.tenant_id}, ${customer.name}, ${customer.phone}, ${customer.address ?? null}, ${customer.reference ?? null}, ${customer.notes ?? null}, ${customer.email ?? null})
        ON CONFLICT (tenant_id, phone) DO UPDATE
          SET name      = EXCLUDED.name,
              address   = COALESCE(EXCLUDED.address, customers.address),
              reference = COALESCE(EXCLUDED.reference, customers.reference),
              email     = COALESCE(EXCLUDED.email, customers.email)
        RETURNING id, name, phone, address, reference, email
      `;
      cust = cResult;

      const [dResult] = await tx`
        INSERT INTO deliveries (
          tenant_id, customer_id, location_link, delivery_fee,
          messenger_id, state, assigned_at,
          notes, external_ref, external_source, operator_id,
          total_amount, products
        ) VALUES (
          ${user.tenant_id},
          ${cust.id},
          ${location_link ?? null},
          ${delivery_fee},
          ${messenger_id ?? null},
          ${state},
          ${messenger_id ? tx`now()` : null},
          ${notes ?? null},
          ${external_ref ?? null},
          ${external_source ?? null},
          ${user.sub},
          ${total_amount},
          ${products ?? null}
        )
        RETURNING *
      `;
      delivery = dResult;

      // Registrar evento inicial
      await tx`
        INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
        VALUES (${delivery.id}, ${state}, ${user.sub}, 'operator', 'Envío creado')
      `;
    });
  } catch (err) {
    console.error('[CreateDelivery-Transaction] Error:', err);
    return c.json({ error: 'Error al registrar el envío' }, 500);
  }

  // ── Enviar Notificación por Correo al Cliente ───────────────────────
  if (cust.email) {
    sendCustomerTrackingEmail(cust.email, cust.name, delivery.customer_token, {
      address: cust.address ?? delivery.address_override ?? 'Ver portal de seguimiento'
    }).catch((err: any) => console.error('[Email-Client] Error:', err));
  }

  // ── Enviar Notificación por Correo al Mensajero ─────────────────────
  if (messenger_id) {
    const [messenger] = await sql`SELECT email, name FROM users WHERE id = ${messenger_id} AND tenant_id = ${user.tenant_id} LIMIT 1`;
    if (messenger && messenger.email) {
      sendMessengerAssignmentEmail(messenger.email, messenger.name, delivery.messenger_token, {
        customerName: cust.name,
        address: cust.address ?? delivery.address_override ?? 'Ver portal de entrega',
        fee: Number(delivery.delivery_fee)
      }).catch((err: any) => console.error('[Email-Messenger] Error:', err));
    }
  }

  return c.json({ ...delivery, customer: cust }, 201);
});

// ── Detalle de un envío ──────────────────────────────────────
deliveries.get('/:id', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);

  const [row] = await sql`
    SELECT
      d.id, d.state, d.delivery_fee,
      d.location_link, d.address_override,
      d.assigned_at, d.delivered_at, d.created_at,
      d.messenger_note, d.notes,
      d.external_ref, d.external_source,
      d.customer_confirmed, d.rating,
      d.total_amount, d.products,
      c.id    AS customer_id,
      c.name  AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.reference AS customer_reference,
      u.id   AS messenger_id,
      u.name AS messenger_name,
      u.phone AS messenger_phone,
      u.latitude AS messenger_latitude,
      u.longitude AS messenger_longitude,
      u.location_updated_at AS messenger_location_updated_at
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.id = ${id} AND d.tenant_id = ${user.tenant_id}
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
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);

  const [row] = await sql`
    SELECT d.*, c.name AS customer_name, c.phone AS customer_phone,
           c.address AS customer_address, c.reference,
           u.name AS messenger_name, u.phone AS messenger_phone
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.id = ${id} AND d.tenant_id = ${user.tenant_id}
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
    customer_token_url: `${process.env.APP_URL}/tracking/${row.customer_token}`,
    messenger_token_url: `${process.env.APP_URL}/m-portal/${row.messenger_token}`,
    whatsapp_customer: custWa,
    whatsapp_messenger: messWa,
    total_amount: Number(row.total_amount || 0),
    products: row.products ?? null,
  });
});

// ── Asignar / reasignar mensajero ────────────────────────────
deliveries.patch('/:id/assign', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);
  const { messenger_id } = await c.req.json<{ messenger_id: string | null }>();
  if (messenger_id && !isValidUuid(messenger_id)) {
    return c.json({ error: 'ID de mensajero no válido' }, 400);
  }

  const state = messenger_id ? 'assigned' : 'draft';

  const [updated] = await sql`
    UPDATE deliveries
    SET messenger_id = ${messenger_id || null},
        state = ${state},
        assigned_at = ${messenger_id ? sql`now()` : null}
    WHERE id = ${id} AND tenant_id = ${user.tenant_id}
    RETURNING id, state, messenger_id, customer_token, messenger_token, customer_id, delivery_fee, address_override
  `;
  if (!updated) return c.json({ error: 'No encontrado' }, 404);

  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'assigned', ${user.sub}, 'operator', 'Mensajero asignado')
  `;

  // ── Notificar al mensajero y cliente por correo ─────────────────────
  if (messenger_id) {
    Promise.all([
      sql`SELECT name, address, email FROM customers WHERE id = ${updated.customer_id} AND tenant_id = ${user.tenant_id} LIMIT 1`,
      sql`SELECT email, name FROM users WHERE id = ${messenger_id} AND tenant_id = ${user.tenant_id} LIMIT 1`
    ]).then(([[cust], [messenger]]) => {
      if (messenger && messenger.email) {
        sendMessengerAssignmentEmail(messenger.email, messenger.name, updated.messenger_token, {
          customerName: cust?.name ?? 'Cliente',
          address: cust?.address ?? updated.address_override ?? 'Ver portal de entrega',
          fee: Number(updated.delivery_fee)
        });
      }
      if (cust && cust.email) {
        sendCustomerTrackingEmail(cust.email, cust.name, updated.customer_token, {
          address: cust.address ?? updated.address_override ?? 'Ver portal'
        });
      }
    }).catch(err => console.error('[Email-Assign] Error:', err));
  }

  return c.json(updated);
});

// ── Mensajero: marcar en ruta ────────────────────────────────
deliveries.patch('/:id/in-transit', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${user.tenant_id}
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  await sql`
    UPDATE deliveries SET state = 'in_transit' WHERE id = ${id} AND tenant_id = ${user.tenant_id}
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
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${user.tenant_id}
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  await sql`
    UPDATE deliveries
    SET state = 'delivered', delivered_at = now(), messenger_note = ${note ?? null}
    WHERE id = ${id} AND tenant_id = ${user.tenant_id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'delivered', ${user.sub}, ${user.role}, ${note ?? null})
  `;
  return c.json({ state: 'delivered' });
});

// ── Cancelar ─────────────────────────────────────────────────
deliveries.patch('/:id/cancel', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  await sql`
    UPDATE deliveries SET state = 'cancelled' WHERE id = ${id} AND tenant_id = ${user.tenant_id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'cancelled', ${user.sub}, 'operator', ${note ?? null})
  `;

  // ── Notificar cancelación ──────────────────────────────────────────
  sql`
    SELECT d.id, c.email AS customer_email, c.name AS customer_name,
           u.email AS messenger_email, u.name AS messenger_name
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.id = ${id} AND d.tenant_id = ${user.tenant_id}
    LIMIT 1
  `.then(([info]) => {
    if (!info) return;
    const details = `El envío #${info.id.slice(0,8).toUpperCase()} ha sido cancelado por el operador. ${note ? `Motivo: ${note}` : ''}`;
    
    // Alerta al correo administrativo
    sendOperatorAlertEmail(`Envío Cancelado - #${info.id.slice(0,8).toUpperCase()}`, details);
    
    // Notificación al mensajero
    if (info.messenger_email) {
      sendOperatorAlertEmail(`Envío Cancelado - #${info.id.slice(0,8).toUpperCase()}`, `Hola ${info.messenger_name}, el envío de ${info.customer_name} asignado a tu ruta ha sido cancelado.`);
    }
  }).catch(err => console.error('[Email-Cancel] Error:', err));

  return c.json({ state: 'cancelled' });
});

export default deliveries;
