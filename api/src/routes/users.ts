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

// Actualizar ubicación en tiempo real (mensajero)
users.post('/location', auth, async (c) => {
  const user = c.get('user');
  const { latitude, longitude } = await c.req.json<{ latitude: number; longitude: number }>();

  if (latitude === undefined || longitude === undefined) {
    return c.json({ error: 'Latitud y longitud requeridas' }, 400);
  }

  const [updated] = await sql`
    UPDATE users
    SET latitude = ${latitude},
        longitude = ${longitude},
        location_updated_at = now()
    WHERE id = ${user.sub}
    RETURNING id, name, latitude, longitude, location_updated_at
  `;

  if (!updated) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  return c.json(updated);
});

export default users;
