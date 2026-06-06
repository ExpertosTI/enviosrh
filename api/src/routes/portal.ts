import { Hono } from 'hono';
import sql from '../db/index.js';
import { sendOperatorAlertEmail } from '../lib/email.js';

/** Rutas públicas: no requieren JWT. Usan tokens firmados de BD. */
const portal = new Hono();

// ── Portal cliente: ver estado ────────────────────────────────
portal.get('/c/:token', async (c) => {
  const { token } = c.req.param();

  const [row] = await sql`
    SELECT
      d.id, d.state, d.delivery_fee,
      d.assigned_at, d.delivered_at,
      d.customer_confirmed, d.rating,
      d.messenger_note, d.notes,
      d.pre_confirmed, d.address_override,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.reference AS customer_reference,
      u.name AS messenger_name,
      u.phone AS messenger_phone,
      u.latitude AS messenger_latitude,
      u.longitude AS messenger_longitude,
      u.location_updated_at AS messenger_location_updated_at
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.customer_token = ${token}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'Envío no encontrado' }, 404);

  return c.json({
    id: row.id,
    state: row.state,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_address: row.address_override ?? row.customer_address ?? '',
    customer_reference: row.customer_reference ?? '',
    notes: row.notes,
    delivery_note: row.messenger_note,
    messenger_name: row.messenger_name,
    messenger_phone: row.messenger_phone,
    messenger_latitude: row.messenger_latitude ? Number(row.messenger_latitude) : null,
    messenger_longitude: row.messenger_longitude ? Number(row.messenger_longitude) : null,
    messenger_location_updated_at: row.messenger_location_updated_at,
    delivery_fee: Number(row.delivery_fee),
    assigned_at: row.assigned_at,
    delivered_at: row.delivered_at,
    customer_confirmed: row.customer_confirmed,
    pre_confirmed: row.pre_confirmed,
    can_confirm: row.state === 'delivered' && !row.customer_confirmed,
    rating: row.rating,
  });
});

// ── Portal cliente: pre-confirmar pedido antes de salir de tienda ──
portal.post('/c/:token/pre-confirm', async (c) => {
  const { token } = c.req.param();

  const [row] = await sql`
    SELECT id, pre_confirmed FROM deliveries WHERE customer_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  if (row.pre_confirmed) return c.json({ ok: true, message: 'Pedido ya pre-confirmado' });

  await sql`
    UPDATE deliveries
    SET pre_confirmed = true,
        pre_confirmed_at = now()
    WHERE id = ${row.id}
  `;

  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_role, note)
    VALUES (${row.id}, 'draft', 'customer', 'Cliente pre-confirmó datos del envío')
  `;

  // Enviar alerta de pre-confirmación a la tienda/administradores
  sendOperatorAlertEmail(
    `Envío Pre-confirmado - #${row.id.slice(0,8).toUpperCase()}`,
    `El cliente ha pre-confirmado y aceptado los detalles del envío #${row.id}. Ya puede ser despachado de la tienda.`
  ).catch((err) => console.error('[Email-PreConfirm] Error:', err));

  return c.json({ ok: true });
});

// ── Portal cliente: confirmar recepción ───────────────────────
portal.post('/c/:token/confirm', async (c) => {
  const { token } = c.req.param();
  const { rating } = await c.req.json<{ rating?: number }>().catch(() => ({ rating: undefined }));

  const [row] = await sql`
    SELECT id, state FROM deliveries WHERE customer_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  if (row.state !== 'delivered') {
    return c.json({ error: 'El envío aún no ha sido marcado como entregado' }, 409);
  }

  await sql`
    UPDATE deliveries
    SET customer_confirmed = true,
        customer_confirmed_at = now(),
        rating = COALESCE(${rating ?? null}, rating)
    WHERE id = ${row.id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_role, note)
    VALUES (${row.id}, 'delivered', 'customer', 'Cliente confirmó recepción')
  `;

  // Alerta de confirmación por correo
  sendOperatorAlertEmail(
    `Entrega Confirmada por Cliente - Envío #${row.id.slice(0,8).toUpperCase()}`,
    `El cliente ha confirmado la recepción del envío #${row.id} en el portal público. Calificación: ${rating ?? 'N/A'} estrellas.`
  ).catch(err => console.error('[Email-Confirm] Error:', err));

  return c.json({ ok: true });
});

