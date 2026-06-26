import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidUuid } from '../lib/validation.js';

const zones = new Hono();

zones.get('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, name, polygon, delivery_fee, color, active, created_at
    FROM coverage_zones
    WHERE tenant_id = ${user.tenant_id}
    ORDER BY name ASC
  `;
  return c.json(rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) })));
});

zones.post('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { name, polygon, delivery_fee = 0, color = '#5b8af9' } = await c.req.json<{
    name: string; polygon: unknown; delivery_fee?: number; color?: string;
  }>();
  if (!name?.trim() || !polygon) return c.json({ error: 'Nombre y polígono requeridos' }, 400);

  const [row] = await sql`
    INSERT INTO coverage_zones (tenant_id, name, polygon, delivery_fee, color)
    VALUES (${user.tenant_id}, ${name.trim()}, ${sql.json(polygon as never)}, ${delivery_fee}, ${color})
    RETURNING *
  `;
  return c.json({ ...row, delivery_fee: Number(row.delivery_fee) }, 201);
});

zones.patch('/:id', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);
  const body = await c.req.json<{ name?: string; polygon?: unknown; delivery_fee?: number; color?: string; active?: boolean }>();

  if (body.polygon !== undefined) {
    const [row] = await sql`
      UPDATE coverage_zones SET
        name = COALESCE(${body.name ?? null}, name),
        polygon = ${sql.json(body.polygon as never)},
        delivery_fee = COALESCE(${body.delivery_fee ?? null}, delivery_fee),
        color = COALESCE(${body.color ?? null}, color),
        active = COALESCE(${body.active ?? null}, active)
      WHERE id = ${id} AND tenant_id = ${user.tenant_id}
      RETURNING *
    `;
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json({ ...row, delivery_fee: Number(row.delivery_fee) });
  }

  const [row] = await sql`
    UPDATE coverage_zones SET
      name = COALESCE(${body.name ?? null}, name),
      delivery_fee = COALESCE(${body.delivery_fee ?? null}, delivery_fee),
      color = COALESCE(${body.color ?? null}, color),
      active = COALESCE(${body.active ?? null}, active)
    WHERE id = ${id} AND tenant_id = ${user.tenant_id}
    RETURNING *
  `;
  if (!row) return c.json({ error: 'No encontrado' }, 404);
  return c.json({ ...row, delivery_fee: Number(row.delivery_fee) });
});

zones.delete('/:id', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);
  await sql`DELETE FROM coverage_zones WHERE id = ${id} AND tenant_id = ${user.tenant_id}`;
  return c.json({ ok: true });
});

// Detectar zona por punto (lat, lng)
zones.get('/lookup', auth, async (c) => {
  const user = c.get('user');
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'lat y lng requeridos' }, 400);

  const rows = await sql`
    SELECT id, name, delivery_fee, color, polygon
    FROM coverage_zones
    WHERE tenant_id = ${user.tenant_id} AND active = true
  `;

  // Ray-casting point-in-polygon
  function inside(poly: [number, number][], x: number, y: number) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  for (const z of rows) {
    const poly = (z.polygon as { coordinates?: [number, number][] })?.coordinates
      ?? (z.polygon as [number, number][]);
    if (Array.isArray(poly) && inside(poly, lng, lat)) {
      return c.json({ found: true, zone: { id: z.id, name: z.name, delivery_fee: Number(z.delivery_fee), color: z.color } });
    }
  }
  return c.json({ found: false });
});

export default zones;
