import { useEffect, useRef, useCallback } from 'react';
import { getBaseUrl } from './api';
import type { RealtimePayload } from '../lib/realtime';

function wsUrl(path: string) {
  const base = getBaseUrl().replace(/^http/, 'ws');
  return `${base}${path}`;
}

/** WebSocket en tiempo real (complementa SSE) */
export function useDeliveryWebSocket(
  wsPath: string | null,
  onEvent: (event: RealtimePayload) => void,
  preferWs = true,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!wsPath || !preferWs || typeof WebSocket === 'undefined') return () => {};
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      ws = new WebSocket(wsUrl(wsPath));
      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as RealtimePayload;
          if (parsed.type !== 'ping') onEventRef.current(parsed);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(open, 3000);
      };
    };
    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [wsPath, preferWs]);

  useEffect(() => connect(), [connect]);
}

export type { RealtimePayload };
