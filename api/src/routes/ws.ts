import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import sql from '../db/index.js';
import { auth } from '../middleware/auth.js';
import { isValidUuid, isValidToken } from '../lib/validation.js';
import { subscribeDelivery, type RealtimeEvent } from '../lib/realtime.js';

type UpgradeWebSocket = ReturnType<typeof import('@hono/node-ws').createNodeWebSocket>['upgradeWebSocket'];

function deliveryWs(deliveryId: string) {
  return () => ({
    onOpen(_evt: Event, ws: WSContext) {
      const unsub = subscribeDelivery(deliveryId, (event: RealtimeEvent) => {
        ws.send(JSON.stringify(event));
      });
      (ws as WSContext & { _unsub?: () => void })._unsub = unsub;
    },
    onClose(_evt: CloseEvent, ws: WSContext) {
      (ws as WSContext & { _unsub?: () => void })._unsub?.();
    },
  });
}

export function registerWsRoutes(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
  app.get('/deliveries/:id/ws', auth, async (c, next) => {
    const user = c.get('user');
    const { id } = c.req.param();
    if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);
    const [d] = await sql`
      SELECT id, messenger_id FROM deliveries
      WHERE id = ${id} AND tenant_id = ${user.tenant_id} LIMIT 1
    `;
    if (!d) return c.json({ error: 'No encontrado' }, 404);
    if (user.role === 'messenger' && d.messenger_id !== user.sub) {
      return c.json({ error: 'No autorizado' }, 403);
    }
    return upgradeWebSocket(deliveryWs(id))(c, next);
  });

  app.get('/p/c/:token/ws', async (c, next) => {
    const { token } = c.req.param();
    if (!isValidToken(token)) return c.json({ error: 'Token inválido' }, 400);
    const [row] = await sql`SELECT id FROM deliveries WHERE customer_token = ${token} LIMIT 1`;
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return upgradeWebSocket(deliveryWs(row.id))(c, next);
  });

  app.get('/p/m/:token/ws', async (c, next) => {
    const { token } = c.req.param();
    if (!isValidToken(token)) return c.json({ error: 'Token inválido' }, 400);
    const [row] = await sql`SELECT id FROM deliveries WHERE messenger_token = ${token} LIMIT 1`;
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return upgradeWebSocket(deliveryWs(row.id))(c, next);
  });
}
