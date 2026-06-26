import { useEffect, useState, useRef, useCallback } from 'react';
import { IconMessage, IconSend } from './Icons';
import { useDeliveryStream, useTypingIndicator, type RealtimePayload } from '../lib/realtime';
import { useDeliveryWebSocket } from '../lib/ws';
import { useI18n } from '../lib/i18n';

export interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  created_at: string;
  read_at?: string | null;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  peerName: string;
  peerInitial: string;
  subtitle?: string;
  messages: ChatMessage[];
  mySender: string;
  onSend: (text: string) => Promise<void>;
  onLoad: () => Promise<void>;
  onMarkRead: () => Promise<void>;
  onTyping: (typing: boolean) => Promise<void>;
  streamPath: string | null;
  placeholder?: string;
}

export function ChatPanel({
  open, onClose, peerName, peerInitial, subtitle,
  messages, mySender, onSend, onLoad, onMarkRead, onTyping, streamPath, placeholder,
}: ChatPanelProps) {
  const { t } = useI18n();
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useDeliveryStream(open ? streamPath : null, (ev) => {
    if (ev.type === 'message') onLoad();
    if (ev.type === 'typing') {
      const d = ev.data as { sender: string; typing: boolean };
      if (d.sender !== mySender) setPeerTyping(d.typing);
    }
    if (ev.type === 'read') onLoad();
  });

  useDeliveryWebSocket(open && streamPath ? streamPath.replace('/stream', '/ws') : null, (ev: RealtimePayload) => {
    if (ev.type === 'message') onLoad();
    if (ev.type === 'typing') {
      const d = ev.data as { sender: string; typing: boolean };
      if (d.sender !== mySender) setPeerTyping(d.typing);
    }
    if (ev.type === 'read') onLoad();
  });

  const sendTyping = useCallback((typing: boolean) => {
    onTyping(typing).catch(() => {});
  }, [onTyping]);

  const onInputTyping = useTypingIndicator(sendTyping);

  useEffect(() => {
    if (open) {
      onLoad();
      onMarkRead();
    }
  }, [open]);

  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      await onSend(newMsg.trim());
      setNewMsg('');
      sendTyping(false);
    } finally { setSending(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="chat-modal border-t sm:border rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl" style={{ height: '88vh', maxHeight: 600 }}>
        <div className="chat-modal-header px-4 py-3 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#5b8af9]/15 flex items-center justify-center font-bold text-[#5b8af9] text-xs">{peerInitial}</div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-[#e8e8f4]">{peerName}</div>
              <div className="text-[9px] text-slate-500 dark:text-[#6b6b8a]">
                {peerTyping ? t('chat.typing') : (subtitle ?? 'Chat')}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 dark:text-[#6b6b8a] hover:text-slate-800 dark:hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1.5 rounded-lg text-xs font-bold">
            {t('chat.close')}
          </button>
        </div>

        <div className="chat-modal-body flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2">
              <IconMessage size={18} color="#6b6b8a" />
              <p className="text-xs font-bold text-slate-500 dark:text-[#6b6b8a]">{t('chat.empty')}</p>
            </div>
          ) : (
            messages.map(m => {
              const isMe = m.sender === mySender;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                    isMe ? 'chat-bubble-sent rounded-tr-none' : 'chat-bubble-received rounded-tl-none'
                  }`}>
                    <p className="break-words">{m.message}</p>
                    <div className="chat-time text-[8px] mt-1 text-right flex items-center justify-end gap-1">
                      {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      {isMe && <span>{m.read_at ? '✓✓' : '✓'}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="chat-modal-footer p-3 border-t flex gap-2">
          <input
            type="text"
            value={newMsg}
            onChange={e => { setNewMsg(e.target.value); onInputTyping(); }}
            placeholder={placeholder ?? t('chat.placeholder')}
            className="chat-input flex-1 border rounded-xl px-3 py-2 text-xs outline-none focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30"
          />
          <button type="submit" disabled={!newMsg.trim() || sending} className="p-2.5 rounded-xl bg-[#5b8af9] text-white disabled:opacity-40 border-0 cursor-pointer">
            <IconSend size={15} color="#fff" />
          </button>
        </form>
      </div>
    </div>
  );
}
