import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { signToken } from '../lib/tokens.js';

// ── Rate limiter en memoria: máx 10 intentos / 15 min por IP ─
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Limpiar entradas expiradas cada hora para no acumular memoria
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (v.resetAt < now) attempts.delete(k);
  }
}, 60 * 60 * 1000);

const auth = new Hono();

auth.post('/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
  }

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const usernameOrEmail = typeof body.email === 'string' ? body.email : (typeof body.username === 'string' ? body.username : undefined);
  const password = typeof body.password === 'string' ? body.password : undefined;

  if (!usernameOrEmail || !password) {
    return c.json({ error: 'Usuario y contraseña requeridos' }, 400);
  }

  const [user] = await sql`
    SELECT u.id, u.name, u.email, u.password, u.role, u.active, u.tenant_id,
           t.name AS tenant_name, t.slug AS tenant_slug, t.logo_url AS tenant_logo_url,
           t.primary_color AS tenant_primary_color, t.secondary_color AS tenant_secondary_color,
           t.accent_color AS tenant_accent_color, t.theme_mode AS tenant_theme_mode,
           t.contact_email AS tenant_contact_email, t.contact_phone AS tenant_contact_phone,
           t.address AS tenant_address
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.email = ${usernameOrEmail.trim().toLowerCase()}
    LIMIT 1
  `;

  // Respuesta genérica para evitar user enumeration
  if (!user || !user.active) {
    return c.json({ error: 'Credenciales incorrectas' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return c.json({ error: 'Credenciales incorrectas' }, 401);

  const token = await signToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    tenant_id: user.tenant_id
  });

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        slug: user.tenant_slug,
        logo_url: user.tenant_logo_url,
        primary_color: user.tenant_primary_color,
        secondary_color: user.tenant_secondary_color,
        accent_color: user.tenant_accent_color,
        theme_mode: user.tenant_theme_mode,
        contact_email: user.tenant_contact_email,
        contact_phone: user.tenant_contact_phone,
        address: user.tenant_address,
      }
    }
  });
});

// Registro de nuevos usuarios y creación/unión de empresa
auth.post('/register', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
  }

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const {
    name, email, password, phone,
    registerMode, companyName, companySlug, avatar_url
  } = body as {
    name?: string, email?: string, password?: string, phone?: string,
    registerMode?: 'new_company' | 'join_company' | 'customer', companyName?: string, companySlug?: string, avatar_url?: string
  };

  if (!name || !email || !password || !phone || !registerMode || !companySlug) {
    return c.json({ error: 'Todos los campos incluyendo el modo de registro y el código de empresa son requeridos' }, 400);
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

  const hashed = await bcrypt.hash(password, 10);
  const slugClean = companySlug.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();

  if (registerMode === 'new_company') {
    if (!companyName) {
      return c.json({ error: 'El nombre de la empresa es requerido' }, 400);
    }

    try {
      await sql.begin(async (tx) => {
        // Verificar si el slug ya existe
        const [existingTenant] = await tx`SELECT id FROM tenants WHERE slug = ${slugClean} LIMIT 1`;
        if (existingTenant) {
          throw new Error('SLUG_ALREADY_IN_USE');
        }

        // Crear tenant
        const [tenant] = await tx`
          INSERT INTO tenants (name, slug)
          VALUES (${companyName.trim()}, ${slugClean})
          RETURNING id
        `;

        // Insertar operador auto-aprobado y activo por ser el creador de la empresa
        await tx`
          INSERT INTO users (name, phone, email, password, role, active, tenant_id, avatar_url)
          VALUES (${name}, ${phone}, ${email}, ${hashed}, 'operator', true, ${tenant.id}, ${avatar_url || null})
        `;
      });
    } catch (err: any) {
      if (err.message === 'SLUG_ALREADY_IN_USE') {
        return c.json({ error: 'El código de empresa ya está en uso' }, 400);
      }
      console.error('[Register-Transaction] Error:', err);
      return c.json({ error: 'Error al registrar la empresa' }, 500);
    }

    return c.json({ message: 'Empresa y cuenta de administrador creadas con éxito. Ya puedes iniciar sesión.' }, 201);
  } else if (registerMode === 'customer') {
    // Registrar cliente asociado a la empresa
    const [tenant] = await sql`SELECT id FROM tenants WHERE slug = ${slugClean} LIMIT 1`;
    if (!tenant) {
      return c.json({ error: 'El código de empresa especificado no existe' }, 404);
    }

    await sql`
      INSERT INTO users (name, phone, email, password, role, active, tenant_id, avatar_url)
      VALUES (${name}, ${phone}, ${email}, ${hashed}, 'customer', true, ${tenant.id}, ${avatar_url || null})
    `;

    return c.json({ message: 'Cuenta de cliente registrada con éxito. Ya puedes iniciar sesión.' }, 201);
  } else {
    // Unirse a empresa existente como colaborador (operador o mensajero)
    const [tenant] = await sql`SELECT id FROM tenants WHERE slug = ${slugClean} LIMIT 1`;
    if (!tenant) {
      return c.json({ error: 'El código de empresa especificado no existe' }, 404);
    }

    // Insertar como pending y desactivado
    await sql`
      INSERT INTO users (name, phone, email, password, role, active, tenant_id, avatar_url)
      VALUES (${name}, ${phone}, ${email}, ${hashed}, 'pending', false, ${tenant.id}, ${avatar_url || null})
    `;

    return c.json({ message: 'Registro exitoso. Tu cuenta está a la espera de aprobación por el administrador de la empresa.' }, 201);
  }
});

export default auth;
