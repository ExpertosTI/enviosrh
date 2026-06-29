import { EventEmitter } from 'node:events';

export type TenantAiEventType =
  | 'new_order'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'new_message'
  | 'delay_warning'
  | 'unassigned'
  | 'rating'
  | 'digest';

export interface TenantAiEvent {
  type: TenantAiEventType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  delivery_id?: string;
  action?: string;
  meta?: Record<string, unknown>;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(1000);

function tenantChannel(tenantId: string) {
  return `tenant:${tenantId}`;
}

function userChannel(tenantId: string, userId: string) {
  return `tenant:${tenantId}:user:${userId}`;
}

function messengerChannel(tenantId: string, messengerId: string) {
  return `tenant:${tenantId}:messenger:${messengerId}`;
}

export function emitTenantAiEvent(
  tenantId: string,
  event: TenantAiEvent,
  opts?: { messengerId?: string; userId?: string },
) {
  bus.emit(tenantChannel(tenantId), event);
  if (opts?.messengerId) {
    bus.emit(messengerChannel(tenantId, opts.messengerId), event);
  }
  if (opts?.userId) {
    bus.emit(userChannel(tenantId, opts.userId), event);
  }
}

export function subscribeTenantAi(
  tenantId: string,
  role: string,
  userId: string,
  handler: (e: TenantAiEvent) => void,
) {
  const channels = [tenantChannel(tenantId)];
  if (role === 'messenger') {
    channels.push(messengerChannel(tenantId, userId));
  }
  for (const ch of channels) {
    bus.on(ch, handler);
  }
  return () => {
    for (const ch of channels) {
      bus.off(ch, handler);
    }
  };
}

export { bus };
