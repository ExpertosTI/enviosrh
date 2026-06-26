import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { messengerMessage, customerMessage, waLink } from '../lib/whatsapp.js';
import { sendCustomerTrackingEmail, sendMessengerAssignmentEmail, sendOperatorAlertEmail } from '../lib/email.js';
import { isValidUuid } from '../lib/validation.js';
import { emitDeliveryEvent, setTyping } from '../lib/realtime.js';
import { recordMessengerLocation } from '../lib/locationHistory.js';

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
      d.total_amount, d.products, d.area_zone,
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
  return c.json(rows);
});

// Buscar cliente por número de teléfono
deliveries.get('/customer-by-phone/:phone', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { phone } = c.req.param();

  const [customer] = await sql`
    SELECT id, name, phone, email, address, reference, notes, area_zone
    FROM customers
    WHERE phone = ${phone.trim()} AND tenant_id = ${user.tenant_id}
    LIMIT 1
  `;

  if (!customer) {
    return c.json({ found: false });
  }

  return c.json({ found: true, customer });
});

// ── Resolver URL corta de Google Maps → coordenadas ──────────
// Necesario para maps.app.goo.gl, goo.gl/maps, etc. (CORS bloqueado en cliente)
deliveries.get('/resolve-maps-url', auth, async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'URL requerida' }, 400);

  try {
    // Seguir redirects hasta obtener la URL final con coordenadas
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EnviosApp/1.0)' }
    });

    const location = response.headers.get('location') ?? '';

    // Intentar extraer coordenadas de la URL final
    const patterns = [
      // @lat,lng,zoom
      /@([-\d.]+),([-\d.]+)/,
      // ?q=lat,lng
      /[?&]q=([-\d.]+),([-\d.]+)/,
      // /place/.../lat,lng
      /\/([-\d.]+),([-\d.]+)/,
      // ll=lat,lng
      /ll=([-\d.]+),([-\d.]+)/,
    ];

    for (const pattern of patterns) {
      const match = location.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          return c.json({ ok: true, lat, lng, resolved_url: location });
        }
      }
    }

    // Si la URL final no tiene coordenadas visibles, devolver la URL resuelta
    // para que el cliente pueda intentar parsearla
    return c.json({ ok: false, resolved_url: location || url, message: 'No se pudieron extraer coordenadas automáticamente' });
  } catch (err) {
    console.error('[resolve-maps-url]', err);
    return c.json({ ok: false, message: 'No se pudo resolver la URL' }, 200);
  }
});

// ── Guardar / actualizar cliente sin crear envío ─────────────
deliveries.post('/save-customer', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { name, phone, email, address, reference, area_zone } = await c.req.json<{
    name?: string; phone: string; email?: string; address?: string; reference?: string; area_zone?: string;
  }>();

  if (!phone?.trim()) return c.json({ error: 'Teléfono requerido' }, 400);

  const [existing] = await sql`
    SELECT id FROM customers WHERE phone = ${phone.trim()} AND tenant_id = ${user.tenant_id} LIMIT 1
  `;

  if (existing) {
    await sql`
      UPDATE customers SET
        name      = COALESCE(${name ?? null}, name),
        email     = COALESCE(${email ?? null}, email),
        address   = COALESCE(${address ?? null}, address),
        reference = COALESCE(${reference ?? null}, reference),
        area_zone = COALESCE(${area_zone ?? null}, area_zone)
      WHERE id = ${existing.id}
    `;
    return c.json({ ok: true, updated: true, id: existing.id });
  }

  const [created] = await sql`
    INSERT INTO customers (name, phone, email, address, reference, area_zone, tenant_id)
    VALUES (${name ?? ''}, ${phone.trim()}, ${email ?? null}, ${address ?? null}, ${reference ?? null}, ${area_zone ?? null}, ${user.tenant_id})
    RETURNING id
  `;
  return c.json({ ok: true, updated: false, id: created.id });
});

