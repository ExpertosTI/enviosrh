import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const analytics = new Hono();

analytics.get('/dashboard', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const days = Math.min(Number(c.req.query('days') ?? 14), 90);

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total_deliveries,
      COUNT(*) FILTER (WHERE state = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE state = 'in_transit')::int AS in_transit,
      COALESCE(AVG(rating) FILTER (WHERE rating IS NOT NULL), 0) AS avg_rating,
      COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS total_fees,
      COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at))/60) FILTER (WHERE delivered_at IS NOT NULL AND assigned_at IS NOT NULL), 0) AS avg_delivery_minutes
    FROM deliveries
    WHERE tenant_id = ${user.tenant_id}
      AND created_at >= now() - ${days}::int * interval '1 day'
  `;

  const daily = await sql`
    SELECT
      created_at::date AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE state = 'delivered')::int AS delivered,
      COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS fees
    FROM deliveries
    WHERE tenant_id = ${user.tenant_id}
      AND created_at >= now() - ${days}::int * interval '1 day'
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const topMessengers = await sql`
    SELECT u.id, u.name,
      COUNT(d.id)::int AS deliveries,
      COALESCE(AVG(d.rating) FILTER (WHERE d.rating IS NOT NULL), 0) AS avg_rating
    FROM users u
    JOIN deliveries d ON d.messenger_id = u.id
    WHERE u.tenant_id = ${user.tenant_id} AND d.state = 'delivered'
      AND d.created_at >= now() - ${days}::int * interval '1 day'
    GROUP BY u.id, u.name
    ORDER BY deliveries DESC
    LIMIT 10
  `;

  return c.json({
    summary: {
      total_deliveries: summary.total_deliveries,
      delivered: summary.delivered,
      in_transit: summary.in_transit,
      avg_rating: Number(summary.avg_rating),
      total_fees: Number(summary.total_fees),
      avg_delivery_minutes: Math.round(Number(summary.avg_delivery_minutes)),
    },
    daily: daily.map(d => ({ ...d, fees: Number(d.fees) })),
    top_messengers: topMessengers.map(m => ({ ...m, avg_rating: Number(m.avg_rating) })),
  });
});

// Export data for payroll / reports
analytics.get('/export', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);

  const rows = await sql`
    SELECT
      d.id, d.state, d.delivery_fee, d.delivered_at, d.created_at,
      c.name AS customer_name, c.phone AS customer_phone,
      u.name AS messenger_name, u.phone AS messenger_phone,
      d.rating, d.rating_note, d.total_amount, d.products
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.tenant_id = ${user.tenant_id}
      AND d.created_at::date = ${date}::date
    ORDER BY d.created_at ASC
  `;
  return c.json(rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee), total_amount: Number(r.total_amount || 0) })));
});

export default analytics;
