import sql from '../db/index.js';
import { pickMessenger } from './assignEngine.js';
import { isValidUuid } from './aiSecurity.js';
import type { AiToolContext } from './aiTools.js';

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export const EXTENDED_AI_TOOL_DEFINITIONS = [
  {
    name: 'get_new_orders',
    description: 'Pedidos nuevos creados en las últimas horas (estado draft o recién creados).',
    parameters: {
      type: 'object',
      properties: { hours: { type: 'number', description: 'Horas hacia atrás (default 4)' } },
    },
  },
  {
    name: 'get_unassigned_orders',
    description: 'Envíos sin mensajero asignado que requieren atención.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Máximo resultados (default 15)' } },
    },
  },
  {
    name: 'get_delayed_deliveries',
    description: 'Envíos con demora: asignados sin salir o en tránsito demasiado tiempo.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_delivery_detail',
    description: 'Detalle completo de un envío por ID.',
    parameters: {
      type: 'object',
      properties: { delivery_id: { type: 'string', description: 'UUID del envío' } },
      required: ['delivery_id'],
    },
  },
  {
    name: 'get_customer_history',
    description: 'Historial de envíos de un cliente por teléfono o nombre.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Teléfono o nombre' } },
      required: ['query'],
    },
  },
  {
    name: 'suggest_best_messenger',
    description: 'Sugiere el mejor mensajero para un envío según reglas de asignación.',
    parameters: {
      type: 'object',
      properties: { delivery_id: { type: 'string', description: 'UUID del envío' } },
      required: ['delivery_id'],
    },
  },
  {
    name: 'get_messenger_gps',
    description: 'Ubicación GPS actual de un mensajero.',
    parameters: {
      type: 'object',
      properties: { messenger_id: { type: 'string', description: 'UUID del mensajero' } },
      required: ['messenger_id'],
    },
  },
  {
    name: 'get_live_fleet_status',
    description: 'Estado en vivo de la flota: GPS, carga activa, batería y señal.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_unread_messages',
    description: 'Mensajes de chat sin leer en envíos activos.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_ratings_report',
    description: 'Resumen de calificaciones de clientes (promedio, distribución).',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días hacia atrás (default 30)' } },
    },
  },
  {
    name: 'get_today_agenda',
    description: 'Agenda del día: envíos programados y pendientes para hoy.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_cancellation_report',
    description: 'Estadísticas de cancelaciones del período.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días (default 7)' } },
    },
  },
  {
    name: 'get_zone_stats',
    description: 'Rendimiento por zona de cobertura: entregas, tiempos, ingresos.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días (default 7)' } },
    },
  },
  {
    name: 'get_messenger_leaderboard',
    description: 'Ranking de mensajeros por entregas, calificación y eficiencia.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días (default 7)' } },
    },
  },
  {
    name: 'get_delivery_timeline',
    description: 'Línea de tiempo de eventos de un envío.',
    parameters: {
      type: 'object',
      properties: { delivery_id: { type: 'string' } },
      required: ['delivery_id'],
    },
  },
  {
    name: 'get_active_alerts',
    description: 'Alertas operativas activas: sin asignar, demoras, mensajes pendientes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_hourly_today',
    description: 'Volumen de pedidos por hora del día actual.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_stale_drafts',
    description: 'Borradores/pedidos sin asignar que llevan mucho tiempo esperando.',
    parameters: {
      type: 'object',
      properties: { minutes: { type: 'number', description: 'Minutos mínimos (default 15)' } },
    },
  },
  {
    name: 'get_products_top',
    description: 'Productos más frecuentes en pedidos recientes.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días (default 14)' } },
    },
  },
  {
    name: 'get_avg_delivery_times',
    description: 'Tiempos promedio de asignación y entrega.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Días (default 7)' } },
    },
  },
  {
    name: 'draft_whatsapp_message',
    description: 'Redacta un mensaje de WhatsApp para el cliente de un envío.',
    parameters: {
      type: 'object',
      properties: {
        delivery_id: { type: 'string' },
        tone: { type: 'string', description: 'formal, amigable o urgente' },
      },
      required: ['delivery_id'],
    },
  },
  {
    name: 'get_scheduled_deliveries',
    description: 'Envíos programados para fechas futuras o hoy.',
    parameters: {
      type: 'object',
      properties: { days_ahead: { type: 'number', description: 'Días adelante (default 3)' } },
    },
  },
] as const;

