import sql from '../db/index.js';
import type { TokenPayload } from './tokens.js';
import { assertAllowedToolName, sanitizeToolArgs } from './aiSecurity.js';
import { EXTENDED_AI_TOOL_DEFINITIONS, executeExtendedAiTool } from './aiToolsExtended.js';
import { USER_AI_TOOL_DEFINITIONS, executeUserAiTool } from './aiToolsUsers.js';

export interface AiToolContext {
  user: TokenPayload;
  tenantId: string;
}

export const AI_TOOL_DEFINITIONS = [
  {
    name: 'get_dashboard_stats',
    description: 'Resumen de envíos: totales, entregados, en tránsito, pendientes, ingresos y calificación promedio.',
    parameters: { type: 'object', properties: { days: { type: 'number', description: 'Días hacia atrás (default 7)' } } },
  },
  {
    name: 'list_deliveries',
    description: 'Lista envíos filtrados por estado. Estados: draft, assigned, in_transit, delivered, cancelled.',
    parameters: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Estado del envío' },
        limit: { type: 'number', description: 'Máximo de resultados (default 10)' },
      },
    },
  },
  {
    name: 'search_delivery',
    description: 'Busca un envío por nombre de cliente, teléfono o ID.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto de búsqueda' } },
      required: ['query'],
    },
  },
  {
    name: 'list_messengers',
    description: 'Lista mensajeros activos con envíos en curso y entregados hoy.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_zones',
    description: 'Zonas de cobertura configuradas.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_assign_rules',
    description: 'Reglas de auto-asignación del tenant.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_billing_summary',
    description: 'Resumen de facturación y comisiones del período actual.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'my_deliveries',
    description: 'Envíos asignados al mensajero actual (solo rol mensajero).',
    parameters: {
      type: 'object',
      properties: { state: { type: 'string', description: 'Filtrar por estado' } },
    },
  },
] as const;

export const ALL_AI_TOOL_DEFINITIONS = [...AI_TOOL_DEFINITIONS, ...EXTENDED_AI_TOOL_DEFINITIONS, ...USER_AI_TOOL_DEFINITIONS];

