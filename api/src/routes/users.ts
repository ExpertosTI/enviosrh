import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidUuid } from '../lib/validation.js';
import { sendEmployeeWelcomeEmail } from '../lib/email.js';
import { recordMessengerLocation } from '../lib/locationHistory.js';
import { checkGeofenceArrival } from '../lib/geofence.js';

const users = new Hono();

// Registrar un nuevo colaborador directamente por el administrador
users.post('/', auth, operatorOnly, async (c) => {
  const adminUser = c.get('user');
  const { name, email, phone, role, avatar_url } = await c.req.json<{
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    avatar_url?: string;
  }>();

  if (!name || !email || !role) {
    return c.json({ error: 'Nombre, email y rol son requeridos' }, 400);
  }

  if (role !== 'operator' && role !== 'messenger') {
    return c.json({ error: 'Rol inválido. Debe ser operator o messenger.' }, 400);
  }

  // Validar formato de email o usuario
  if (!/^\S+@\S+\.\S+$/.test(email) && !/^[a-zA-Z0-9_.-]{3,30}$/.test(email)) {
    return c.json({ error: 'El identificador debe ser un correo válido o un nombre de usuario de 3 a 30 caracteres (letras, números, _, -, .)' }, 400);
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
    INSERT INTO users (name, phone, email, password, role, active, tenant_id, avatar_url)
    VALUES (${name.trim()}, ${phone?.trim() || null}, ${email.trim().toLowerCase()}, ${hashed}, ${role}, true, ${adminUser.tenant_id}, ${avatar_url || null})
    RETURNING id, name, email, role, active, created_at, avatar_url
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

// Obtener perfil del propio usuario autenticado (Operador o Mensajero)
users.get('/profile', auth, async (c) => {
  const session = c.get('user');
  const [profile] = await sql`
    SELECT id, name, email, phone, role, avatar_url, status
    FROM users
    WHERE id = ${session.sub} AND tenant_id = ${session.tenant_id}
    LIMIT 1
  `;
  if (!profile) return c.json({ error: 'Usuario no encontrado' }, 404);
  return c.json(profile);
});

// Actualizar el perfil del propio usuario autenticado (Operador o Mensajero)
users.patch('/profile', auth, async (c) => {
  const session = c.get('user');
  const { name, phone, email, password, avatar_url, status } = await c.req.json<{
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    avatar_url?: string;
    status?: string;
  }>();

  const userId = session.sub;

  if (email) {
    if (!/^\S+@\S+\.\S+$/.test(email) && !/^[a-zA-Z0-9_.-]{3,30}$/.test(email)) {
      return c.json({ error: 'El identificador debe ser un correo válido o un nombre de usuario de 3 a 30 caracteres (letras, números, _, -, .)' }, 400);
    }
    const [existing] = await sql`
      SELECT id FROM users WHERE email = ${email.trim().toLowerCase()} AND id != ${userId} LIMIT 1
    `;
    if (existing) {
      return c.json({ error: 'El correo electrónico ya está en uso' }, 400);
    }
  }

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.trim() || null;
  if (email !== undefined) updates.email = email.trim().toLowerCase();
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (status !== undefined) updates.status = status;

  if (password) {
    if (password.length < 6) {
      return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No se enviaron datos para actualizar' }, 400);
  }

  const [updatedUser] = await sql`
    UPDATE users
    SET ${sql(updates)}
    WHERE id = ${userId}
    RETURNING id, name, email, phone, role, avatar_url, status
  `;

  return c.json({
    message: 'Perfil actualizado correctamente',
    user: updatedUser
  });
});

// Listar usuarios pendientes
users.get('/pending', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, name, phone, email, role, active, created_at, avatar_url
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
  const { latitude, longitude, battery_level, signal_quality } = await c.req.json<{
    latitude: number;
    longitude: number;
    battery_level?: number;
    signal_quality?: string;
  }>();

  if (latitude === undefined || longitude === undefined) {
    return c.json({ error: 'Latitud y longitud requeridas' }, 400);
  }

  const [updated] = await sql`
    UPDATE users
    SET latitude = ${latitude},
        longitude = ${longitude},
        location_updated_at = now(),
        battery_level = COALESCE(${battery_level ?? null}, battery_level),
        signal_quality = COALESCE(${signal_quality ?? null}, signal_quality)
    WHERE id = ${user.sub} AND tenant_id = ${user.tenant_id}
    RETURNING id, name, latitude, longitude, location_updated_at, battery_level, signal_quality
  `;

  if (!updated) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  if (user.role === 'messenger') {
    await recordMessengerLocation(user.sub, latitude, longitude);
    await checkGeofenceArrival(user.sub, latitude, longitude);
  }

  return c.json(updated);
});

// Actualizar ubicaciones en lote (para sincronización offline)
users.post('/location/bulk', auth, async (c) => {
  const user = c.get('user');
  const { locations } = await c.req.json<{
    locations: { latitude: number; longitude: number; timestamp: number; battery_level?: number; signal_quality?: string }[];
  }>();

  if (!Array.isArray(locations) || locations.length === 0) {
    return c.json({ error: 'Listado de ubicaciones vacío o inválido' }, 400);
  }

  // Ordenar por timestamp de forma descendente para obtener el reporte más reciente
  const sorted = [...locations].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0];

  const [updated] = await sql`
    UPDATE users
    SET latitude = ${latest.latitude},
        longitude = ${latest.longitude},
        location_updated_at = ${new Date(latest.timestamp)},
        battery_level = COALESCE(${latest.battery_level ?? null}, battery_level),
        signal_quality = COALESCE(${latest.signal_quality ?? null}, signal_quality)
    WHERE id = ${user.sub} AND tenant_id = ${user.tenant_id}
    RETURNING id, name, latitude, longitude, location_updated_at, battery_level, signal_quality
  `;

  return c.json({ ok: true, updated });
});

// Obtener estadísticas avanzadas del negocio y directorio de personas
users.get('/admin-dashboard', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { startDate, endDate } = c.req.query();

  // Filtro de fecha para las consultas de envíos
  let dateFilter = sql`1=1`;
  if (startDate && endDate) {
    dateFilter = sql`d.created_at >= ${startDate}::timestamp AND d.created_at <= ${endDate}::timestamp`;
  } else if (startDate) {
    dateFilter = sql`d.created_at >= ${startDate}::timestamp`;
  } else if (endDate) {
    dateFilter = sql`d.created_at <= ${endDate}::timestamp`;
  }

  // 1. Estadísticas generales filtradas por fecha
  const [totalDeliveriesRow] = await sql`SELECT count(*)::integer AS total FROM deliveries d WHERE d.tenant_id = ${user.tenant_id} AND ${dateFilter}`;
  const [activeMessengersRow] = await sql`SELECT count(*)::integer AS total FROM users WHERE role = 'messenger' AND active = true AND tenant_id = ${user.tenant_id}`;
  const [activeSellersRow] = await sql`SELECT count(*)::integer AS total FROM users WHERE role = 'operator' AND active = true AND tenant_id = ${user.tenant_id}`;
  const [totalCustomersRow] = await sql`SELECT count(*)::integer AS total FROM customers WHERE tenant_id = ${user.tenant_id}`;
  const [totalFeesRow] = await sql`SELECT COALESCE(sum(d.delivery_fee), 0)::numeric AS total FROM deliveries d WHERE d.tenant_id = ${user.tenant_id} AND ${dateFilter}`;
  
  const stateCounts = await sql`
    SELECT d.state, count(*)::integer AS count
    FROM deliveries d
    WHERE d.tenant_id = ${user.tenant_id} AND ${dateFilter}
    GROUP BY d.state
  `;

  // 2. Vendedores (operadores) con envíos creados en el rango
  const sellers = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.created_at, count(d.id)::integer AS deliveries_created
    FROM users u
    LEFT JOIN deliveries d ON d.operator_id = u.id AND d.tenant_id = ${user.tenant_id} AND ${dateFilter}
    WHERE u.role = 'operator' AND u.tenant_id = ${user.tenant_id}
    GROUP BY u.id
    ORDER BY deliveries_created DESC, u.name ASC
    LIMIT 200
  `;

  // 3. Mensajeros con su estado y estadísticas en el rango
  const messengersList = await sql`
    SELECT 
      u.id, u.name, u.email, u.phone, u.active, u.created_at,
      u.latitude, u.longitude, u.location_updated_at,
      u.avatar_url, u.status, u.battery_level, u.signal_quality,
      count(CASE WHEN d.state = 'delivered' THEN 1 END)::integer AS deliveries_completed,
      count(d.id)::integer AS deliveries_total,
      COALESCE(avg(d.rating), 0)::numeric(3,2) AS average_rating
    FROM users u
    LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${user.tenant_id} AND ${dateFilter}
    WHERE u.role = 'messenger' AND u.tenant_id = ${user.tenant_id}
    GROUP BY u.id, u.name, u.email, u.phone, u.active, u.created_at, u.latitude, u.longitude, u.location_updated_at, u.avatar_url, u.status, u.battery_level, u.signal_quality
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
    LEFT JOIN deliveries d ON d.customer_id = c.id AND d.tenant_id = ${user.tenant_id} AND ${dateFilter}
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
  });
});