// ── Portal cliente: calificar ─────────────────────────────────
portal.post('/c/:token/rate', async (c) => {
  const { token } = c.req.param();
  const { rating, note } = await c.req.json<{ rating: number; note?: string }>();

  if (!rating || rating < 1 || rating > 5) {
    return c.json({ error: 'Calificación debe ser entre 1 y 5' }, 400);
  }

  const [row] = await sql`
    SELECT id, state, rating FROM deliveries WHERE customer_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  if (row.rating) return c.json({ error: 'Ya calificado' }, 409);

  await sql`
    UPDATE deliveries
    SET rating = ${rating}, rating_note = ${note ?? null}
    WHERE id = ${row.id}
  `;

  // Alerta de calificación por correo
  sendOperatorAlertEmail(
    `Nueva Calificación de Cliente - Envío #${row.id.slice(0,8).toUpperCase()}`,
    `El cliente del envío #${row.id} ha enviado una calificación.\nCalificación: ${rating} estrellas.\nComentario: ${note ?? 'Ninguno'}`
  ).catch(err => console.error('[Email-Rate] Error:', err));

  return c.json({ ok: true });
});

// ── Portal mensajero: ver detalle del envío ───────────────────
portal.get('/m/:token', async (c) => {
  const { token } = c.req.param();

  const [row] = await sql`
    SELECT
      d.id, d.state, d.delivery_fee, d.location_link,
      d.address_override, d.notes,
      c.name AS customer_name, c.phone AS customer_phone,
      c.address AS customer_address, c.reference AS customer_reference
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    WHERE d.messenger_token = ${token}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);

  const address = row.address_override ?? row.customer_address ?? '';
  const q = encodeURIComponent(address);
  const googleUrl = row.location_link
    ? row.location_link
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
  const wazeUrl = row.location_link
    ? row.location_link
    : `https://waze.com/ul?q=${q}&navigate=yes`;

  return c.json({
    id: row.id,
    state: row.state,
    delivery_fee: Number(row.delivery_fee),
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      address,
      reference: row.customer_reference,
    },
    notes: row.notes,
    nav_google: googleUrl,
    nav_waze: wazeUrl,
  });
});

// ── Portal mensajero: marcar en ruta ─────────────────────────
portal.post('/m/:token/in-transit', async (c) => {
  const { token } = c.req.param();

  const [row] = await sql`
    SELECT id, state, messenger_id FROM deliveries WHERE messenger_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'Envío no encontrado' }, 404);
  if (row.state !== 'assigned') {
    return c.json({ error: 'El envío no está asignado' }, 409);
  }

  await sql`
    UPDATE deliveries SET state = 'in_transit' WHERE id = ${row.id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${row.id}, 'in_transit', ${row.messenger_id}, 'messenger', 'Mensajero inició entrega via portal')
  `;
  return c.json({ ok: true, state: 'in_transit' });
});

// ── Portal mensajero: marcar entregado ───────────────────────
portal.post('/m/:token/deliver', async (c) => {
  const { token } = c.req.param();
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  const [row] = await sql`
    SELECT id, state, messenger_id FROM deliveries WHERE messenger_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'Envío no encontrado' }, 404);
  if (row.state !== 'in_transit') {
    return c.json({ error: 'El envío no está en tránsito' }, 409);
  }

  await sql`
    UPDATE deliveries
    SET state = 'delivered', delivered_at = now(), messenger_note = ${note ?? null}
    WHERE id = ${row.id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
    VALUES (${row.id}, 'delivered', ${row.messenger_id}, 'messenger', ${note ?? 'Mensajero confirmó entrega via portal'})
  `;
  return c.json({ ok: true, state: 'delivered' });
});

// ── Portal mensajero: actualizar ubicación ───────────────────
portal.post('/m/:token/location', async (c) => {
  const { token } = c.req.param();
  const { latitude, longitude } = await c.req.json<{ latitude: number; longitude: number }>();

  if (latitude === undefined || longitude === undefined) {
    return c.json({ error: 'Coordenadas requeridas' }, 400);
  }

  const [updated] = await sql`
    UPDATE users
    SET latitude = ${latitude},
        longitude = ${longitude},
        location_updated_at = now()
    WHERE id = (SELECT messenger_id FROM deliveries WHERE messenger_token = ${token} LIMIT 1)
    RETURNING id, name, latitude, longitude
  `;

  if (!updated) {
    return c.json({ error: 'Mensajero no asignado' }, 404);
  }

  return c.json({ ok: true });
});

export default portal;
