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

export default auth;