export async function executeExtendedAiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AiToolContext,
): Promise<unknown | null> {
  const { tenantId, user } = ctx;

  switch (name) {
    case 'get_new_orders': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const hours = Math.min(Number(args.hours ?? 4), 48);
      const rows = await sql`
        SELECT d.id, d.state, d.delivery_fee, d.created_at,
          c.name AS customer_name, c.phone AS customer_phone
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId}
          AND d.created_at >= now() - ${hours}::int * interval '1 hour'
        ORDER BY d.created_at DESC LIMIT 20
      `;
      return { hours, count: rows.length, orders: rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) })) };
    }

    case 'get_unassigned_orders': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const limit = Math.min(Number(args.limit ?? 15), 25);
      const rows = await sql`
        SELECT d.id, d.delivery_fee, d.created_at, d.area_zone,
          c.name AS customer_name, c.phone AS customer_phone, c.address
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId} AND d.state = 'draft' AND d.messenger_id IS NULL
        ORDER BY d.created_at ASC LIMIT ${limit}
      `;
      return rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
    }

    case 'get_delayed_deliveries': {
      const rows = await sql`
        SELECT d.id, d.state, d.assigned_at, d.created_at,
          c.name AS customer_name, u.name AS messenger_name,
          EXTRACT(EPOCH FROM (now() - COALESCE(d.assigned_at, d.created_at)))/60 AS minutes_waiting
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.tenant_id = ${tenantId}
          AND (
            (d.state = 'assigned' AND d.assigned_at < now() - interval '30 minutes')
            OR (d.state = 'in_transit' AND d.assigned_at < now() - interval '90 minutes')
          )
          ${user.role === 'messenger' ? sql`AND d.messenger_id = ${user.sub}` : sql``}
        ORDER BY minutes_waiting DESC LIMIT 15
      `;
      return rows.map(r => ({ ...r, minutes_waiting: Math.round(Number(r.minutes_waiting)) }));
    }

    case 'get_delivery_detail': {
      const id = String(args.delivery_id ?? '');
      if (!isValidUuid(id)) return { error: 'ID inválido' };
      const [row] = await sql`
        SELECT d.*, c.name AS customer_name, c.phone AS customer_phone,
          c.address, c.reference, c.email,
          u.name AS messenger_name, u.phone AS messenger_phone
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.id = ${id} AND d.tenant_id = ${tenantId}
      `;
      if (!row) return { error: 'No encontrado' };
      if (user.role === 'messenger' && row.messenger_id !== user.sub) return { error: 'No autorizado' };
      return {
        ...row,
        delivery_fee: Number(row.delivery_fee),
        total_amount: Number(row.total_amount ?? 0),
      };
    }

    case 'get_customer_history': {
      const q = String(args.query ?? '').trim();
      if (!q) return { error: 'Query vacío' };
      const like = `%${q}%`;
      const rows = await sql`
        SELECT d.id, d.state, d.delivery_fee, d.created_at, d.delivered_at, d.rating,
          c.name AS customer_name, c.phone AS customer_phone
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId}
          AND (c.name ILIKE ${like} OR c.phone ILIKE ${like})
        ORDER BY d.created_at DESC LIMIT 12
      `;
      return rows.map(r => ({ ...r, delivery_fee: Number(r.delivery_fee) }));
    }

    case 'suggest_best_messenger': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const id = String(args.delivery_id ?? '');
      if (!isValidUuid(id)) return { error: 'ID inválido' };
      const [d] = await sql`
        SELECT id, location_link, area_zone FROM deliveries
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;
      if (!d) return { error: 'Envío no encontrado' };
      const coords = parseCoords(d.location_link as string | null);
      const best = await pickMessenger(tenantId, coords, d.area_zone as string | null);
      if (!best) return { suggestion: null, reason: 'No hay mensajeros disponibles en este momento' };
      return {
        delivery_id: id,
        suggested_messenger: { id: best.id, name: best.name, active_deliveries: best.active_count },
        reason: 'Según reglas de auto-asignación del tenant',
      };
    }

    case 'get_messenger_gps': {
      const mid = String(args.messenger_id ?? '');
      if (!isValidUuid(mid)) return { error: 'ID inválido' };
      if (user.role === 'messenger' && mid !== user.sub) return { error: 'No autorizado' };
      const [m] = await sql`
        SELECT id, name, latitude, longitude, location_updated_at, battery_level, signal_quality, status
        FROM users WHERE id = ${mid} AND tenant_id = ${tenantId} AND role = 'messenger'
      `;
      if (!m) return { error: 'Mensajero no encontrado' };
      return {
        ...m,
        latitude: m.latitude ? Number(m.latitude) : null,
        longitude: m.longitude ? Number(m.longitude) : null,
        has_gps: Boolean(m.latitude && m.longitude),
      };
    }

    case 'get_live_fleet_status': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const rows = await sql`
        SELECT u.id, u.name, u.latitude, u.longitude, u.location_updated_at,
          u.battery_level, u.signal_quality, u.status, u.active,
          COUNT(d.id) FILTER (WHERE d.state IN ('assigned','in_transit'))::int AS active_deliveries
        FROM users u
        LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${tenantId}
        WHERE u.tenant_id = ${tenantId} AND u.role = 'messenger'
        GROUP BY u.id
        ORDER BY u.active DESC, u.name ASC
      `;
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        active: r.active,
        active_deliveries: r.active_deliveries,
        gps: r.latitude ? { lat: Number(r.latitude), lng: Number(r.longitude), updated_at: r.location_updated_at } : null,
        battery_level: r.battery_level,
        signal_quality: r.signal_quality,
        status: r.status,
      }));
    }

    case 'get_unread_messages': {
      const rows = await sql`
        SELECT d.id AS delivery_id, c.name AS customer_name,
          COUNT(dm.id)::int AS unread_count,
          MAX(dm.created_at) AS last_message_at
        FROM delivery_messages dm
        JOIN deliveries d ON d.id = dm.delivery_id
        JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId}
          AND dm.read_at IS NULL
          AND dm.sender = ${user.role === 'messenger' ? 'customer' : 'messenger'}
          ${user.role === 'messenger' ? sql`AND d.messenger_id = ${user.sub}` : sql``}
        GROUP BY d.id, c.name
        ORDER BY last_message_at DESC LIMIT 15
      `;
      const total = rows.reduce((s, r) => s + Number(r.unread_count), 0);
      return { total_unread: total, conversations: rows };
    }

    case 'get_ratings_report': {
      const days = Math.min(Number(args.days ?? 30), 90);
      const [s] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE rating IS NOT NULL)::int AS rated_count,
          COALESCE(AVG(rating) FILTER (WHERE rating IS NOT NULL), 0) AS avg_rating,
          COUNT(*) FILTER (WHERE rating = 5)::int AS five_stars,
          COUNT(*) FILTER (WHERE rating = 4)::int AS four_stars,
          COUNT(*) FILTER (WHERE rating <= 3)::int AS low_ratings
        FROM deliveries
        WHERE tenant_id = ${tenantId}
          AND delivered_at >= now() - ${days}::int * interval '1 day'
      `;
      return {
        days,
        rated_count: s.rated_count,
        avg_rating: Number(Number(s.avg_rating).toFixed(2)),
        distribution: { five: s.five_stars, four: s.four_stars, low: s.low_ratings },
      };
    }

    case 'get_today_agenda': {
      const rows = await sql`
        SELECT d.id, d.state, d.scheduled_at, d.delivery_fee,
          c.name AS customer_name, u.name AS messenger_name
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.tenant_id = ${tenantId}
          AND d.state NOT IN ('delivered','cancelled')
          AND (
            d.scheduled_at::date = CURRENT_DATE
            OR (d.scheduled_at IS NULL AND d.created_at::date = CURRENT_DATE)
          )
          ${user.role === 'messenger' ? sql`AND d.messenger_id = ${user.sub}` : sql``}
        ORDER BY COALESCE(d.scheduled_at, d.created_at) ASC LIMIT 25
      `;
      return { date: new Date().toISOString().slice(0, 10), count: rows.length, items: rows };
    }

    case 'get_cancellation_report': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const days = Math.min(Number(args.days ?? 7), 60);
      const [s] = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE state = 'cancelled')::int AS cancelled
        FROM deliveries
        WHERE tenant_id = ${tenantId}
          AND created_at >= now() - ${days}::int * interval '1 day'
      `;
      const rate = s.total > 0 ? Math.round((Number(s.cancelled) / Number(s.total)) * 1000) / 10 : 0;
      return { days, total: s.total, cancelled: s.cancelled, cancellation_rate_pct: rate };
    }

    case 'get_zone_stats': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const days = Math.min(Number(args.days ?? 7), 60);
      const rows = await sql`
        SELECT COALESCE(d.area_zone, 'Sin zona') AS zone,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE d.state = 'delivered')::int AS delivered,
          COALESCE(SUM(d.delivery_fee) FILTER (WHERE d.state = 'delivered'), 0) AS fees
        FROM deliveries d
        WHERE d.tenant_id = ${tenantId}
          AND d.created_at >= now() - ${days}::int * interval '1 day'
        GROUP BY COALESCE(d.area_zone, 'Sin zona')
        ORDER BY total DESC LIMIT 12
      `;
      return rows.map(r => ({ ...r, fees: Number(r.fees) }));
    }

    case 'get_messenger_leaderboard': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const days = Math.min(Number(args.days ?? 7), 60);
      const rows = await sql`
        SELECT u.id, u.name,
          COUNT(d.id) FILTER (WHERE d.state = 'delivered')::int AS delivered,
          COALESCE(AVG(d.rating) FILTER (WHERE d.rating IS NOT NULL), 0) AS avg_rating,
          COALESCE(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.assigned_at))/60)
            FILTER (WHERE d.delivered_at IS NOT NULL AND d.assigned_at IS NOT NULL), 0) AS avg_minutes
        FROM users u
        LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${tenantId}
          AND d.delivered_at >= now() - ${days}::int * interval '1 day'
        WHERE u.tenant_id = ${tenantId} AND u.role = 'messenger'
        GROUP BY u.id
        ORDER BY delivered DESC, avg_rating DESC
        LIMIT 10
      `;
      return rows.map(r => ({
        ...r,
        avg_rating: Number(Number(r.avg_rating).toFixed(2)),
        avg_minutes: Math.round(Number(r.avg_minutes)),
      }));
    }

    case 'get_delivery_timeline': {
      const id = String(args.delivery_id ?? '');
      if (!isValidUuid(id)) return { error: 'ID inválido' };
      const [d] = await sql`SELECT messenger_id FROM deliveries WHERE id = ${id} AND tenant_id = ${tenantId}`;
      if (!d) return { error: 'No encontrado' };
      if (user.role === 'messenger' && d.messenger_id !== user.sub) return { error: 'No autorizado' };
      const events = await sql`
        SELECT state, actor_role, note, created_at
        FROM delivery_events WHERE delivery_id = ${id}
        ORDER BY created_at ASC
      `;
      return { delivery_id: id, events };
    }

    case 'get_active_alerts': {
      const stale = await sql`
        SELECT d.id, c.name AS customer_name, d.created_at
        FROM deliveries d JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId} AND d.state = 'draft'
          AND d.created_at < now() - interval '15 minutes'
        LIMIT 5
      `;
      const delayed = await sql`
        SELECT d.id, c.name AS customer_name, u.name AS messenger_name
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.tenant_id = ${tenantId} AND d.state = 'assigned'
          AND d.assigned_at < now() - interval '30 minutes'
        LIMIT 5
      `;
      const unread = await sql`
        SELECT COUNT(*)::int AS n FROM delivery_messages dm
        JOIN deliveries d ON d.id = dm.delivery_id
        WHERE d.tenant_id = ${tenantId} AND dm.read_at IS NULL
          AND dm.sender = 'messenger'
      `;
      return {
        unassigned_stale: stale,
        delayed_assignments: delayed,
        unread_operator_messages: unread[0]?.n ?? 0,
        alert_count: stale.length + delayed.length + (Number(unread[0]?.n) > 0 ? 1 : 0),
      };
    }

    case 'get_hourly_today': {
      const rows = await sql`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
        FROM deliveries
        WHERE tenant_id = ${tenantId} AND created_at::date = CURRENT_DATE
        GROUP BY hour ORDER BY hour ASC
      `;
      return { date: new Date().toISOString().slice(0, 10), hourly: rows };
    }

    case 'get_stale_drafts': {
      if (user.role !== 'operator') return { error: 'Solo operadores' };
      const minutes = Math.min(Number(args.minutes ?? 15), 240);
      const rows = await sql`
        SELECT d.id, d.created_at, c.name AS customer_name, c.phone AS customer_phone,
          EXTRACT(EPOCH FROM (now() - d.created_at))/60 AS waiting_minutes
        FROM deliveries d JOIN customers c ON c.id = d.customer_id
        WHERE d.tenant_id = ${tenantId} AND d.state = 'draft'
          AND d.created_at < now() - ${minutes}::int * interval '1 minute'
        ORDER BY d.created_at ASC LIMIT 15
      `;
      return rows.map(r => ({ ...r, waiting_minutes: Math.round(Number(r.waiting_minutes)) }));
    }

    case 'get_products_top': {
      const days = Math.min(Number(args.days ?? 14), 60);
      const rows = await sql`
        SELECT products, COUNT(*)::int AS count
        FROM deliveries
        WHERE tenant_id = ${tenantId}
          AND products IS NOT NULL AND products != ''
          AND created_at >= now() - ${days}::int * interval '1 day'
        GROUP BY products ORDER BY count DESC LIMIT 10
      `;
      return rows;
    }

    case 'get_avg_delivery_times': {
      const days = Math.min(Number(args.days ?? 7), 60);
      const [s] = await sql`
        SELECT
          COALESCE(AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))/60)
            FILTER (WHERE assigned_at IS NOT NULL), 0) AS avg_assign_min,
          COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at))/60)
            FILTER (WHERE delivered_at IS NOT NULL AND assigned_at IS NOT NULL), 0) AS avg_delivery_min,
          COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/60)
            FILTER (WHERE delivered_at IS NOT NULL), 0) AS avg_total_min
        FROM deliveries
        WHERE tenant_id = ${tenantId} AND state = 'delivered'
          AND delivered_at >= now() - ${days}::int * interval '1 day'
      `;
      return {
        days,
        avg_assign_minutes: Math.round(Number(s.avg_assign_min)),
        avg_delivery_minutes: Math.round(Number(s.avg_delivery_min)),
        avg_total_minutes: Math.round(Number(s.avg_total_min)),
      };
    }

    case 'draft_whatsapp_message': {
      const id = String(args.delivery_id ?? '');
      if (!isValidUuid(id)) return { error: 'ID inválido' };
      const tone = String(args.tone ?? 'amigable');
      const [row] = await sql`
        SELECT d.state, d.delivery_fee, c.name AS customer_name, c.phone AS customer_phone,
          u.name AS messenger_name
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.id = ${id} AND d.tenant_id = ${tenantId}
      `;
      if (!row) return { error: 'No encontrado' };
      const name = row.customer_name as string;
      let text = '';
      if (row.state === 'assigned') {
        text = tone === 'formal'
          ? `Estimado/a ${name}, su pedido ha sido asignado. Nuestro mensajero ${row.messenger_name ?? ''} se pondrá en contacto pronto.`
          : `¡Hola ${name}! 🛵 Tu pedido ya tiene mensajero asignado (${row.messenger_name ?? 'en camino'}). Te avisamos cuando salga.`;
      } else if (row.state === 'in_transit') {
        text = `¡Hola ${name}! Tu pedido va en camino 🚗. Llegará pronto.`;
      } else if (row.state === 'delivered') {
        text = `¡Hola ${name}! Tu pedido fue entregado ✅. ¡Gracias por confiar en nosotros!`;
      } else {
        text = `Hola ${name}, confirmamos tu pedido. Te mantendremos informado/a sobre el estado de tu envío.`;
      }
      return { delivery_id: id, phone: row.customer_phone, tone, message: text };
    }

    case 'get_scheduled_deliveries': {
      const daysAhead = Math.min(Number(args.days_ahead ?? 3), 14);
      const rows = await sql`
        SELECT d.id, d.scheduled_at, d.state, c.name AS customer_name, u.name AS messenger_name
        FROM deliveries d
        JOIN customers c ON c.id = d.customer_id
        LEFT JOIN users u ON u.id = d.messenger_id
        WHERE d.tenant_id = ${tenantId}
          AND d.scheduled_at IS NOT NULL
          AND d.scheduled_at >= CURRENT_DATE
          AND d.scheduled_at < CURRENT_DATE + ${daysAhead}::int * interval '1 day'
          AND d.state NOT IN ('delivered','cancelled')
          ${user.role === 'messenger' ? sql`AND d.messenger_id = ${user.sub}` : sql``}
        ORDER BY d.scheduled_at ASC LIMIT 20
      `;
      return { days_ahead: daysAhead, count: rows.length, deliveries: rows };
    }

    default:
      return null;
  }
}

export const EXTENDED_TOOL_NAMES = EXTENDED_AI_TOOL_DEFINITIONS.map(t => t.name);