export async function executeAiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AiToolContext,
): Promise<unknown> {
  assertAllowedToolName(name);
  const safeArgs = sanitizeToolArgs(name, args);
  const { tenantId, user } = ctx;

  switch (name) {
    case 'get_dashboard_stats': {
      const days = Math.min(Number(safeArgs.days ?? 7), 90);
      const [s] = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE state = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE state IN ('assigned','in_transit'))::int AS active,
          COUNT(*) FILTER (WHERE state = 'draft')::int AS pending,
          COUNT(*) FILTER (WHERE state = 'cancelled')::int AS cancelled,
          COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS fees,
          COALESCE(AVG(rating) FILTER (WHERE rating IS NOT NULL), 0) AS avg_rating
        FROM deliveries
        WHERE tenant_id = ${tenantId}
          AND created_at >= now() - ${days}::int * interval '1 day'
      `;
      return {
        period_days: days,
        total: s.total,
        delivered: s.delivered,
        active: s.active,
        pending: s.pending,
        cancelled: s.cancelled,
        total_fees: Number(s.fees),
        avg_rating: Number(Number(s.avg_rating).toFixed(2)),
      };
    }

    case 'list_deliveries': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const limit = Math.min(Number(safeArgs.limit ?? 10), 25);
      const state = safeArgs.state as string | undefined;
      const rows = state
        ? await sql`
            SELECT d.id, d.state, d.delivery_fee, d.created_at, d.assigned_at,
              c.name AS customer_name, c.phone AS customer_phone,
              u.name AS messenger_name
            FROM deliveries d
            JOIN customers c ON c.id = d.customer_id
            LEFT JOIN users u ON u.id = d.messenger_id
            WHERE d.tenant_id = ${tenantId} AND d.state = ${state}
            ORDER BY d.created_at DESC LIMIT ${limit}
          `
        : await sql`
            SELECT d.id, d.state, d.delivery_fee, d.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              u.name AS messenger_name
            FROM deliveries d
            JOIN customers c ON c.id = d.customer_id
            LEFT JOIN users u ON u.id = d.messenger_id
            WHERE d.tenant_id = ${tenantId}
            ORDER BY d.created_at DESC LIMIT ${limit}
          `;
      return rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
    }

    case 'search_delivery': {
      const q = String(safeArgs.query ?? '').trim();
      if (!q) return { error: 'Query vacío' };
      const like = `%${q}%`;
      const rows = await sql`
        SELECT d.id, d.state, d.delivery_fee, d.created_at, d.external_ref, d.messenger_id,
          c.name AS customer_name, c.phone AS customer_phone, c.address,
          u.name AS messenger_name
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.tenant_id = ${tenantId}
          AND (
            c.name ILIKE ${like} OR c.phone ILIKE ${like}
            OR d.id::text ILIKE ${like} OR d.external_ref ILIKE ${like}
          )
        ORDER BY d.created_at DESC LIMIT 8
      `;
      if (user.role === 'messenger') {
        return rows
          .filter(r => r.messenger_id === user.sub)
          .map(({ messenger_id: _, ...r }) => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
      }
      return rows.map(({ messenger_id: _, ...r }) => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
    }

    case 'list_messengers': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const rows = await sql`
        SELECT u.id, u.name, u.phone, u.active,
          COUNT(d.id) FILTER (WHERE d.state IN ('assigned','in_transit'))::int AS active_deliveries,
          COUNT(d.id) FILTER (WHERE d.state = 'delivered' AND d.delivered_at::date = CURRENT_DATE)::int AS delivered_today
        FROM users u
        LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${tenantId}
        WHERE u.tenant_id = ${tenantId} AND u.role = 'messenger'
        GROUP BY u.id
        ORDER BY active_deliveries DESC, u.name ASC
      `;
      return rows;
    }

    case 'get_zones': {
      const rows = await sql`
        SELECT id, name, color, active, delivery_fee
        FROM coverage_zones
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `;
      return rows.map(z => ({ ...z, delivery_fee: Number(z.delivery_fee) }));
    }

    case 'get_assign_rules': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const [row] = await sql`
        SELECT strategy, zone_priority, max_active_load, schedule_start, schedule_end
        FROM assign_rules WHERE tenant_id = ${tenantId}
      `;
      return row ?? { strategy: 'nearest', zone_priority: false, max_active_load: 5 };
    }

    case 'get_billing_summary': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const rate = Number(process.env.MESSENGER_COMMISSION_RATE ?? 0.15);
      const [s] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE state = 'delivered')::int AS delivered,
          COALESCE(SUM(delivery_fee) FILTER (WHERE state = 'delivered'), 0) AS gross_fees
        FROM deliveries
        WHERE tenant_id = ${tenantId}
          AND delivered_at >= date_trunc('month', CURRENT_DATE)
      `;
      const gross = Number(s.gross_fees);
      return {
        month: new Date().toISOString().slice(0, 7),
        delivered: s.delivered,
        gross_fees: gross,
        messenger_commission_est: Math.round(gross * rate * 100) / 100,
        commission_rate: rate,
      };
    }

    case 'my_deliveries': {
      const state = safeArgs.state as string | undefined;
      const rows = state
        ? await sql`
            SELECT d.id, d.state, d.delivery_fee, d.created_at, d.location_link,
              c.name AS customer_name, c.phone AS customer_phone, c.address
            FROM deliveries d
            JOIN customers c ON c.id = d.customer_id
            WHERE d.tenant_id = ${tenantId} AND d.messenger_id = ${user.sub} AND d.state = ${state}
            ORDER BY d.created_at DESC LIMIT 15
          `
        : await sql`
            SELECT d.id, d.state, d.delivery_fee, d.created_at,
              c.name AS customer_name, c.phone AS customer_phone, c.address
            FROM deliveries d
            JOIN customers c ON c.id = d.customer_id
            WHERE d.tenant_id = ${tenantId} AND d.messenger_id = ${user.sub}
              AND d.state IN ('assigned','in_transit')
            ORDER BY d.created_at DESC LIMIT 15
          `;
      return rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
    }

    default: {
      const userResult = await executeUserAiTool(name, safeArgs, ctx);
      if (userResult !== null) return userResult;
      const extended = await executeExtendedAiTool(name, safeArgs, ctx);
      if (extended !== null) return extended;
      return { error: `Herramienta desconocida: ${name}` };
    }
  }
}

const MESSENGER_TOOLS = new Set([
  'my_deliveries', 'search_delivery', 'get_dashboard_stats',
  'get_delayed_deliveries', 'get_delivery_detail', 'get_customer_history',
  'get_messenger_gps', 'get_unread_messages', 'get_today_agenda',
  'get_delivery_timeline', 'get_avg_delivery_times', 'draft_whatsapp_message',
  'get_scheduled_deliveries', 'get_ratings_report',
]);

export function toolsForRole(role: string) {
  if (role === 'messenger') {
    return ALL_AI_TOOL_DEFINITIONS.filter(t => MESSENGER_TOOLS.has(t.name));
  }
  return ALL_AI_TOOL_DEFINITIONS.filter(t => t.name !== 'my_deliveries');
}
