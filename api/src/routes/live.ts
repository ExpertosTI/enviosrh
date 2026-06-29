import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const live = new Hono();

live.get('/map', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const messengers = await sql`
    SELECT u.id, u.name, u.latitude, u.longitude, u.location_updated_at, u.status, u.avatar_url,
      (SELECT COUNT(*)::int FROM deliveries d WHERE d.messenger_id = u.id AND d.state IN ('assigned','in_transit')) AS active_deliveries
    FROM users u
    WHERE u.tenant_id = ${user.tenant_id} AND u.role = 'messenger' AND u.active = true
  `;
  const deliveries = await sql`
    SELECT d.id, d.state, d.location_link, d.messenger_id, d.at_destination_at,
      c.name AS customer_name, c.address AS customer_address
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    WHERE d.tenant_id = ${user.tenant_id} AND d.state IN ('assigned', 'in_transit')
  `;
  const [tenant] = await sql`
    SELECT name, latitude, longitude FROM tenants WHERE id = ${user.tenant_id}
  `;
  return c.json({
    messengers: messengers.map(m => ({
      ...m,
      latitude: m.latitude != null ? Number(m.latitude) : null,
      longitude: m.longitude != null ? Number(m.longitude) : null,
      active_deliveries: Number(m.active_deliveries),
    })),
    deliveries,
    tenant: tenant ? {
      name: tenant.name,
      latitude: tenant.latitude != null ? Number(tenant.latitude) : null,
      longitude: tenant.longitude != null ? Number(tenant.longitude) : null,
    } : null,
  });
});

export default live;
