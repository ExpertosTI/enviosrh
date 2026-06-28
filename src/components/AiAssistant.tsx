import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Capabilities {
  suggestions: string[];
  tools: { name: string; description: string }[];
}

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !suggestions.length) {
      api.get<Capabilities>('/ai/capabilities').then(c => setSuggestions(c.suggestions)).catch(() => {});
    }
  }, [open, suggestions.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');
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
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e}` }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([]);
    setConversationId(undefined);
    setError('');
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
                  <span>Consulta envíos, mensajeros y más</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={newChat} className="ai-panel-btn" title="Nueva conversación">+</button>
                <button type="button" onClick={() => setOpen(false)} className="ai-panel-btn" title="Cerrar">×</button>
              </div>
            </header>

            <div className="ai-panel-messages">
              {messages.length === 0 && (
                <div className="ai-welcome">
                  <p>Hola, soy tu asistente inteligente. Puedo consultar datos reales de tu operación.</p>
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
                <div key={i} className={`ai-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                  {m.role === 'assistant' && <span className="ai-msg-avatar">✦</span>}
                  <div className="ai-msg-bubble">{m.content}</div>
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

            {error && <p className="ai-error">{error}</p>}

            <form
              className="ai-panel-input"
              onSubmit={e => { e.preventDefault(); send(); }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pregunta sobre envíos, rutas, mensajeros…"
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
