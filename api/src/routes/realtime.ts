import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import sql from '../db/index.js';
import { auth } from '../middleware/auth.js';
import { isValidUuid, isValidToken } from '../lib/validation.js';
import { subscribeDelivery, emitDeliveryEvent } from '../lib/realtime.js';

const realtime = new Hono();

function sseStream(c: any, deliveryId: string) {
  return streamSSE(c, async (stream) => {
    const unsub = subscribeDelivery(deliveryId, (event) => {
      stream.writeSSE({ data: JSON.stringify(event) });
    });
    const ping = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: '{}' });
    }, 15000);
    stream.onAbort(() => {
      clearInterval(ping);
      unsub();
    });
    // Mantener conexión abierta
    await new Promise(() => {});
  });
}

// SSE autenticado por delivery id
realtime.get('/deliveries/:id/stream', auth, async (c) => {
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
  return sseStream(c, id);
});

// SSE portal cliente
realtime.get('/p/c/:token/stream', async (c) => {
  const { token } = c.req.param();
  if (!isValidToken(token)) return c.json({ error: 'Token inválido' }, 400);
  const [row] = await sql`SELECT id FROM deliveries WHERE customer_token = ${token} LIMIT 1`;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  return sseStream(c, row.id);
});

// SSE portal mensajero
realtime.get('/p/m/:token/stream', async (c) => {
  const { token } = c.req.param();
  if (!isValidToken(token)) return c.json({ error: 'Token inválido' }, 400);
  const [row] = await sql`SELECT id FROM deliveries WHERE messenger_token = ${token} LIMIT 1`;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  return sseStream(c, row.id);
});

// Historial de ubicación de un envío
realtime.get('/deliveries/:id/location-history', auth, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  const [d] = await sql`SELECT messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${user.tenant_id}`;
  if (!d) return c.json({ error: 'No encontrado' }, 404);
  if (user.role === 'messenger' && d.messenger_id !== user.sub) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const rows = await sql`
    SELECT latitude, longitude, recorded_at
    FROM delivery_location_history
    WHERE delivery_id = ${id}
    ORDER BY recorded_at ASC
    LIMIT 500
  `;
  return c.json(rows.map(r => ({
    lat: Number(r.latitude),
    lng: Number(r.longitude),
    at: r.recorded_at,
  })));
});

// Ruta optimizada multi-parada (OSRM via coordenadas)
realtime.post('/route/optimize', auth, async (c) => {
  const { origin, stops } = await c.req.json<{
    origin: [number, number];
    stops: [number, number][];
  }>();
  if (!origin || !stops?.length) return c.json({ error: 'origin y stops requeridos' }, 400);

  // Nearest-neighbor TSP heurístico
  const remaining = [...stops];
  const ordered: [number, number][] = [];
  let current = origin;
  while (remaining.length) {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current, remaining[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    current = remaining.splice(best, 1)[0];
    ordered.push(current);
  }

  const allPoints = [origin, ...ordered];
  const coords = allPoints.map(p => `${p[1]},${p[0]}`).join(';');
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
    const data = await res.json();
    if (data.code !== 'Ok') return c.json({ ordered_stops: ordered, route: null });
    const route = data.routes[0];
    const steps = route.legs.flatMap((leg: any) =>
      leg.steps.map((s: any) => ({ instruction: s.maneuver.instruction, distance: s.distance, duration: s.duration }))
    );
    return c.json({
      ordered_stops: ordered,
      distance_km: (route.distance / 1000).toFixed(1),
      duration_min: Math.round(route.duration / 60),
      geometry: route.geometry,
      steps,
    });
  } catch {
    return c.json({ ordered_stops: ordered, route: null });
  }
});

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

export { emitDeliveryEvent };
export default realtime;
