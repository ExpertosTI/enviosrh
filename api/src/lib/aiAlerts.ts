import sql from '../db/index.js';
import { emitTenantAiEvent, type TenantAiEvent } from './aiTenantBus.js';

interface DeliveryAlertCtx {
  tenantId: string;
  deliveryId: string;
  customerName?: string;
  messengerId?: string | null;
  messengerName?: string | null;
  state?: string;
  fee?: number;
}

async function prefsAllow(
  tenantId: string,
  type: TenantAiEvent['type'],
  messengerId?: string | null,
): Promise<boolean> {
  // Operadores: siempre emitir al bus tenant (filtrado en cliente por prefs)
  void tenantId;
  void messengerId;
  const blocked: TenantAiEvent['type'][] = [];
  return !blocked.includes(type);
}

export async function aiAlertNewOrder(ctx: DeliveryAlertCtx) {
  if (!(await prefsAllow(ctx.tenantId, 'new_order', ctx.messengerId))) return;
  const event: TenantAiEvent = {
    type: 'new_order',
    priority: 'high',
    title: '📦 Nuevo pedido',
    body: `${ctx.customerName ?? 'Cliente'} — RD$ ${ctx.fee ?? 0}`,
    delivery_id: ctx.deliveryId,
    action: 'Revisar y asignar mensajero',
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(ctx.tenantId, event, { messengerId: ctx.messengerId ?? undefined });
}

export async function aiAlertAssigned(ctx: DeliveryAlertCtx) {
  const event: TenantAiEvent = {
    type: 'assigned',
    priority: 'medium',
    title: '🛵 Envío asignado',
    body: `${ctx.customerName ?? 'Cliente'} → ${ctx.messengerName ?? 'mensajero'}`,
    delivery_id: ctx.deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(ctx.tenantId, event, { messengerId: ctx.messengerId ?? undefined });
}

export async function aiAlertInTransit(ctx: DeliveryAlertCtx) {
  const event: TenantAiEvent = {
    type: 'in_transit',
    priority: 'medium',
    title: '🚗 En camino',
    body: `${ctx.messengerName ?? 'Mensajero'} va hacia ${ctx.customerName ?? 'cliente'}`,
    delivery_id: ctx.deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(ctx.tenantId, event, { messengerId: ctx.messengerId ?? undefined });
}

export async function aiAlertDelivered(ctx: DeliveryAlertCtx) {
  const event: TenantAiEvent = {
    type: 'delivered',
    priority: 'low',
    title: '✅ Entregado',
    body: `${ctx.customerName ?? 'Cliente'} recibió su pedido`,
    delivery_id: ctx.deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(ctx.tenantId, event);
}

export async function aiAlertCancelled(ctx: DeliveryAlertCtx) {
  const event: TenantAiEvent = {
    type: 'cancelled',
    priority: 'medium',
    title: '❌ Cancelado',
    body: `Envío de ${ctx.customerName ?? 'cliente'} cancelado`,
    delivery_id: ctx.deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(ctx.tenantId, event, { messengerId: ctx.messengerId ?? undefined });
}

export async function aiAlertNewMessage(
  tenantId: string,
  deliveryId: string,
  sender: string,
  preview: string,
  messengerId?: string | null,
) {
  const event: TenantAiEvent = {
    type: 'new_message',
    priority: 'high',
    title: '💬 Nuevo mensaje',
    body: `${sender}: ${preview.slice(0, 80)}`,
    delivery_id: deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(tenantId, event, { messengerId: messengerId ?? undefined });
}

export async function aiAlertRating(
  tenantId: string,
  deliveryId: string,
  customerName: string,
  rating: number,
) {
  const event: TenantAiEvent = {
    type: 'rating',
    priority: 'low',
    title: '⭐ Nueva calificación',
    body: `${customerName} calificó con ${rating} estrellas`,
    delivery_id: deliveryId,
    at: new Date().toISOString(),
  };
  emitTenantAiEvent(tenantId, event);
}

/** Escaneo periódico: pedidos sin asignar > 15 min */
export async function scanOperationalAlerts(tenantId: string) {
  const stale = await sql`
    SELECT d.id, c.name AS customer_name
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    WHERE d.tenant_id = ${tenantId}
      AND d.state = 'draft'
      AND d.created_at < now() - interval '15 minutes'
    LIMIT 5
  `;
  for (const row of stale) {
    emitTenantAiEvent(tenantId, {
      type: 'unassigned',
      priority: 'high',
      title: '⏰ Sin asignar',
      body: `${row.customer_name} lleva +15 min esperando mensajero`,
      delivery_id: row.id as string,
      action: 'Asignar ahora',
      at: new Date().toISOString(),
    });
  }

  const delayed = await sql`
    SELECT d.id, c.name AS customer_name, u.name AS messenger_name
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN users u ON u.id = d.messenger_id
    WHERE d.tenant_id = ${tenantId}
      AND d.state = 'assigned'
      AND d.assigned_at < now() - interval '30 minutes'
    LIMIT 5
  `;
  for (const row of delayed) {
    emitTenantAiEvent(tenantId, {
      type: 'delay_warning',
      priority: 'medium',
      title: '⚠️ Demora detectada',
      body: `${row.customer_name} asignado a ${row.messenger_name ?? 'mensajero'} sin salir (+30 min)`,
      delivery_id: row.id as string,
      at: new Date().toISOString(),
    });
  }
}

/** Escaneo periódico: pedidos sin asignar > 15 min */
let alertScanStarted = false;
export function startAiAlertScanner() {
  if (alertScanStarted) return;
  alertScanStarted = true;
  setInterval(async () => {
    try {
      const tenants = await sql`SELECT DISTINCT tenant_id FROM ai_alert_prefs WHERE proactive_enabled = true`;
      for (const t of tenants) {
        await scanOperationalAlerts(t.tenant_id as string);
      }
    } catch { /* tabla aún no migrada */ }
  }, 5 * 60_000);
}
