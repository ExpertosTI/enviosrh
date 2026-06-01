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
  const email = typeof body.email === 'string' ? body.email : undefined;
  const password = typeof body.password === 'string' ? body.password : undefined;

  if (!email || !password) {
    return c.json({ error: 'Email y contraseña requeridos' }, 400);
  }

  const [user] = await sql`
    SELECT id, name, email, password, role, active
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  // Respuesta genérica para evitar user enumeration
  if (!user || !user.active) {
    return c.json({ error: 'Credenciales incorrectas' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return c.json({ error: 'Credenciales incorrectas' }, 401);

  const token = await signToken({ sub: user.id, role: user.role, name: user.name });

  return c.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// Registro de nuevos usuarios (estado pending)
auth.post('/register', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
  }

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { name, email, password, phone } = body as { name?: string, email?: string, password?: string, phone?: string };

  if (!name || !email || !password || !phone) {
    return c.json({ error: 'Nombre, teléfono, email y contraseña son requeridos' }, 400);
  }

  // Verificar si el correo ya existe
  const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing) {
    return c.json({ error: 'El correo ya está registrado' }, 400);
  }

  const hashed = await bcrypt.hash(password, 10);
  
  // Insertar como pending y desactivado
  await sql`
    INSERT INTO users (name, phone, email, password, role, active)
    VALUES (${name}, ${phone}, ${email}, ${hashed}, 'pending', false)
  `;

  return c.json({ message: 'Registro exitoso. Tu cuenta está a la espera de aprobación por un administrador.' }, 201);
});

export default auth;
