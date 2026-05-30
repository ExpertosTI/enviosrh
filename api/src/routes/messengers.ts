import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const messengers = new Hono();

// Listar mensajeros activos
messengers.get('/', auth, operatorOnly, async (c) => {
  const rows = await sql`
    SELECT id, name, phone, role, active, created_at
    FROM users
    WHERE role = 'messenger' AND active = true
    ORDER BY name
  `;
  return c.json(rows);
});

// Crear mensajero
messengers.post('/', auth, operatorOnly, async (c) => {
  const { name, phone, email, password } = await c.req.json<{
    name: string; phone?: string; email?: string; password: string;
  }>();

  if (!name || !password) return c.json({ error: 'Nombre y contraseña requeridos' }, 400);

  const hashed = await bcrypt.hash(password, 10);
  const [created] = await sql`
    INSERT INTO users (name, phone, email, password, role)
    VALUES (${name}, ${phone ?? null}, ${email ?? null}, ${hashed}, 'messenger')
    RETURNING id, name, phone, email, role, created_at
  `;
  return c.json(created, 201);
});

// Actualizar mensajero
messengers.patch('/:id', auth, operatorOnly, async (c) => {
  const { id } = c.req.param();
  const { name, phone, active } = await c.req.json<{
    name?: string; phone?: string; active?: boolean;
  }>();

  const [updated] = await sql`
    UPDATE users
    SET
      name   = COALESCE(${name ?? null}, name),
      phone  = COALESCE(${phone ?? null}, phone),
      active = COALESCE(${active ?? null}, active)
    WHERE id = ${id} AND role = 'messenger'
    RETURNING id, name, phone, active
  `;
  if (!updated) return c.json({ error: 'Mensajero no encontrado' }, 404);
  return c.json(updated);
});

export default messengers;
