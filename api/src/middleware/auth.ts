import { createMiddleware } from 'hono/factory';
import { verifyToken, type TokenPayload } from '../lib/tokens.js';

type Variables = { user: TokenPayload };

export const auth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return c.json({ error: 'No autorizado' }, 401);

  try {
    const payload = await verifyToken(token);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});

export const operatorOnly = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const user = c.get('user');
  if (user?.role !== 'operator') {
    return c.json({ error: 'Solo operadores pueden realizar esta acción' }, 403);
  }
  await next();
});
