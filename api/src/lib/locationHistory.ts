import sql from '../db/index.js';
import { emitDeliveryEvent } from './realtime.js';

export async function recordMessengerLocation(
  messengerId: string,
  latitude: number,
  longitude: number,
) {
  const [active] = await sql`
    SELECT id FROM deliveries
    WHERE messenger_id = ${messengerId} AND state = 'in_transit'
    ORDER BY assigned_at DESC
    LIMIT 1
  `;
  if (!active) return;

  await sql`
    INSERT INTO delivery_location_history (delivery_id, messenger_id, latitude, longitude)
    VALUES (${active.id}, ${messengerId}, ${latitude}, ${longitude})
  `;

  emitDeliveryEvent(active.id, {
    type: 'location',
    data: { latitude, longitude, messenger_id: messengerId, at: new Date().toISOString() },
  });
}
