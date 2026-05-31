import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import type { DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { IconCheck, IconMotorbike, IconPackage, IconStar } from '../../components/Icons';

interface PublicDelivery {
  state: DeliveryState;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  delivery_note: string | null;
  messenger_name: string | null;
  messenger_phone: string | null;
  can_confirm: boolean;
  rating: number | null;
}

const STEPS: { state: DeliveryState; label: string; icon: React.ReactNode }[] = [
  { state: 'draft',      label: 'En espera',      icon: <IconPackage size={18} /> },
  { state: 'assigned',   label: 'Asignado',        icon: <IconPackage size={18} /> },
  { state: 'in_transit', label: 'En camino',        icon: <IconMotorbike size={18} /> },
  { state: 'delivered',  label: 'Entregado',        icon: <IconCheck size={18} /> },
];

const STEP_ORDER: DeliveryState[] = ['draft', 'assigned', 'in_transit', 'delivered'];

function stepIndex(state: DeliveryState) {
  return STEP_ORDER.indexOf(state);
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1,2,3,4,5].map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`${s} estrella${s !== 1 ? 's' : ''}`}
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          className="border-0 bg-transparent cursor-pointer p-0.5 transition-transform hover:scale-110 active:scale-125"
        >
          <IconStar size={28} color={s <= (hovered || value) ? '#f59e0b' : '#252540'} />
        </button>
      ))}
    </div>
  );
}

export function CustomerTracking() {
  const { token } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<PublicDelivery | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    if (!token) return;
    publicApi.get<PublicDelivery>(`/p/c/${token}`)
      .then((d) => { setDelivery(d); if (d.rating) { setRating(d.rating); setRated(true); } })
      .catch((err) => setError(err instanceof Error ? err.message : 'Enlace inválido o expirado'));
  }, [token]);

  async function confirmReceipt() {
    if (!token || rating === 0) return;
    setConfirming(true);
    try {
      await publicApi.post(`/p/c/${token}/confirm`, { rating });
      setRated(true);
      setDelivery((d) => d ? { ...d, can_confirm: false, rating } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar');
    } finally { setConfirming(false); }
  }

  const currentStep = delivery ? stepIndex(delivery.state) : -1;
  const isCancelled = delivery?.state === 'cancelled';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex flex-col">
      {/* Header */}
      <header className="bg-[#13131f] border-b border-[#252540] px-4 py-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#5b8af9]/20 flex items-center justify-center">
          <IconPackage size={16} color="#5b8af9" />
        </div>
        <span className="font-bold text-sm text-[#e8e8f4]">EnvíosRH</span>
        <span className="ml-auto text-xs text-[#6b6b8a]">Seguimiento</span>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-sm flex flex-col gap-5">
          {error && (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-14 h-14 rounded-2xl bg-[#2a0a0a] flex items-center justify-center">
                <svg className="w-7 h-7 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="text-sm text-[#6b6b8a] text-center">{error}</div>
            </div>
          )}

          {!delivery && !error && (
            <div className="flex flex-col items-center gap-3 py-12">
              <svg className="w-6 h-6 text-[#5b8af9] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <div className="text-xs text-[#6b6b8a]">Cargando…</div>
            </div>
          )}

          {delivery && (
            <>
              {/* Cliente */}
              <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#5b8af9]/15 flex items-center justify-center">
                    <IconPackage size={20} color="#5b8af9" />
                  </div>
                  <div>
                    <div className="font-bold text-[#e8e8f4]">{delivery.customer_name ?? 'Tu pedido'}</div>
                    {isCancelled ? (
                      <div className="text-xs text-[#ef4444] font-semibold">Envío cancelado</div>
                    ) : (
                      <div className="text-xs text-[#6b6b8a]">Estado: {STATE_LABEL[delivery.state]}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline de pasos */}
              {!isCancelled && (
                <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5">
                  <div className="text-xs font-bold text-[#6b6b8a] uppercase tracking-wide mb-4">Progreso</div>
                  <div className="flex flex-col gap-0">
                    {STEPS.map((step, idx) => {
                      const done    = currentStep > idx;
                      const current = currentStep === idx;
                      const pending = currentStep < idx;
                      return (
                        <div key={step.state} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className={[
                              'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                              done    ? 'bg-[#22c55e] text-white'      : '',
                              current ? 'bg-[#5b8af9] text-white ring-4 ring-[#5b8af9]/20' : '',
                              pending ? 'bg-[#16162a] text-[#3a3a58] border border-[#252540]' : '',
                            ].join(' ')}>
                              {step.icon}
                            </div>
                            {idx < STEPS.length - 1 && (
                              <div className={`w-0.5 h-6 mt-1 mb-1 ${done ? 'bg-[#22c55e]' : 'bg-[#252540]'}`} />
                            )}
                          </div>
                          <div className="pt-1.5">
                            <div className={`text-sm font-semibold ${done ? 'text-[#22c55e]' : current ? 'text-[#e8e8f4]' : 'text-[#3a3a58]'}`}>
                              {step.label}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mensajero */}
              {delivery.messenger_name && !isCancelled && (
                <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#5b8af9]/20 flex items-center justify-center font-bold text-[#5b8af9] text-sm shrink-0">
                    {delivery.messenger_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs text-[#6b6b8a] uppercase tracking-wide">Mensajero</div>
                    <div className="font-semibold text-[#e8e8f4] text-sm">{delivery.messenger_name}</div>
                  </div>
                  {delivery.messenger_phone && (
                    <a href={`tel:${delivery.messenger_phone}`} className="ml-auto px-3 py-1.5 rounded-lg bg-[#5b8af9]/15 text-[#5b8af9] text-xs font-semibold">
                      Llamar
                    </a>
                  )}
                </div>
              )}

              {/* Confirmar recepción */}
              {delivery.can_confirm && !rated && (
                <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 flex flex-col gap-4">
                  <div className="text-sm font-bold text-[#e8e8f4]">¿Recibiste tu pedido?</div>
                  <div className="text-xs text-[#6b6b8a]">Califica la experiencia de entrega</div>
                  <div className="flex justify-center">
                    <StarRating value={rating} onChange={setRating} />
                  </div>
                  <button
                    onClick={confirmReceipt}
                    disabled={confirming || rating === 0}
                    className="w-full py-3.5 rounded-xl bg-[#22c55e] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#16a34a] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer"
                  >
                    {confirming ? 'Confirmando…' : <><IconCheck size={16} /> Confirmar recepción</>}
                  </button>
                </div>
              )}

              {/* Calificación guardada */}
              {rated && delivery.rating !== null && (
                <div className="bg-[#0a2a18] border border-[#22c55e]/30 rounded-2xl p-5 flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
                    <IconCheck size={20} color="#22c55e" />
                  </div>
                  <div className="text-sm font-bold text-[#22c55e]">¡Gracias por tu calificación!</div>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map((s) => (
                      <IconStar key={s} size={22} color={s <= (delivery.rating ?? 0) ? '#f59e0b' : '#252540'} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
