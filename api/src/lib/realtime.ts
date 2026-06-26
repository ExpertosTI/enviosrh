import { EventEmitter } from 'node:events';

export type RealtimeEvent =
  | { type: 'message'; data: unknown }
  | { type: 'typing'; data: { sender: string; typing: boolean } }
  | { type: 'read'; data: { messageIds: string[]; reader: string } }
  | { type: 'location'; data: unknown }
  | { type: 'state'; data: { state: string; at_destination_at?: string } }
  | { type: 'ping'; data: Record<string, never> };

const bus = new EventEmitter();
bus.setMaxListeners(500);

const typingState = new Map<string, Map<string, { typing: boolean; expires: number }>>();

export function channelKey(deliveryId: string) {
  return `delivery:${deliveryId}`;
}

export function emitDeliveryEvent(deliveryId: string, event: RealtimeEvent) {
  bus.emit(channelKey(deliveryId), event);
}

export function subscribeDelivery(deliveryId: string, handler: (e: RealtimeEvent) => void) {
  const ch = channelKey(deliveryId);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}

export function setTyping(deliveryId: string, sender: string, typing: boolean) {
  if (!typingState.has(deliveryId)) typingState.set(deliveryId, new Map());
  const map = typingState.get(deliveryId)!;
  if (typing) {
    map.set(sender, { typing: true, expires: Date.now() + 4000 });
  } else {
    map.delete(sender);
  }
  emitDeliveryEvent(deliveryId, { type: 'typing', data: { sender, typing } });
}

export function getTyping(deliveryId: string, excludeSender?: string) {
  const map = typingState.get(deliveryId);
  if (!map) return [];
  const now = Date.now();
  const active: string[] = [];
  for (const [sender, v] of map) {
    if (v.expires < now) { map.delete(sender); continue; }
    if (sender !== excludeSender && v.typing) active.push(sender);
  }
  return active;
}

// Limpiar typing expirado
setInterval(() => {
  const now = Date.now();
  for (const [, map] of typingState) {
    for (const [sender, v] of map) {
      if (v.expires < now) map.delete(sender);
    }
  }
}, 5000);

export { bus };
