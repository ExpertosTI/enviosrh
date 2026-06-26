import { useEffect, useRef, useCallback } from 'react';
import { sseUrl } from './api';

export type RealtimePayload = {
  type: 'message' | 'typing' | 'read' | 'location' | 'state' | 'ping';
  data: unknown;
};

export function useDeliveryStream(
  streamPath: string | null,
  onEvent: (event: RealtimePayload) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!streamPath) return;
    const url = sseUrl(streamPath);
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as RealtimePayload;
        if (parsed.type !== 'ping') onEventRef.current(parsed);
      } catch { /* ignore */ }
    };

    return () => es.close();
  }, [streamPath]);
}

export function useTypingIndicator(
  sendTyping: (typing: boolean) => void,
  debounceMs = 1500,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onInput = useCallback(() => {
    sendTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sendTyping(false), debounceMs);
  }, [sendTyping, debounceMs]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return onInput;
}
