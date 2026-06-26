import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';

const assignRules = new Hono();

assignRules.get('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const [row] = await sql`
    SELECT strategy, zone_priority, max_active_load, schedule_start, schedule_end, updated_at
    FROM assign_rules WHERE tenant_id = ${user.tenant_id}
  `;
  return c.json(row ?? {
    strategy: 'nearest',
    zone_priority: false,
    max_active_load: 5,
    schedule_start: null,
    schedule_end: null,
  });
});

assignRules.put('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    strategy?: string;
    zone_priority?: boolean;
    max_active_load?: number;
    schedule_start?: string | null;
    schedule_end?: string | null;
  }>();

  const [row] = await sql`
    INSERT INTO assign_rules (tenant_id, strategy, zone_priority, max_active_load, schedule_start, schedule_end, updated_at)
    VALUES (
      ${user.tenant_id},
      ${body.strategy ?? 'nearest'},
      ${body.zone_priority ?? false},
      ${body.max_active_load ?? 5},
      ${body.schedule_start ?? null},
      ${body.schedule_end ?? null},
      now()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      strategy = EXCLUDED.strategy,
      zone_priority = EXCLUDED.zone_priority,
      max_active_load = EXCLUDED.max_active_load,
      schedule_start = EXCLUDED.schedule_start,
      schedule_end = EXCLUDED.schedule_end,
      updated_at = now()
    RETURNING *
  `;
  return c.json(row);
});

export default assignRules;
