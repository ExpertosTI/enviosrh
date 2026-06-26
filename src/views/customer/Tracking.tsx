import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import type { DeliveryState, Tenant } from '../../types';
import { STATE_LABEL } from '../../types';
import { IconCheck, IconMotorbike, IconPackage, IconStar, IconMessage } from '../../components/Icons';
import { ThemeToggle } from '../../components/ThemeToggle';
import { applyTenantTheme } from '../../lib/theme';
import { ChatPanel, type ChatMessage } from '../../components/ChatPanel';
import { notifyProximity, resetProximityFlag, setupPushForDelivery } from '../../lib/push';
import { OnboardingTour } from '../../components/OnboardingTour';
import { useDeliveryWebSocket } from '../../lib/ws';
import { parseLocationLink } from '../../lib/coords';
import { useMapRoute } from '../../lib/useMapRoute';
import { formatRouteDuration } from '../../lib/routing';
import L from 'leaflet';

interface PublicDelivery {
  id: string;
  state: DeliveryState;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string;
  customer_reference: string;
  notes: string | null;
  delivery_note: string | null;
  messenger_name: string | null;
  messenger_phone: string | null;
  messenger_latitude: number | null;
  messenger_longitude: number | null;
  messenger_location_updated_at: string | null;
  messenger_avatar_url?: string | null;
  delivery_fee: number;
  location_link: string | null;
  pre_confirmed: boolean;
  can_confirm: boolean;
  rating: number | null;
  tenant?: Tenant;
  total_amount?: number;
  products?: string | null;
  at_destination_at?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function playProximityBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota La5
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Web Audio beep error:', e);
  }
}

