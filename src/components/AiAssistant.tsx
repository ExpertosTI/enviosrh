import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { connectAiStream, type AiAlertPrefs, type TenantAiEvent } from '../lib/aiStream';

interface Message {
  role: 'user' | 'assistant' | 'alert';
  content: string;
  alert?: TenantAiEvent;
}

interface Capabilities {
  suggestions: string[];
  tools: { name: string; description: string }[];
  proactive?: boolean;
  tools_count?: number;
}

function formatAiText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[-•] /gm, '• ')
    .trim();
}

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [lastFailed, setLastFailed] = useState('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [prefs, setPrefs] = useState<AiAlertPrefs | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef<AiAlertPrefs | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    api.get<AiAlertPrefs>('/ai/alert-prefs').then(setPrefs).catch(() => {});
    api.get<Capabilities>('/ai/capabilities').then(c => setSuggestions(c.suggestions)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefs?.proactive_enabled) return;
    const typeToPref: Record<string, keyof AiAlertPrefs> = {
      new_order: 'new_orders',
      assigned: 'assignments',
      in_transit: 'in_transit',
      delivered: 'delivered',
      cancelled: 'cancelled',
      new_message: 'new_messages',
      delay_warning: 'delays',
      unassigned: 'new_orders',
      rating: 'ratings',
    };
    const disconnect = connectAiStream((event) => {
      const p = prefsRef.current;
      if (!p?.proactive_enabled) return;
      const prefKey = typeToPref[event.type];
      if (prefKey && !p[prefKey]) return;
      if (p.sound_enabled && event.priority === 'high') {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.05;
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch { /* ignore */ }
      }
      setUnreadAlerts(n => n + 1);
      setMessages(m => [...m, {
        role: 'alert',
        content: `${event.title}\n${event.body}`,
        alert: event,
      }]);
    });
    return disconnect;
  }, [prefs?.proactive_enabled]);

  useEffect(() => {
    if (open) setUnreadAlerts(0);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');
    setLastFailed('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await api.post<{ reply: string; conversation_id: string }>('/ai/chat', {
        message: msg,
        conversation_id: conversationId,
      });
      setConversationId(res.conversation_id);
      setMessages(m => [...m, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      const e = err instanceof Error ? err.message : 'Error de conexión';
      setError(e);
      setLastFailed(msg);
      setMessages(m => [...m, {
        role: 'assistant',
        content: `No pude responder: ${e}\n\nSi es un error de API key, ve a Ajustes → IA y usa «Probar conexión».`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function updatePref(key: keyof AiAlertPrefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await api.put('/ai/alert-prefs', next);
    } catch {
      setPrefs(prefs);
    }
  }

  function newChat() {
    setMessages([]);
    setConversationId(undefined);
    setError('');
  }

  function askAboutAlert(event: TenantAiEvent) {
    const q = event.delivery_id
      ? `Cuéntame sobre el envío ${event.delivery_id.slice(0, 8)}… (${event.title})`
      : `Analiza esta alerta: ${event.title} — ${event.body}`;
    send(q);
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ai-fab"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Asistente IA"
      >
        <span className="ai-fab-glow" />
        <span className="ai-fab-icon">✦</span>
        {unreadAlerts > 0 && (
          <span className="ai-fab-badge">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>
        )}
        {prefs?.proactive_enabled && (
          <span className="ai-fab-live" title="Monitoreo activo" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ai-panel"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="ai-panel-header">
              <div className="ai-panel-title">
                <span className="ai-orb" />
                <div>
                  <strong>Renace AI</strong>
                  <span>
                    {prefs?.proactive_enabled ? '● En vivo — alertas activas' : 'Consulta envíos y operación'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setShowPrefs(p => !p)} className="ai-panel-btn" title="Alertas">🔔</button>
                <button type="button" onClick={newChat} className="ai-panel-btn" title="Nueva conversación">+</button>
                <button type="button" onClick={() => setOpen(false)} className="ai-panel-btn" title="Cerrar">×</button>
              </div>
            </header>

            {showPrefs && prefs && (
              <div className="ai-prefs-panel">
                <label className="ai-pref-row">
                  <span>Monitoreo proactivo</span>
                  <input
                    type="checkbox"
                    checked={prefs.proactive_enabled}
                    onChange={e => updatePref('proactive_enabled', e.target.checked)}
                  />
                </label>
                <label className="ai-pref-row">
                  <span>Nuevos pedidos</span>
                  <input type="checkbox" checked={prefs.new_orders} onChange={e => updatePref('new_orders', e.target.checked)} />
                </label>
                <label className="ai-pref-row">
                  <span>Mensajes de chat</span>
                  <input type="checkbox" checked={prefs.new_messages} onChange={e => updatePref('new_messages', e.target.checked)} />
                </label>
                <label className="ai-pref-row">
                  <span>Demoras</span>
                  <input type="checkbox" checked={prefs.delays} onChange={e => updatePref('delays', e.target.checked)} />
                </label>
                <label className="ai-pref-row">
                  <span>Sonido (urgentes)</span>
                  <input type="checkbox" checked={prefs.sound_enabled} onChange={e => updatePref('sound_enabled', e.target.checked)} />
                </label>
              </div>
            )}

            <div className="ai-panel-messages">
              {messages.length === 0 && (
                <div className="ai-welcome">
                  <p>
                    Hola, soy tu asistente inteligente con <strong>30+ herramientas</strong>.
                    {prefs?.proactive_enabled
                      ? ' Estoy monitoreando pedidos nuevos, demoras y mensajes en tiempo real.'
                      : ' Activa el monitoreo en 🔔 para recibir alertas automáticas.'}
                  </p>
                  <div className="ai-suggestions">
                    {suggestions.map(s => (
                      <button key={s} type="button" onClick={() => send(s)} className="ai-suggestion-chip">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role === 'user' ? 'is-user' : m.role === 'alert' ? 'is-alert' : 'is-ai'}`}>
                  {m.role !== 'user' && <span className="ai-msg-avatar">{m.role === 'alert' ? '🔔' : '✦'}</span>}
                  <div className="ai-msg-bubble">
                    {m.role === 'assistant' ? formatAiText(m.content) : m.content}
                    {m.alert && (
                      <button type="button" className="ai-alert-action" onClick={() => askAboutAlert(m.alert!)}>
                        Analizar con IA →
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="ai-msg is-ai">
                  <span className="ai-msg-avatar">✦</span>
                  <div className="ai-msg-bubble ai-typing">
                    <span /><span /><span />
                    Consultando datos…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && (
              <div className="ai-error-bar">
                <span>{error}</span>
                {lastFailed && (
                  <button type="button" onClick={() => send(lastFailed)} className="ai-retry-btn">
                    Reintentar
                  </button>
                )}
              </div>
            )}

            <form
              className="ai-panel-input"
              onSubmit={e => { e.preventDefault(); send(); }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pregunta sobre envíos, alertas, mensajeros…"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()} className="ai-send-btn">
                →
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
