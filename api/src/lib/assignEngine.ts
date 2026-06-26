import sql from '../db/index.js';

export type AssignStrategy = 'nearest' | 'least_load' | 'zone' | 'round_robin';

interface MessengerRow {
  id: string;
  name: string;
  latitude: string | number | null;
  longitude: string | number | null;
  active_count: number;
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371;
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

function inSchedule(start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return mins >= s && mins <= e;
  return mins >= s || mins <= e;
}

export async function pickMessenger(
  tenantId: string,
  destCoords: [number, number] | null,
  areaZone?: string | null,
) {
  const [rules] = await sql`
    SELECT strategy, zone_priority, max_active_load, schedule_start, schedule_end
    FROM assign_rules WHERE tenant_id = ${tenantId}
  `;
  const strategy = (rules?.strategy ?? 'nearest') as AssignStrategy;
  const maxLoad = Number(rules?.max_active_load ?? 5);
  if (rules && !inSchedule(rules.schedule_start, rules.schedule_end)) {
    return null;
  }

  let messengers: MessengerRow[] = await sql`
    SELECT u.id, u.name, u.latitude, u.longitude,
      (SELECT COUNT(*)::int FROM deliveries d2
       WHERE d2.messenger_id = u.id AND d2.state IN ('assigned','in_transit')) AS active_count
    FROM users u
    WHERE u.tenant_id = ${tenantId} AND u.role = 'messenger' AND u.active = true
      AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
  `;
  messengers = messengers.filter(m => Number(m.active_count) < maxLoad);
  if (!messengers.length) return null;

  if (strategy === 'zone' && areaZone && rules?.zone_priority) {
    const zoneFiltered = messengers.filter(() => true);
    if (zoneFiltered.length) messengers = zoneFiltered;
  }

  if (strategy === 'least_load') {
    return messengers.reduce((a, b) => (Number(a.active_count) <= Number(b.active_count) ? a : b));
  }

  if (strategy === 'round_robin') {
    const [last] = await sql`
      SELECT messenger_id FROM deliveries
      WHERE tenant_id = ${tenantId} AND messenger_id IS NOT NULL
      ORDER BY assigned_at DESC NULLS LAST LIMIT 1
    `;
    const idx = last ? messengers.findIndex(m => m.id === last.messenger_id) : -1;
    return messengers[(idx + 1) % messengers.length];
  }

  let best = messengers[0];
  let bestScore = Infinity;
  for (const m of messengers) {
    const dist = destCoords
      ? haversine(destCoords, [Number(m.latitude), Number(m.longitude)])
      : 0;
    const score = dist + Number(m.active_count) * 2;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}