// Editar un usuario (colaborador) por el administrador
users.patch('/:id', auth, operatorOnly, async (c) => {
  const adminUser = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de usuario no válido' }, 400);

  const { name, email, phone, role, active, status, password } = await c.req.json<{
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    active?: boolean;
    status?: string;
    password?: string;
  }>();

  // Verificar que el usuario a editar existe y pertenece al mismo tenant
  const [existingUser] = await sql`
    SELECT id FROM users WHERE id = ${id} AND tenant_id = ${adminUser.tenant_id} LIMIT 1
  `;
  if (!existingUser) {
    return c.json({ error: 'Usuario no encontrado o no pertenece a su empresa' }, 404);
  }

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.trim() || null;
  if (email !== undefined) {
    const emailLower = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailLower) && !/^[a-zA-Z0-9_.-]{3,30}$/.test(emailLower)) {
      return c.json({ error: 'El identificador debe ser un correo válido o un nombre de usuario de 3 a 30 caracteres' }, 400);
    }
    // Verificar unicidad
    const [dup] = await sql`
      SELECT id FROM users WHERE email = ${emailLower} AND id != ${id} LIMIT 1
    `;
    if (dup) {
      return c.json({ error: 'El usuario o correo ya está registrado por otra cuenta' }, 400);
    }
    updates.email = emailLower;
  }
  if (role !== undefined) {
    if (role !== 'operator' && role !== 'messenger' && role !== 'pending') {
      return c.json({ error: 'Rol inválido' }, 400);
    }
    updates.role = role;
  }
  if (active !== undefined) updates.active = active;
  if (status !== undefined) updates.status = status;
  if (password) {
    if (password.length < 6) {
      return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No se enviaron datos para actualizar' }, 400);
  }

  const [updatedUser] = await sql`
    UPDATE users
    SET ${sql(updates)}
    WHERE id = ${id} AND tenant_id = ${adminUser.tenant_id}
    RETURNING id, name, email, phone, role, active, status, created_at
  `;

  return c.json({
    message: 'Usuario actualizado correctamente',
    user: updatedUser
  });
});

// Eliminar un usuario (colaborador) por el administrador
users.delete('/:id', auth, operatorOnly, async (c) => {
  const adminUser = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID de usuario no válido' }, 400);

  // Evitar que el administrador se elimine a sí mismo
  if (id === adminUser.sub) {
    return c.json({ error: 'No puedes eliminar tu propia cuenta' }, 400);
  }

  const [deleted] = await sql`
    DELETE FROM users
    WHERE id = ${id} AND tenant_id = ${adminUser.tenant_id}
    RETURNING id, name, email
  `;

  if (!deleted) {
    return c.json({ error: 'Usuario no encontrado o no pertenece a su empresa' }, 404);
  }

  return c.json({
    message: 'Usuario eliminado exitosamente',
    user: deleted
  });
});

export default users;
