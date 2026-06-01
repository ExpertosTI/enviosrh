import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const users = new Hono();

// Listar usuarios pendientes
users.get('/pending', auth, operatorOnly, async (c) => {
  const rows = await sql`
    SELECT id, name, phone, email, role, active, created_at
    FROM users
    WHERE role = 'pending'
    ORDER BY created_at ASC
  `;
  return c.json(rows);
});

// Aprobar usuario (asignar rol definitivo y activar)
users.patch('/:id/approve', auth, operatorOnly, async (c) => {
  const { id } = c.req.param();
  const { role } = await c.req.json<{ role: string }>();

  if (role !== 'operator' && role !== 'messenger') {
    return c.json({ error: 'Rol inválido. Debe ser operator o messenger.' }, 400);
  }

  const [updated] = await sql`
    UPDATE users
    SET role = ${role}, active = true
    WHERE id = ${id} AND role = 'pending'
    RETURNING id, name, email, role, active
  `;

  if (!updated) {
    return c.json({ error: 'Usuario no encontrado o ya aprobado' }, 404);
  }

  return c.json(updated);
});

export default users;