export function CustomerTracking() {
  const { token } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<PublicDelivery | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [preConfirming, setPreConfirming] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [ratingComment, setRatingComment] = useState('');

  const [proximityAlert, setProximityAlert] = useState(false);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const hasBeepedRef = useRef(false);

  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const messengerMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

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

  const loadRef = useRef(loadDelivery);
  loadRef.current = loadDelivery;
  useDeliveryWebSocket(token ? `/p/c/${token}/ws` : null, (ev) => {
    if (ev.type === 'state' || ev.type === 'location') loadRef.current(true);
  });

  useEffect(() => {
    loadDelivery();
  }, [token]);

  useEffect(() => {
    if (delivery?.id) setupPushForDelivery(delivery.id, 'customer');
  }, [delivery?.id]);

  useEffect(() => {
    if (delivery?.tenant) {
      applyTenantTheme(delivery.tenant);
    }
    return () => {
      applyTenantTheme(null);
    };
  }, [delivery?.tenant]);

  // Polling cada 5 segundos para actualizar ubicación del mensajero
  useEffect(() => {
    if (delivery?.state !== 'in_transit') return;
    const interval = setInterval(() => {
      loadDelivery(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [delivery?.state]);

  // ── Chat Realtime ──
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const msgs = await publicApi.get<ChatMessage[]>(`/p/c/${token}/chat`);
      setMessages(msgs);
      setUnreadCount(msgs.filter(m => m.sender === 'messenger' && !m.read_at).length);
    } catch { /* */ }
  }, [token]);

  async function shareMyLocation() {
    if (!token || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await publicApi.post(`/p/c/${token}/location`, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    });
  }

  // Destino: ubicación compartida del cliente o link del pedido
  const destCoords = delivery
    ? (delivery.customer_latitude != null && delivery.customer_longitude != null
        ? [Number(delivery.customer_latitude), Number(delivery.customer_longitude)] as [number, number]
        : parseLocationLink(delivery.location_link))
    : null;

  const messengerPos = delivery?.messenger_latitude != null && delivery?.messenger_longitude != null
    ? [Number(delivery.messenger_latitude), Number(delivery.messenger_longitude)] as [number, number]
    : null;

  const routeActive = !!(
    delivery?.pre_confirmed &&
    messengerPos &&
    destCoords &&
    (delivery.state === 'in_transit' || delivery.state === 'assigned')
  );

  const liveRouteInfo = useMapRoute(
    mapRef,
    routePolylineRef,
    messengerPos,
    destCoords,
    routeActive,
    { color: '#5b8af9', fitBounds: true },
  );

  useEffect(() => {
    if (liveRouteInfo) {
      setRouteInfo({ distance: liveRouteInfo.distance, duration: liveRouteInfo.duration });
      setEtaSeconds(liveRouteInfo.duration_sec);
    } else if (!routeActive) {
      setRouteInfo(null);
      setEtaSeconds(null);
    }
  }, [liveRouteInfo, routeActive]);

  // Parsear coordenadas del cliente (legacy helper para marcador)
  const getDestinationCoords = (): [number, number] => {
    return destCoords ?? [18.4861, -69.9312];
  };

  // Inicializar Leaflet Map
  useEffect(() => {
    if (!delivery || !mapContainerRef.current || mapRef.current) return;
    if (!delivery.pre_confirmed) return; // No inicializar mapa si no está pre-confirmado

    const dest = getDestinationCoords();

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(dest, 14);

    const isDark = document.documentElement.classList.contains('dark');
    tileLayerRef.current = L.tileLayer(
      isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(mapRef.current);

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

    // Forzar el redibujado de Leaflet después de montar
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      if (mapRef.current) {
        if (routePolylineRef.current) {
          mapRef.current.removeLayer(routePolylineRef.current);
          routePolylineRef.current = null;
        }
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, [delivery?.pre_confirmed]);

  // Actualizar Tile Layer en base al tema global
  useEffect(() => {
    const handleThemeChange = () => {
      if (!tileLayerRef.current) return;
      const isDark = document.documentElement.classList.contains('dark');
      tileLayerRef.current.setUrl(
        isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      );
    };
    window.addEventListener('themechange', handleThemeChange);
    return () => window.removeEventListener('themechange', handleThemeChange);
  }, []);

  // Actualizar marcador de destino cuando cambie el link de ubicación
  useEffect(() => {
    if (!mapRef.current || !delivery || !delivery.pre_confirmed) return;
    const dest = getDestinationCoords();
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.setLatLng(dest);
    }
  }, [delivery?.location_link, delivery?.pre_confirmed]);

  // Actualizar ubicación en tiempo real del mensajero en el mapa
  useEffect(() => {
    if (!mapRef.current || !delivery || !delivery.pre_confirmed) return;

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

      // Proximidad (Alerta sonora y visual si está a menos de 200 metros)
      const destCoords = getDestinationCoords();
      const distanceToDestination = calculateDistance(mLat, mLng, destCoords[0], destCoords[1]);
      if (distanceToDestination < 200) {
        setProximityAlert(true);
        notifyProximity('¡Repartidor cerca!', 'El mensajero está a menos de 200 metros.');
        if (!hasBeepedRef.current) {
          playProximityBeep();
          hasBeepedRef.current = true;
        }
      } else {
        setProximityAlert(false);
        resetProximityFlag();
        hasBeepedRef.current = false;
      }

      // Ajustar vista para incluir cliente y mensajero
      const dest = getDestinationCoords();
      const bounds = L.latLngBounds([dest, [mLat, mLng]]);
      mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      // Eliminar el marcador si ya no está en tránsito
      if (messengerMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(messengerMarkerRef.current);
        messengerMarkerRef.current = null;
      }
    }
  }, [delivery?.messenger_latitude, delivery?.messenger_longitude, delivery?.state, delivery?.pre_confirmed]);

  // Reloj ETA: cuenta regresiva de segundos
  useEffect(() => {
    if (etaSeconds === null || etaSeconds <= 0) return;
    const timer = setInterval(() => {
      setEtaSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [etaSeconds]);

  const formatETA = (totalSecs: number) => formatRouteDuration(totalSecs);

  async function confirmOrderDetails() {
    if (!token) return;
    setPreConfirming(true);
    setError('');
    try {
      await publicApi.post(`/p/c/${token}/pre-confirm`);
      setDelivery((d) => d ? { ...d, pre_confirmed: true } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar los datos');
    } finally {
      setPreConfirming(false);
    }
  }

  async function confirmReceipt() {
    if (!token || rating === 0) return;
    setConfirming(true);
    try {
      await publicApi.post(`/p/c/${token}/confirm`, { rating, comment: ratingComment || undefined });
      setRated(true);
      setDelivery((d) => d ? { ...d, can_confirm: false, rating } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar');
    } finally { setConfirming(false); }
  }

  const currentStep = delivery ? stepIndex(delivery.state) : -1;
  const isCancelled = delivery?.state === 'cancelled';

  // 1. Pantalla de Pre-confirmación del Cliente (si no está confirmado)
  if (delivery && !delivery.pre_confirmed) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b0b14] flex flex-col justify-between transition-colors duration-200">
        {/* Header */}
        <header className="bg-white dark:bg-[#13131f]/95 border-b border-slate-200 dark:border-[#252540] px-4 py-4 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
          <div className="flex items-center gap-2.5">
            {delivery?.tenant?.logo_url ? (
              <img src={delivery.tenant.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <IconPackage size={16} className="text-primary" />
              </div>
            )}
            <span className="font-bold text-sm text-slate-800 dark:text-[#e8e8f4]">
              {delivery?.tenant?.name ?? 'Envíos App'}
            </span>
          </div>
          <ThemeToggle />
        </header>

        {/* Panel de Confirmación */}
        <main className="flex-1 flex items-center justify-center p-4 max-w-md mx-auto w-full">
          <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl p-6 shadow-xl w-full flex flex-col gap-5 transition-all duration-200">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#5b8af9]/10 flex items-center justify-center mx-auto mb-3">
                <IconPackage size={24} color="#5b8af9" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-[#e8e8f4]">Confirmar Datos de Envío</h2>
              <p className="text-xs text-slate-500 dark:text-[#6b6b8a] mt-1.5 leading-relaxed">
                Por favor, verifique que la información del pedido sea correcta para activar el seguimiento en vivo.
              </p>
            </div>

            <div className="space-y-4 bg-slate-50 dark:bg-[#0b0b14] p-4 rounded-xl border border-slate-100 dark:border-[#252540]/60 transition-colors duration-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Cliente</span>
                <p className="text-sm font-bold text-slate-800 dark:text-[#e8e8f4] mt-0.5">{delivery.customer_name}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Teléfono</span>
                <p className="text-sm font-medium text-slate-800 dark:text-[#e8e8f4] mt-0.5">{delivery.customer_phone}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Dirección de Entrega</span>
                <p className="text-sm font-medium text-slate-800 dark:text-[#e8e8f4] mt-0.5">{delivery.customer_address}</p>
                {delivery.customer_reference && (
                  <p className="text-xs text-slate-500 dark:text-[#6b6b8a] mt-1 italic">Referencia: {delivery.customer_reference}</p>
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Costo del Envío</span>
                <p className="text-base font-extrabold text-[#5b8af9] mt-0.5">
                  {delivery.delivery_fee > 0 ? `RD$ ${delivery.delivery_fee.toFixed(2)}` : 'Gratis'}
                </p>
              </div>

              {delivery.total_amount !== undefined && delivery.total_amount > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Monto del Pedido</span>
                  <p className="text-sm font-extrabold text-[#22c55e] mt-0.5">
                    RD$ {delivery.total_amount.toFixed(2)}
                  </p>
                </div>
              )}

              {delivery.products && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Productos</span>
                  <p className="text-xs text-slate-800 dark:text-[#e8e8f4] mt-0.5 font-medium leading-relaxed">{delivery.products}</p>
                </div>
              )}

              {delivery.notes && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Notas Adicionales</span>
                  <p className="text-xs text-slate-600 dark:text-[#6b6b8a] italic mt-0.5 leading-relaxed">{delivery.notes}</p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-[#2a0a0a] text-red-600 dark:text-[#ef4444] border border-red-100 dark:border-red-900/50 rounded-xl text-xs font-semibold text-center transition-all">
                {error}
              </div>
            )}

            <button
              onClick={confirmOrderDetails}
              disabled={preConfirming}
              className="w-full py-3.5 bg-[#5b8af9] hover:bg-[#3a68e0] active:scale-[.98] text-white font-extrabold text-sm rounded-xl transition-all border-0 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#5b8af9]/20"
            >
              {preConfirming ? 'Procesando...' : 'Confirmar Datos y Activar Mapa'}
            </button>
          </div>
        </main>

        <footer className="py-4 text-center text-[10px] text-slate-400 dark:text-[#6b6b8a] transition-colors duration-200">
          Envíos App by Renace.tech © 2026 • Logística y Despacho
        </footer>
      </div>
    );
  }

  // 2. Pantalla de Seguimiento (si ya está pre-confirmado)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0b14] flex flex-col transition-colors duration-200">
      <OnboardingTour role="customer" />
      {/* Header */}
      <header className="bg-white dark:bg-[#13131f]/95 backdrop-blur border-b border-slate-200 dark:border-[#252540] px-4 py-3 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
        <div className="flex items-center gap-2.5">
          {delivery?.tenant?.logo_url ? (
            <img src={delivery.tenant.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <IconPackage size={16} className="text-primary" />
            </div>
          )}
          <span className="font-bold text-sm text-slate-800 dark:text-[#e8e8f4]">
            {delivery?.tenant?.name ?? 'EnvíosRH'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-[#6b6b8a] font-semibold uppercase tracking-wider">
            Seguimiento en Vivo
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Mapa */}
      <div className="relative flex-1 min-h-[240px] md:min-h-[360px] z-10">
        <div ref={mapContainerRef} className="w-full h-full bg-[#f8fafc] dark:bg-[#0b0b14]" />
        {delivery?.state === 'in_transit' && (
          <div className="absolute bottom-3 left-3 z-[999] bg-[#f59e0b]/90 text-[#0b0b14] px-3 py-1.5 rounded-lg text-[10px] font-extrabold shadow-lg flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#0b0b14]"></span> MOTO EN CAMINO
          </div>
        )}
        {delivery?.at_destination_at && delivery.state === 'in_transit' && (
          <div className="absolute top-3 right-3 z-[999] bg-[#22c55e]/95 text-white px-3 py-1.5 rounded-lg text-[10px] font-extrabold shadow-lg" role="status">
            🎯 Mensajero en tu ubicación
          </div>
        )}
        {routeInfo && routeActive && (
          <div className="absolute top-3 left-3 z-[999] bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-xl p-3 shadow-lg flex flex-col gap-1 transition-all">
            <span className="text-[9px] text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider font-bold">Ruta en vivo</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-slate-800 dark:text-[#e8e8f4] animate-pulse">
                {etaSeconds !== null ? (etaSeconds <= 0 ? '¡Llegando!' : formatETA(etaSeconds)) : routeInfo.duration}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-[#6b6b8a]">{routeInfo.distance}</span>
            </div>
          </div>
        )}
      </div>

      {/* Panel de Detalles */}
      <main className="bg-white dark:bg-[#13131f] border-t border-slate-200 dark:border-[#252540] p-4 flex flex-col gap-4 max-w-md mx-auto w-full rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-20 pb-8 transition-colors duration-200">
        {error && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-[#2a0a0a] flex items-center justify-center border border-red-100 dark:border-red-900/50">
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
                <div className="text-[10px] text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider font-semibold">Envío para</div>
                <h2 className="text-base font-bold text-slate-800 dark:text-[#e8e8f4] mt-0.5">{delivery.customer_name ?? 'Tu Pedido'}</h2>
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
              <div className="bg-slate-50 dark:bg-[#0b0b14] border border-slate-100 dark:border-[#252540]/60 rounded-xl p-4 flex flex-col gap-3 transition-colors duration-200">
                <div className="flex justify-between items-center">
                  {STEPS.map((step, idx) => {
                    const done    = currentStep > idx;
                    const current = currentStep === idx;
                    return (
                      <div key={step.state} className="flex flex-col items-center gap-1.5 relative flex-1">
                        {/* Línea conectora */}
                        {idx < STEPS.length - 1 && (
                          <div className={`absolute left-1/2 top-4 w-full h-[2px] -z-10 ${currentStep > idx ? 'bg-[#22c55e]' : 'bg-slate-200 dark:bg-[#252540]'}`} />
                        )}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${
                          done    ? 'bg-[#22c55e] text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'      :
                          current ? 'bg-[#5b8af9] text-white shadow-[0_0_10px_rgba(91,138,249,0.4)] font-bold scale-110' :
                          'bg-white dark:bg-[#13131f] text-slate-300 dark:text-[#3a3a58] border border-slate-200 dark:border-[#252540]'
                        }`}>
                          {done ? <IconCheck size={14} color="#ffffff" /> : step.icon}
                        </div>
                        <span className={`text-[9px] font-bold tracking-tight text-center ${
                          done ? 'text-[#22c55e]' : current ? 'text-slate-800 dark:text-[#e8e8f4]' : 'text-slate-400 dark:text-[#3a3a58]'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detalles del Pedido (Productos y Monto) */}
            {(delivery.products || (delivery.total_amount !== undefined && delivery.total_amount > 0)) && (
              <div className="bg-slate-50 dark:bg-[#0b0b14] border border-slate-100 dark:border-[#252540]/60 rounded-xl p-4 flex flex-col gap-3 transition-colors duration-200">
                {delivery.products && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Productos</span>
                    <p className="text-xs text-slate-800 dark:text-[#e8e8f4] mt-1 font-semibold leading-relaxed">{delivery.products}</p>
                  </div>
                )}
                {delivery.total_amount !== undefined && delivery.total_amount > 0 && (
                  <div className="flex justify-between items-center border-t border-slate-200/50 dark:border-[#252540]/40 pt-2.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">Monto Total del Pedido</span>
                    <p className="text-sm font-extrabold text-[#22c55e]">RD$ {delivery.total_amount.toFixed(2)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Datos del Mensajero */}
            {delivery.messenger_name && !isCancelled && (
              <div className="bg-slate-50 dark:bg-[#0b0b14] border border-slate-100 dark:border-[#252540]/60 rounded-xl p-3.5 flex items-center gap-3 transition-colors duration-200">
                {delivery.messenger_avatar_url ? (
                  <img src={delivery.messenger_avatar_url} alt={delivery.messenger_name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#5b8af9]/30" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#5b8af9]/20 flex items-center justify-center font-bold text-[#5b8af9] text-sm shrink-0 border border-[#5b8af9]/30">
                    {delivery.messenger_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider font-semibold">Tu Repartidor</div>
                  <div className="font-bold text-slate-800 dark:text-[#e8e8f4] text-sm mt-0.5">{delivery.messenger_name}</div>
                </div>
                {delivery.messenger_phone && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setShowChat(true)}
                      className="relative px-3 py-1.5 rounded-lg bg-[#5b8af9]/15 text-[#5b8af9] text-xs font-bold hover:bg-[#5b8af9]/25 transition-colors border-0 cursor-pointer flex items-center gap-1"
                    >
                      <IconMessage size={13} /> Chat
                      {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-1 animate-bounce shadow-lg">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>
                    <a href={`tel:${delivery.messenger_phone}`} className="px-3 py-1.5 rounded-lg bg-[#5b8af9] text-white text-xs font-bold hover:bg-[#3a68e0] transition-colors decoration-none flex items-center">
                      Llamar
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Confirmar recepción */}
            {delivery.can_confirm && !rated && (
              <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-xl p-4 flex flex-col gap-3.5 shadow-lg transition-colors duration-200">
                <div className="text-sm font-extrabold text-slate-800 dark:text-[#e8e8f4]">¿Llegó tu pedido?</div>
                <div className="text-xs text-slate-500 dark:text-[#6b6b8a] leading-relaxed">Confirma que recibiste tu envío sin inconvenientes y califica tu experiencia.</div>
                <div className="flex justify-center py-1">
                  <StarRating value={rating} onChange={setRating} />
                </div>
                <textarea
                  className="input h-16 resize-none text-sm"
                  placeholder="Comentario sobre la entrega (opcional)"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                />
                <button
                  type="button"
                  onClick={shareMyLocation}
                  className="w-full py-2 rounded-xl border border-[#5b8af9]/30 text-[#5b8af9] text-xs font-bold bg-transparent cursor-pointer"
                >
                  📍 Compartir mi ubicación actual
                </button>
                <button
                  onClick={confirmReceipt}
                  disabled={confirming || rating === 0}
                  className="w-full py-3.5 rounded-xl bg-[#22c55e] text-white font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#1f9e4c] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer shadow-lg shadow-[#22c55e]/25"
                >
                  {confirming ? 'Confirmando…' : <><IconCheck size={16} color="#ffffff" /> Confirmar Recepción</>}
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
                    <IconStar key={s} size={24} color={s <= (delivery.rating ?? 0) ? '#f59e0b' : '#e2e8f0'} />
                  ))}
                </div>
              </div>
            )}

            {/* Mensaje de cancelación */}
            {isCancelled && (
              <div className="bg-red-50 dark:bg-[#ef4444]/10 border border-red-100 dark:border-[#ef4444]/20 rounded-xl p-4 flex flex-col items-center gap-2 text-center transition-colors duration-200">
                <p className="text-xs text-slate-500 dark:text-[#6b6b8a]">Este envío fue cancelado y no se encuentra activo.</p>
              </div>
            )}
          </>
        )}
      </main>

      {proximityAlert && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] bg-green-500 text-[#0b0b14] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-green-400 max-w-sm w-full mx-4">
          <div className="w-8 h-8 rounded-full bg-[#0b0b14] flex items-center justify-center shrink-0">
            <IconMotorbike size={18} color="#22c55e" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[11px] font-extrabold uppercase tracking-wider">¡Repartidor Cerca!</div>
            <div className="text-[10px] font-bold opacity-90">El mensajero está a menos de 200 metros de tu ubicación.</div>
          </div>
        </div>
      )}

      {delivery && (
        <ChatPanel
          open={showChat}
          onClose={() => setShowChat(false)}
          peerName={delivery.messenger_name ?? 'Mensajero'}
          peerInitial={delivery.messenger_name?.charAt(0).toUpperCase() || 'M'}
          messages={messages}
          mySender="customer"
          streamPath={token ? `/p/c/${token}/stream` : null}
          onLoad={loadMessages}
          onMarkRead={() => token ? publicApi.post(`/p/c/${token}/chat/read`, {}) : Promise.resolve()}
          onTyping={(typing) => token ? publicApi.post(`/p/c/${token}/typing`, { typing }) : Promise.resolve()}
          onSend={async (text) => { await publicApi.post(`/p/c/${token}/chat`, { message: text }); await loadMessages(); }}
          placeholder="Escribe un mensaje al mensajero..."
        />
      )}
    </div>
  );
}

