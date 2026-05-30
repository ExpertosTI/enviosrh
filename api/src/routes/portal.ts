import { Hono } from 'hono';
import sql from '../db/index.js';

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
      d.messenger_note,
      c.name AS customer_name,
      u.name AS messenger_name
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.customer_token = ${token}
    LIMIT 1
  `;
  if (!row) return c.json({ error: 'Envío no encontrado' }, 404);

  return c.json({
    state: row.state,
    customer_name: row.customer_name,
    messenger_name: row.messenger_name,
    delivery_fee: Number(row.delivery_fee),
    assigned_at: row.assigned_at,
    delivered_at: row.delivered_at,
    customer_confirmed: row.customer_confirmed,
    rated: !!row.rating,
  });
});

// ── Portal cliente: confirmar recepción ───────────────────────
portal.post('/c/:token/confirm', async (c) => {
  const { token } = c.req.param();

  const [row] = await sql`
    SELECT id, state FROM deliveries WHERE customer_token = ${token} LIMIT 1
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  if (row.state !== 'delivered') {
    return c.json({ error: 'El envío aún no ha sido marcado como entregado' }, 409);
  }

  await sql`
    UPDATE deliveries
    SET customer_confirmed = true, customer_confirmed_at = now()
    WHERE id = ${row.id}
  `;
  await sql`
    INSERT INTO delivery_events (delivery_id, state, actor_role, note)
    VALUES (${row.id}, 'delivered', 'customer', 'Cliente confirmó recepción')
  `;
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

export default portal;