// ── Crear envío ──────────────────────────────────────────────
deliveries.post('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    customer: { name: string; phone: string; email?: string; address?: string; reference?: string; notes?: string; area_zone?: string };
    location_link?: string;
    delivery_fee?: number;
    messenger_id?: string;
    notes?: string;
    external_ref?: string;
    external_source?: string;
    total_amount?: number;
    products?: string;
    scheduled_at?: string | null;
    area_zone?: string;
  }>();

  const { customer, location_link, delivery_fee = 0, messenger_id, notes, external_ref, external_source, total_amount = 0, products, scheduled_at, area_zone } = body;

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
        INSERT INTO customers (tenant_id, name, phone, address, reference, notes, email, area_zone)
        VALUES (${user.tenant_id}, ${customer.name}, ${customer.phone}, ${customer.address ?? null}, ${customer.reference ?? null}, ${customer.notes ?? null}, ${customer.email ?? null}, ${area_zone ?? customer.area_zone ?? null})
        ON CONFLICT (tenant_id, phone) DO UPDATE
          SET name      = EXCLUDED.name,
              address   = COALESCE(EXCLUDED.address, customers.address),
              reference = COALESCE(EXCLUDED.reference, customers.reference),
              email     = COALESCE(EXCLUDED.email, customers.email),
              area_zone = COALESCE(EXCLUDED.area_zone, customers.area_zone)
        RETURNING id, name, phone, address, reference, email, area_zone
      `;
      cust = cResult;

      const [dResult] = await tx`
        INSERT INTO deliveries (
          tenant_id, customer_id, location_link, delivery_fee,
          messenger_id, state, assigned_at,
          notes, external_ref, external_source, operator_id,
          total_amount, products, scheduled_at, area_zone
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
          ${products ?? null},
          ${scheduled_at ?? null},
          ${area_zone ?? customer.area_zone ?? null}
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

// Obtener envíos del propio cliente (rol customer)
deliveries.get('/my-deliveries', auth, async (c) => {
  const session = c.get('user');

  if (session.role !== 'customer') {
    return c.json({ error: 'Solo los clientes autorizados pueden ver sus envíos' }, 403);
  }

  const [profile] = await sql`
    SELECT phone FROM users WHERE id = ${session.sub} LIMIT 1
  `;

  if (!profile || !profile.phone) {
    return c.json({ error: 'El perfil no tiene un número de teléfono asociado' }, 400);
  }

  const rows = await sql`
    SELECT 
      d.id, d.state, d.delivery_fee, d.location_link, d.address_override,
      d.assigned_at, d.delivered_at, d.created_at, d.notes,
      d.proof_img, d.proof_signature, d.total_amount, d.products, d.area_zone,
      c.name AS customer_name, c.phone AS customer_phone,
      c.address AS customer_address, c.reference AS customer_reference,
      u.name AS messenger_name, u.phone AS messenger_phone,
      u.latitude AS messenger_latitude, u.longitude AS messenger_longitude,
      u.location_updated_at AS messenger_location_updated_at
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE c.phone = ${profile.phone} AND d.tenant_id = ${session.tenant_id}
    ORDER BY d.created_at DESC
    LIMIT 100
  `;

  return c.json(rows);
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
      d.total_amount, d.products, d.area_zone,
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
    area_zone: row.area_zone ?? null,
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
  emitDeliveryEvent(id, { type: 'state', data: { state: 'in_transit' } });
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

// ── Chat autenticado: listar mensajes ────────────────────────
deliveries.get('/:id/messages', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries
    WHERE id = ${id} AND tenant_id = ${user.tenant_id}
    LIMIT 1
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const messages = await sql`
    SELECT id, sender, message, created_at, read_at
    FROM delivery_messages
    WHERE delivery_id = ${id}
    ORDER BY created_at ASC
  `;
  return c.json(messages);
});

deliveries.post('/:id/messages/read', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  const [delivery] = await sql`SELECT messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${user.tenant_id}`;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const readerSender = user.role === 'messenger' ? 'customer' : 'messenger';
  const updated = await sql`
    UPDATE delivery_messages SET read_at = now()
    WHERE delivery_id = ${id} AND sender = ${readerSender} AND read_at IS NULL
    RETURNING id
  `;
  if (updated.length) {
    emitDeliveryEvent(id, { type: 'read', data: { messageIds: updated.map(m => m.id), reader: user.role } });
  }
  return c.json({ ok: true, count: updated.length });
});

deliveries.post('/:id/typing', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const { typing } = await c.req.json<{ typing: boolean }>();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  const [delivery] = await sql`SELECT messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${user.tenant_id}`;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }
  setTyping(id, user.role === 'messenger' ? 'messenger' : 'operator', !!typing);
  return c.json({ ok: true });
});

// ── Auto-asignar según reglas configurables ─────────
deliveries.post('/:id/auto-assign', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  const [delivery] = await sql`
    SELECT d.id, d.location_link, d.area_zone
    FROM deliveries d
    WHERE d.id = ${id} AND d.tenant_id = ${user.tenant_id}
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);

  const { pickMessenger } = await import('../lib/assignEngine.js');
  const destCoords = parseCoords(delivery.location_link);
  const best = await pickMessenger(user.tenant_id, destCoords, delivery.area_zone);

  if (!best) return c.json({ error: 'No hay mensajeros disponibles' }, 404);

  await sql`
    UPDATE deliveries SET messenger_id = ${best.id}, state = 'assigned', assigned_at = now()
    WHERE id = ${id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${id}, 'assigned', ${user.sub}, 'operator', ${'Auto-asignado a ' + best.name})
  `;
  const { notifyDelivery } = await import('../lib/pushNotify.js');
  await notifyDelivery(id, { title: 'Nuevo envío', body: `Asignado a ${best.name}` }, ['messenger']);
  return c.json({ ok: true, messenger_id: best.id, messenger_name: best.name });
});

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = (b[0]-a[0])*Math.PI/180, dLng = (b[1]-a[1])*Math.PI/180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// ── Chat autenticado: enviar mensaje ─────────────────────────
deliveries.post('/:id/messages', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de envío no válido' }, 400);
  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) return c.json({ error: 'Mensaje vacío' }, 400);

  const [delivery] = await sql`
    SELECT id, messenger_id FROM deliveries
    WHERE id = ${id} AND tenant_id = ${user.tenant_id}
    LIMIT 1
  `;
  if (!delivery) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && delivery.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const sender = user.role === 'messenger' ? 'messenger' : 'operator';
  const [msg] = await sql`
    INSERT INTO delivery_messages (delivery_id, sender, message)
    VALUES (${id}, ${sender}, ${message.trim()})
    RETURNING id, sender, message, created_at, read_at
  `;
  emitDeliveryEvent(id, { type: 'message', data: msg });
  return c.json(msg, 201);
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
