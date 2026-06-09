import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidUuid } from '../lib/validation.js';
import { sendEmployeeWelcomeEmail } from '../lib/email.js';

const users = new Hono();

// Registrar un nuevo colaborador directamente por el administrador
users.post('/', auth, operatorOnly, async (c) => {
  const adminUser = c.get('user');
  const { name, email, phone, role } = await c.req.json<{
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  }>();

  if (!name || !email || !role) {
    return c.json({ error: 'Nombre, email y rol son requeridos' }, 400);
  }

  if (role !== 'operator' && role !== 'messenger') {
    return c.json({ error: 'Rol inválido. Debe ser operator o messenger.' }, 400);
  }

  // Validar formato de email
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ error: 'Formato de correo electrónico inválido' }, 400);
  }

  // Verificar si el correo ya existe
  const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing) {
    return c.json({ error: 'El correo ya está registrado' }, 400);
  }

  // Generar contraseña temporal legible (8 caracteres en mayúsculas)
  const tempPassword = Math.random().toString(36).substring(2, 10).toUpperCase();
  const hashed = await bcrypt.hash(tempPassword, 10);

  // Obtener datos del tenant para el correo
  const [tenant] = await sql`
    SELECT name, slug FROM tenants WHERE id = ${adminUser.tenant_id} LIMIT 1
  `;
  const tenantName = tenant?.name ?? 'EnvíosRH';
  const tenantSlug = tenant?.slug ?? 'enviosrh';

  // Insertar usuario directamente activo
  const [newUser] = await sql`
    INSERT INTO users (name, phone, email, password, role, active, tenant_id)
    VALUES (${name.trim()}, ${phone?.trim() || null}, ${email.trim().toLowerCase()}, ${hashed}, ${role}, true, ${adminUser.tenant_id})
    RETURNING id, name, email, role, active, created_at
  `;

  // Enviar el correo de confirmación de forma asíncrona
  sendEmployeeWelcomeEmail(
    newUser.email,
    newUser.name,
    newUser.role,
    tempPassword,
    tenantName,
    tenantSlug
  ).catch(err => {
    console.error('[Welcome-Email] Error en envío de correo:', err);
  });

  return c.json({
    message: 'Colaborador registrado exitosamente y correo de confirmación enviado.',
    user: newUser,
    tempPassword, // Se devuelve la contraseña temporal para que el administrador la vea o copie
  }, 201);
});

// Listar usuarios pendientes
users.get('/pending', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, name, phone, email, role, active, created_at
    FROM users
    WHERE role = 'pending' AND tenant_id = ${user.tenant_id}
    ORDER BY created_at ASC
    LIMIT 200
  `;
  return c.json(rows);
});

// Aprobar usuario (asignar rol definitivo y activar)
users.patch('/:id/approve', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de usuario no válido' }, 400);
  const { role } = await c.req.json<{ role: string }>();

  if (role !== 'operator' && role !== 'messenger') {
    return c.json({ error: 'Rol inválido. Debe ser operator o messenger.' }, 400);
  }

  const [updated] = await sql`
    UPDATE users
    SET role = ${role}, active = true
    WHERE id = ${id} AND role = 'pending' AND tenant_id = ${user.tenant_id}
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
    WHERE id = ${user.sub} AND tenant_id = ${user.tenant_id}
    RETURNING id, name, latitude, longitude, location_updated_at
  `;

  if (!updated) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  return c.json(updated);
});

// Obtener estadísticas avanzadas del negocio y directorio de personas
users.get('/admin-dashboard', auth, operatorOnly, async (c) => {
  const user = c.get('user');

  // 1. Estadísticas generales
  const [totalDeliveriesRow] = await sql`SELECT count(*)::integer AS total FROM deliveries WHERE tenant_id = ${user.tenant_id}`;
  const [activeMessengersRow] = await sql`SELECT count(*)::integer AS total FROM users WHERE role = 'messenger' AND active = true AND tenant_id = ${user.tenant_id}`;
  const [activeSellersRow] = await sql`SELECT count(*)::integer AS total FROM users WHERE role = 'operator' AND active = true AND tenant_id = ${user.tenant_id}`;
  const [totalCustomersRow] = await sql`SELECT count(*)::integer AS total FROM customers WHERE tenant_id = ${user.tenant_id}`;
  const [totalFeesRow] = await sql`SELECT COALESCE(sum(delivery_fee), 0)::numeric AS total FROM deliveries WHERE tenant_id = ${user.tenant_id}`;
  
  const stateCounts = await sql`
    SELECT state, count(*)::integer AS count
    FROM deliveries
    WHERE tenant_id = ${user.tenant_id}
    GROUP BY state
  `;

  // 2. Vendedores (operadores)
  const sellers = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.created_at, count(d.id)::integer AS deliveries_created
    FROM users u
    LEFT JOIN deliveries d ON d.operator_id = u.id AND d.tenant_id = ${user.tenant_id}
    WHERE u.role = 'operator' AND u.tenant_id = ${user.tenant_id}
    GROUP BY u.id
    ORDER BY deliveries_created DESC, u.name ASC
    LIMIT 200
  `;

  // 3. Mensajeros
  const messengersList = await sql`
    SELECT 
      u.id, u.name, u.email, u.phone, u.active, u.created_at,
      u.latitude, u.longitude, u.location_updated_at,
      count(CASE WHEN d.state = 'delivered' THEN 1 END)::integer AS deliveries_completed,
      count(d.id)::integer AS deliveries_total,
      COALESCE(avg(d.rating), 0)::numeric(3,2) AS average_rating
    FROM users u
    LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${user.tenant_id}
    WHERE u.role = 'messenger' AND u.tenant_id = ${user.tenant_id}
    GROUP BY u.id
    ORDER BY deliveries_completed DESC, u.name ASC
    LIMIT 200
  `;

  // 4. Clientes
  const customersList = await sql`
    SELECT 
      c.id, c.name, c.email, c.phone, c.address, c.reference, c.created_at,
      count(d.id)::integer AS deliveries_received,
      count(CASE WHEN d.state = 'delivered' THEN 1 END)::integer AS deliveries_delivered
    FROM customers c
    LEFT JOIN deliveries d ON d.customer_id = c.id AND d.tenant_id = ${user.tenant_id}
    WHERE c.tenant_id = ${user.tenant_id}
    GROUP BY c.id
    ORDER BY deliveries_received DESC, c.name ASC
    LIMIT 250
  `;

  return c.json({
    stats: {
      total_deliveries: totalDeliveriesRow?.total ?? 0,
      active_messengers: activeMessengersRow?.total ?? 0,
      active_sellers: activeSellersRow?.total ?? 0,
      total_customers: totalCustomersRow?.total ?? 0,
      total_fees: Number(totalFeesRow?.total ?? 0),
      states: stateCounts,
    },
    sellers,
    messengers: messengersList,
    customers: customersList,
  });
});

export default users;
