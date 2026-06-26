import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const billing = new Hono();

billing.get('/summary', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const from = c.req.query('from') ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);

  const [totals] = await sql`
    SELECT
      COUNT(*)::int AS deliveries,
      COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS fees,
      COALESCE(SUM(total_amount) FILTER (WHERE state = 'delivered'), 0) AS sales
    FROM deliveries
    WHERE tenant_id = ${user.tenant_id}
      AND created_at::date BETWEEN ${from}::date AND ${to}::date
  `;

  const commissions = await sql`
    SELECT u.id, u.name,
      COUNT(d.id)::int AS deliveries,
      COALESCE(SUM(d.delivery_fee) FILTER (WHERE d.state = 'delivered'), 0) AS fees
    FROM users u
    LEFT JOIN deliveries d ON d.messenger_id = u.id
      AND d.state = 'delivered'
      AND d.created_at::date BETWEEN ${from}::date AND ${to}::date
    WHERE u.tenant_id = ${user.tenant_id} AND u.role = 'messenger'
    GROUP BY u.id, u.name
    ORDER BY deliveries DESC
  `;

  const rate = Number(process.env.MESSENGER_COMMISSION_RATE ?? 0.15);
  const messenger_commissions = commissions.map(m => ({
    id: m.id,
    name: m.name,
    deliveries: m.deliveries,
    fees: Number(m.fees),
    commission: Number((Number(m.fees) * rate).toFixed(2)),
  }));

  return c.json({
    period: { from, to },
    totals: {
      deliveries: totals.deliveries,
      fees: Number(totals.fees),
      sales: Number(totals.sales),
    },
    messenger_commissions,
    commission_rate: rate,
  });
});

billing.post('/close', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { from, to } = await c.req.json<{ from: string; to: string }>();
  if (!from || !to) return c.json({ error: 'from y to requeridos' }, 400);

  const [totals] = await sql`
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS fees
    FROM deliveries
    WHERE tenant_id = ${user.tenant_id}
      AND created_at::date BETWEEN ${from}::date AND ${to}::date
  `;

  const rate = Number(process.env.MESSENGER_COMMISSION_RATE ?? 0.15);
  const commissions = await sql`
    SELECT u.id, u.name, COUNT(d.id)::int AS deliveries,
      COALESCE(SUM(d.delivery_fee) FILTER (WHERE d.state = 'delivered'), 0) AS fees
    FROM users u
    LEFT JOIN deliveries d ON d.messenger_id = u.id
      AND d.state = 'delivered'
      AND d.created_at::date BETWEEN ${from}::date AND ${to}::date
    WHERE u.tenant_id = ${user.tenant_id} AND u.role = 'messenger'
    GROUP BY u.id, u.name
  `;

  const messenger_commissions = commissions.map(m => ({
    id: m.id,
    name: m.name,
    deliveries: m.deliveries,
    fees: Number(m.fees),
    commission: Number((Number(m.fees) * rate).toFixed(2)),
  }));

  const [row] = await sql`
    INSERT INTO billing_periods (tenant_id, period_start, period_end, total_deliveries, total_fees, messenger_commissions, closed_at)
    VALUES (${user.tenant_id}, ${from}, ${to}, ${totals.cnt}, ${totals.fees}, ${sql.json(messenger_commissions)}, now())
    RETURNING *
  `;
  return c.json(row, 201);
});

billing.get('/periods', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, period_start, period_end, total_deliveries, total_fees, messenger_commissions, closed_at, created_at
    FROM billing_periods
    WHERE tenant_id = ${user.tenant_id}
    ORDER BY period_start DESC
    LIMIT 24
  `;
  return c.json(rows.map(r => ({
    ...r,
    total_fees: Number(r.total_fees),
    messenger_commissions: r.messenger_commissions,
  })));
});

export default billing;
