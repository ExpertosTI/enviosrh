import { sseUrl } from './api';

export interface TenantAiEvent {
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  delivery_id?: string;
  action?: string;
  at: string;
}

export interface AiAlertPrefs {
  proactive_enabled: boolean;
  new_orders: boolean;
  assignments: boolean;
  in_transit: boolean;
  delivered: boolean;
  cancelled: boolean;
  new_messages: boolean;
  delays: boolean;
  ratings: boolean;
  sound_enabled: boolean;
}

export function connectAiStream(
  onAlert: (event: TenantAiEvent) => void,
  onError?: () => void,
): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(sseUrl('/ai/stream'));
    es.addEventListener('alert', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as TenantAiEvent;
        onAlert(data);
      } catch { /* ignore */ }
    });
    es.onerror = () => {
      onError?.();
      es?.close();
    };
  } catch {
    onError?.();
  }
  return () => es?.close();
}
