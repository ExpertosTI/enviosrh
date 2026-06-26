import { Hono } from 'hono';
import sql from '../db/index.js';
import { getVapidPublicKey } from '../lib/pushNotify.js';
import { isValidToken } from '../lib/validation.js';

const push = new Hono();

push.get('/vapid-public-key', (c) => {
  const key = getVapidPublicKey();
  if (!key) return c.json({ enabled: false });
  return c.json({ enabled: true, publicKey: key });
});

push.post('/subscribe', async (c) => {
  const { endpoint, keys, delivery_id, role, user_id } = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
    delivery_id?: string;
    role: 'customer' | 'messenger' | 'operator';
    user_id?: string;
  }>();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'Suscripción inválida' }, 400);
  }

  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth_key, delivery_id, role, user_id)
    VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth}, ${delivery_id ?? null}, ${role}, ${user_id ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      delivery_id = EXCLUDED.delivery_id,
      role = EXCLUDED.role
  `;
  return c.json({ ok: true });
});

push.post('/device-token', async (c) => {
  const { token, platform, role, delivery_id, user_id } = await c.req.json<{
    token: string;
    platform: 'android' | 'ios' | 'web';
    role: 'customer' | 'messenger' | 'operator';
    delivery_id?: string;
    user_id?: string;
  }>();
  if (!token || !platform || !role) return c.json({ error: 'Datos incompletos' }, 400);

  await sql`
    INSERT INTO device_push_tokens (token, platform, role, delivery_id, user_id)
    VALUES (${token}, ${platform}, ${role}, ${delivery_id ?? null}, ${user_id ?? null})
    ON CONFLICT (token) DO UPDATE SET
      platform = EXCLUDED.platform,
      role = EXCLUDED.role,
      delivery_id = EXCLUDED.delivery_id,
      user_id = EXCLUDED.user_id
  `;
  return c.json({ ok: true });
});

push.post('/p/:token/subscribe', async (c) => {
  const { token } = c.req.param();
  const { endpoint, keys, role } = await c.req.json<{
    endpoint: string; keys: { p256dh: string; auth: string }; role: 'customer' | 'messenger';
  }>();
  if (!isValidToken(token)) return c.json({ error: 'Token inválido' }, 400);

  const [row] = role === 'customer'
    ? await sql`SELECT id FROM deliveries WHERE customer_token = ${token} LIMIT 1`
    : await sql`SELECT id FROM deliveries WHERE messenger_token = ${token} LIMIT 1`;
  if (!row) return c.json({ error: 'No encontrado' }, 404);

  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth_key, delivery_id, role)
    VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth}, ${row.id}, ${role})
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      delivery_id = EXCLUDED.delivery_id,
      role = EXCLUDED.role
  `;
  return c.json({ ok: true });
});

// Mapa en vivo movido a /live/map
export default push;
