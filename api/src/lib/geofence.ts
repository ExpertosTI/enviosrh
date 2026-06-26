import sql from '../db/index.js';
import { emitDeliveryEvent } from './realtime.js';
import { notifyDelivery } from './pushNotify.js';

const ARRIVAL_RADIUS_M = Number(process.env.GEOFENCE_RADIUS_M ?? 80);

function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Detecta llegada al destino y notifica al cliente */
export async function checkGeofenceArrival(
  messengerId: string,
  latitude: number,
  longitude: number,
) {
  const active = await sql`
    SELECT d.id, d.location_link, d.at_destination_at, d.customer_token
    FROM deliveries d
    WHERE d.messenger_id = ${messengerId}
      AND d.state = 'in_transit'
      AND d.at_destination_at IS NULL
  `;

  for (const d of active) {
    const dest = parseCoords(d.location_link);
    if (!dest) continue;
    const dist = haversineM(dest, [latitude, longitude]);
    if (dist > ARRIVAL_RADIUS_M) continue;

    await sql`
      UPDATE deliveries SET at_destination_at = now() WHERE id = ${d.id}
    `;
    await sql`
      INSERT INTO delivery_events (delivery_id, state, actor_id, actor_role, note)
      VALUES (${d.id}, 'in_transit', ${messengerId}, 'messenger', 'Geofence: mensajero en destino')
    `;
    emitDeliveryEvent(d.id, {
      type: 'state',
      data: { state: 'at_destination', at_destination_at: new Date().toISOString() },
    });
    await notifyDelivery(d.id, {
      title: '¡Tu repartidor llegó!',
      body: 'El mensajero está en tu ubicación.',
      url: `/tracking/${d.customer_token}`,
    }, ['customer']);
  }
}
