import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import type { DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { IconCheck, IconMotorbike, IconPackage, IconStar } from '../../components/Icons';
import L from 'leaflet';

interface PublicDelivery {
  state: DeliveryState;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  delivery_note: string | null;
  messenger_name: string | null;
  messenger_phone: string | null;
  messenger_latitude: number | null;
  messenger_longitude: number | null;
  messenger_location_updated_at: string | null;
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
  const index = STEP_ORDER.indexOf(state);
  return index !== -1 ? index : 0;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-2">
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
          <IconStar size={32} color={s <= (hovered || value) ? '#f59e0b' : '#252540'} />
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const messengerMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);

  // Cargar datos
  const loadDelivery = (isSilent = false) => {
    if (!token) return;
    publicApi.get<PublicDelivery>(`/p/c/${token}`)
      .then((d) => {
        setDelivery(d);
        if (d.rating) {
          setRating(d.rating);
          setRated(true);
        }
      })
      .catch((err) => {
        if (!isSilent) setError(err instanceof Error ? err.message : 'Enlace inválido o expirado');
      });
  };

  useEffect(() => {
    loadDelivery();
  }, [token]);

  // Polling cada 5 segundos para actualizar ubicación del mensajero
  useEffect(() => {
    if (delivery?.state !== 'in_transit') return;
    const interval = setInterval(() => {
      loadDelivery(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [delivery?.state]);

  // Parsear coordenadas del cliente desde las notas o un valor predefinido de Santo Domingo
  const getDestinationCoords = (): [number, number] => {
    // Si tenemos coordenadas por simulación, o por defecto Santo Domingo
    return [18.4861, -69.9312];
  };

  // Inicializar Leaflet Map
  useEffect(() => {
    if (!delivery || !mapContainerRef.current || mapRef.current) return;

    const dest = getDestinationCoords();

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(dest, 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(mapRef.current);

    // Pin del Cliente (Destino)
    const customerIcon = L.divIcon({
      className: 'cust-dest-marker',
      html: `<div class="w-8 h-8 rounded-full bg-[#ef4444]/20 border-2 border-[#ef4444] flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.4)]">
               <div class="w-3.5 h-3.5 rounded-full bg-[#ef4444]"></div>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    destinationMarkerRef.current = L.marker(dest, { icon: customerIcon })
      .addTo(mapRef.current)
      .bindPopup('<b>Lugar de Entrega</b>')
      .openPopup();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [delivery?.state]);

  // Actualizar ubicación en tiempo real del mensajero en el mapa
  useEffect(() => {
    if (!mapRef.current || !delivery) return;

    // Si está en camino y tenemos coordenadas válidas
    if (delivery.state === 'in_transit' && delivery.messenger_latitude && delivery.messenger_longitude) {
      const mLat = Number(delivery.messenger_latitude);
      const mLng = Number(delivery.messenger_longitude);

      const messengerIcon = L.divIcon({
        className: 'cust-view-messenger-marker',
        html: `<div class="w-9 h-9 rounded-full bg-[#5b8af9]/20 border-2 border-[#5b8af9] flex items-center justify-center shadow-[0_0_15px_rgba(91,138,249,0.5)] transition-all duration-500">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="2.5">
                   <circle cx="12" cy="5" r="3" />
                   <path d="M5 12h14l-4 8H9l-4-8z" />
                 </svg>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      if (!messengerMarkerRef.current) {
        messengerMarkerRef.current = L.marker([mLat, mLng], { icon: messengerIcon })
          .addTo(mapRef.current)
          .bindPopup(`<b>🛵 ${delivery.messenger_name ?? 'Mensajero'} está en camino</b>`)
          .openPopup();
      } else {
        messengerMarkerRef.current.setLatLng([mLat, mLng]);
      }

      // Ajustar vista para incluir cliente y mensajero
      const dest = getDestinationCoords();
      const bounds = L.latLngBounds([dest, [mLat, mLng]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      // Eliminar el marcador si ya no está en tránsito
      if (messengerMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(messengerMarkerRef.current);
        messengerMarkerRef.current = null;
      }
    }
  }, [delivery?.messenger_latitude, delivery?.messenger_longitude, delivery?.state]);

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
      <header className="bg-[#13131f]/95 backdrop-blur border-b border-[#252540] px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#5b8af9]/20 flex items-center justify-center">
            <IconPackage size={16} color="#5b8af9" />
          </div>
          <span className="font-bold text-sm text-[#e8e8f4]">EnvíosRH</span>
        </div>
        <span className="text-xs text-[#6b6b8a] font-semibold uppercase tracking-wider">
          Seguimiento en Vivo
        </span>
      </header>

      {/* Mapa */}
      <div className="relative flex-1 min-h-[240px] md:min-h-[360px] z-10">
        <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" />
        {delivery?.state === 'in_transit' && (
          <div className="absolute bottom-3 left-3 z-[999] bg-[#f59e0b]/90 text-[#0b0b14] px-3 py-1.5 rounded-lg text-[10px] font-extrabold shadow-lg flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#0b0b14]"></span> MOTO EN CAMINO
          </div>
        )}
      </div>

      {/* Panel de Detalles */}
      <main className="bg-[#13131f] border-t border-[#252540] p-4 flex flex-col gap-4 max-w-md mx-auto w-full rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-20 pb-8">
        {error && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-2xl bg-[#2a0a0a] flex items-center justify-center border border-[#ef4444]/20">
              <svg className="w-6 h-6 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="text-xs text-[#ef4444] text-center font-medium">{error}</div>
          </div>
        )}

        {delivery && (
          <>
            {/* Info principal del pedido */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Envío para</div>
                <h2 className="text-base font-bold text-[#e8e8f4] mt-0.5">{delivery.customer_name ?? 'Tu Pedido'}</h2>
              </div>
              {isCancelled ? (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30">
                  Cancelado
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#5b8af9]/15 text-[#5b8af9] border border-[#5b8af9]/30">
                  {STATE_LABEL[delivery.state]}
                </span>
              )}
            </div>

            {/* Timeline de progreso */}
            {!isCancelled && (
              <div className="bg-[#0b0b14] border border-[#252540]/60 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  {STEPS.map((step, idx) => {
                    const done    = currentStep > idx;
                    const current = currentStep === idx;
                    return (
                      <div key={step.state} className="flex flex-col items-center gap-1.5 relative flex-1">
                        {/* Línea conectora */}
                        {idx < STEPS.length - 1 && (
                          <div className={`absolute left-1/2 top-4 w-full h-[2px] -z-10 ${currentStep > idx ? 'bg-[#22c55e]' : 'bg-[#252540]'}`} />
                        )}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${
                          done    ? 'bg-[#22c55e] text-[#0b0b14] shadow-[0_0_10px_rgba(34,197,94,0.3)]'      :
                          current ? 'bg-[#5b8af9] text-[#0b0b14] shadow-[0_0_10px_rgba(91,138,249,0.4)] font-bold scale-110' :
                          'bg-[#13131f] text-[#3a3a58] border border-[#252540]'
                        }`}>
                          {done ? <IconCheck size={14} color="#0b0b14" /> : step.icon}
                        </div>
                        <span className={`text-[9px] font-bold tracking-tight text-center ${
                          done ? 'text-[#22c55e]' : current ? 'text-[#e8e8f4]' : 'text-[#3a3a58]'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Datos del Mensajero */}
            {delivery.messenger_name && !isCancelled && (
              <div className="bg-[#0b0b14] border border-[#252540]/60 rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5b8af9]/20 flex items-center justify-center font-bold text-[#5b8af9] text-sm shrink-0 border border-[#5b8af9]/30">
                  {delivery.messenger_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Tu Repartidor</div>
                  <div className="font-bold text-[#e8e8f4] text-sm mt-0.5">{delivery.messenger_name}</div>
                </div>
                {delivery.messenger_phone && (
                  <a href={`tel:${delivery.messenger_phone}`} className="shrink-0 px-3 py-1.5 rounded-lg bg-[#5b8af9] text-[#0b0b14] text-xs font-bold hover:bg-[#3a68e0] transition-colors">
                    Llamar
                  </a>
                )}
              </div>
            )}

            {/* Confirmar recepción */}
            {delivery.can_confirm && !rated && (
              <div className="bg-[#13131f] border border-[#252540] rounded-xl p-4 flex flex-col gap-3.5 shadow-lg">
                <div className="text-sm font-extrabold text-[#e8e8f4]">¿Llegó tu pedido?</div>
                <div className="text-xs text-[#6b6b8a] leading-relaxed">Confirma que recibiste tu envío sin inconvenientes y califica tu experiencia.</div>
                <div className="flex justify-center py-1">
                  <StarRating value={rating} onChange={setRating} />
                </div>
                <button
                  onClick={confirmReceipt}
                  disabled={confirming || rating === 0}
                  className="w-full py-3.5 rounded-xl bg-[#22c55e] text-[#0b0b14] font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#1f9e4c] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer shadow-lg shadow-[#22c55e]/25"
                >
                  {confirming ? 'Confirmando…' : <><IconCheck size={16} color="#0b0b14" /> Confirmar Recepción</>}
                </button>
              </div>
            )}

            {/* Calificación guardada */}
            {rated && delivery.rating !== null && (
              <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl p-4.5 flex flex-col items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
                  <IconCheck size={18} color="#22c55e" />
                </div>
                <div className="text-sm font-bold text-[#22c55e]">¡Gracias por tu calificación!</div>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map((s) => (
                    <IconStar key={s} size={24} color={s <= (delivery.rating ?? 0) ? '#f59e0b' : '#252540'} />
                  ))}
                </div>
              </div>
            )}

            {/* Mensaje de cancelación */}
            {isCancelled && (
              <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl p-4 flex flex-col items-center gap-2 text-center">
                <p className="text-xs text-[#6b6b8a]">Este envío fue cancelado y no se encuentra activo.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
