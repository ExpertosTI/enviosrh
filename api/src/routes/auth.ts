import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { signToken } from '../lib/tokens.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email y contraseña requeridos' }, 400);
  }

  const [user] = await sql`
    SELECT id, name, email, password, role, active
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (!user || !user.active) {
    return c.json({ error: 'Credenciales incorrectas' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return c.json({ error: 'Credenciales incorrectas' }, 401);

  const token = await signToken({ sub: user.id, role: user.role, name: user.name });

  return c.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

export default auth;
