import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidUuid } from '../lib/validation.js';

const messengers = new Hono();

// Listar mensajeros activos
messengers.get('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, name, phone, role, active, created_at
    FROM users
    WHERE role = 'messenger' AND active = true AND tenant_id = ${user.tenant_id}
    ORDER BY name
    LIMIT 200
  `;
  return c.json(rows);
});

// Crear mensajero
messengers.post('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { name, phone, email, password } = await c.req.json<{
    name: string; phone?: string; email?: string; password: string;
  }>();

  if (!name || !password) return c.json({ error: 'Nombre y contraseña requeridos' }, 400);

  const hashed = await bcrypt.hash(password, 10);
  const [created] = await sql`
    INSERT INTO users (name, phone, email, password, role, tenant_id)
    VALUES (${name}, ${phone ?? null}, ${email ?? null}, ${hashed}, 'messenger', ${user.tenant_id})
    RETURNING id, name, phone, email, role, created_at
  `;
  return c.json(created, 201);
});

// Actualizar mensajero
messengers.patch('/:id', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de mensajero no válido' }, 400);
  const { name, phone, active } = await c.req.json<{
    name?: string; phone?: string; active?: boolean;
  }>();

  const [updated] = await sql`
    UPDATE users
    SET
      name   = COALESCE(${name ?? null}, name),
      phone  = COALESCE(${phone ?? null}, phone),
      active = COALESCE(${active ?? null}, active)
    WHERE id = ${id} AND role = 'messenger' AND tenant_id = ${user.tenant_id}
    RETURNING id, name, phone, active
  `;
  if (!updated) return c.json({ error: 'Mensajero no encontrado' }, 404);
  return c.json(updated);
});

// Obtener reporte de efectivo recolectado por mensajeros
messengers.get('/cash-reports', auth, operatorOnly, async (c) => {
  const user = c.get('user');

  const rows = await sql`
    SELECT 
      u.id AS messenger_id,
      u.name AS messenger_name,
      u.phone AS messenger_phone,
      u.avatar_url AS messenger_avatar,
      COALESCE(SUM(CASE WHEN d.cash_settled = false THEN d.total_amount + d.delivery_fee ELSE 0 END), 0)::numeric AS unsettled_cash,
      COALESCE(SUM(CASE WHEN d.cash_settled = true THEN d.total_amount + d.delivery_fee ELSE 0 END), 0)::numeric AS settled_cash,
      COUNT(CASE WHEN d.cash_settled = false THEN 1 END)::integer AS unsettled_count
    FROM users u
    LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.state = 'delivered'
    WHERE u.role = 'messenger' AND u.tenant_id = ${user.tenant_id}
    GROUP BY u.id, u.name, u.phone, u.avatar_url
    ORDER BY unsettled_cash DESC, u.name ASC
  `;

  return c.json(rows);
});

// Liquidar efectivo recaudado por un mensajero
messengers.post('/cash-settle', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { messenger_id } = await c.req.json<{ messenger_id: string }>();

  if (!messenger_id || !isValidUuid(messenger_id)) {
    return c.json({ error: 'ID de mensajero no válido' }, 400);
  }

  await sql`
    UPDATE deliveries
    SET cash_settled = true,
        cash_settled_at = now()
    WHERE messenger_id = ${messenger_id}
      AND tenant_id = ${user.tenant_id}
      AND state = 'delivered'
      AND cash_settled = false
  `;

  return c.json({ ok: true, message: 'Efectivo liquidado correctamente' });
});

export default messengers;
