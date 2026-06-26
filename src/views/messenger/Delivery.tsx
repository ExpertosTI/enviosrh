import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import {
  IconMap, IconMotorbike, IconCheck, IconNavigate,
  IconPackage, IconMessage, IconSend,
} from '../../components/Icons';
import { useGps } from '../../lib/GpsContext';

// ── Tipos ───────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  sender: 'messenger' | 'customer' | 'operator';
  message: string;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────
function NavBtn({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[.97]"
      style={{ background: color + '20', color }}
    >
      {icon}{label}
    </a>
  );
}

// ── Componente Principal ─────────────────────────────────────────────
export function MessengerDelivery() {
  const { id } = useParams<{ id: string }>();
  const { coords, accuracy, status: gpsStatus } = useGps();

  // Delivery state
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [note, setNote]         = useState('');

  // Mapa Leaflet
  const mapContainerRef        = useRef<HTMLDivElement>(null);
  const mapRef                 = useRef<L.Map | null>(null);
  const tileLayerRef           = useRef<L.TileLayer | null>(null);
  const courierMarkerRef       = useRef<L.Marker | null>(null);
  const destinationMarkerRef   = useRef<L.Marker | null>(null);
  const routePolylineRef       = useRef<L.Polyline | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [mapReady, setMapReady]   = useState(false);

  // Chat
  const [showChat, setShowChat]       = useState(false);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg]           = useState('');
  const [sendingMsg, setSendingMsg]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenIdRef = useRef<string | null>(null);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  // Firma digital
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing]   = useState(false);
  const [hasSig, setHasSig]         = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Foto de prueba
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [proofImgUrl, setProofImgUrl]       = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // ── Cargar datos del envío ────────────────────────────────────────
  const loadDelivery = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const d = await api.get<Delivery>(`/deliveries/${id}`);
      setDelivery(d);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDelivery();
    const iv = setInterval(() => loadDelivery(true), 8000);
    return () => clearInterval(iv);
  }, [loadDelivery]);

  // ── Chat: cargar mensajes ────────────────────────────────────────
  const loadMessages = useCallback(async (fromBg = false) => {
    if (!id) return;
    if (!showChat && !fromBg) return;
    try {
      const msgs = await api.get<ChatMessage[]>(`/deliveries/${id}/messages`);
      setMessages(msgs);
      if (!showChat) {
        const lastSeen = lastSeenIdRef.current;
        const fromClient = msgs.filter(m => m.sender === 'customer');
        if (!lastSeen) {
          setUnreadCount(fromClient.length);
        } else {
          const idx = msgs.findIndex(m => m.id === lastSeen);
          setUnreadCount(msgs.slice(idx + 1).filter(m => m.sender === 'customer').length);
        }
      } else {
        if (msgs.length > 0) lastSeenIdRef.current = msgs[msgs.length - 1].id;
        setUnreadCount(0);
      }
    } catch { /* silencioso */ }
  }, [id, showChat]);

  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (iv) return;
      loadMessages(true);
      iv = setInterval(() => {
        if (document.visibilityState === 'visible') loadMessages(true);
      }, showChat ? 3000 : 10000);
    };
    const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
    const onVis = () => document.visibilityState === 'visible' ? (loadMessages(true), start()) : stop();
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [showChat, loadMessages]);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showChat]);

  const handleOpenChat = () => {
    setShowChat(true);
    setUnreadCount(0);
    if (messages.length > 0) lastSeenIdRef.current = messages[messages.length - 1].id;
  };

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newMsg.trim() || sendingMsg) return;
    setSendingMsg(true);
    try {
      const sent = await api.post<ChatMessage>(`/deliveries/${id}/messages`, { message: newMsg });
      setMessages(prev => [...prev, sent]);
      setNewMsg('');
      lastSeenIdRef.current = sent.id;
    } catch { /* ignorar */ }
    finally { setSendingMsg(false); }
  }

  // ── Extraer coordenadas de destino ───────────────────────────────
  const getDestCoords = useCallback((): [number, number] | null => {
    if (!delivery?.location_link) return null;
    const match =
      delivery.location_link.match(/@([-\d.]+),([-\d.]+)/) ||
      delivery.location_link.match(/\?([-\d.]+),([-\d.]+)/) ||
      delivery.location_link.match(/([-\d.]+),\s*([-\d.]+)/);
    if (match) return [Number(match[1]), Number(match[2])];
    return null;
  }, [delivery?.location_link]);

  // ── Inicializar mapa ─────────────────────────────────────────────
  useEffect(() => {
    if (!delivery || !mapContainerRef.current || mapRef.current) return;
    const dest = getDestCoords();
    const center: [number, number] = dest ?? [18.4861, -69.9312];

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 15);

    const isDark = document.documentElement.classList.contains('dark');
    tileLayerRef.current = L.tileLayer(
      isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(mapRef.current);

    // Marcador destino (cliente)
    if (dest) {
      const custIcon = L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:rgba(239,68,68,0.18);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(239,68,68,0.5)">
                 <div style="width:14px;height:14px;border-radius:50%;background:#ef4444"></div>
               </div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      destinationMarkerRef.current = L.marker(dest, { icon: custIcon })
        .addTo(mapRef.current)
        .bindPopup(`<b>📦 ${delivery.customer_name ?? 'Destino'}</b>`);
    }

    setTimeout(() => { mapRef.current?.invalidateSize(); setMapReady(true); }, 300);

    return () => {
      routePolylineRef.current = null;
      courierMarkerRef.current = null;
      destinationMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.id]);

  // ── Actualizar tile al cambiar tema ──────────────────────────────
  useEffect(() => {
    const onTheme = () => {
      if (!tileLayerRef.current) return;
      const isDark = document.documentElement.classList.contains('dark');
      tileLayerRef.current.setUrl(
        isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      );
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  // ── Marcador mensajero (GPS del contexto) ────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !coords) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:40px;height:40px;border-radius:50%;background:rgba(91,138,249,0.2);border:2.5px solid #5b8af9;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(91,138,249,0.6)">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="2.5">
                 <circle cx="12" cy="5" r="3"/><path d="M5 12h14l-4 8H9l-4-8z"/>
               </svg>
             </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20],
    });
    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(coords, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
    } else {
      courierMarkerRef.current.setLatLng(coords).setIcon(icon);
    }
  }, [coords, mapReady]);

  // ── Ruta OSRM ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !coords || delivery?.state !== 'in_transit') {
      if (routePolylineRef.current && mapRef.current) {
        mapRef.current.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      setRouteInfo(null);
      return;
    }
    const dest = getDestCoords();
    if (!dest) return;

    fetch(`https://router.project-osrm.org/route/v1/driving/${coords[1]},${coords[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        if (data.code !== 'Ok' || !data.routes?.[0]) return;
        const route = data.routes[0];
        setRouteInfo({
          distance: `${(route.distance / 1000).toFixed(1)} km`,
          duration: `${Math.round(route.duration / 60)} min`,
        });
        const latlngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        if (!mapRef.current) return;
        if (!routePolylineRef.current) {
          routePolylineRef.current = L.polyline(latlngs, {
            color: '#f59e0b', weight: 4, opacity: 0.85, dashArray: '6, 10',
          }).addTo(mapRef.current);
        } else {
          routePolylineRef.current.setLatLngs(latlngs);
        }
      })
      .catch(() => {/* ignorar */});
  }, [coords, delivery?.state, mapReady, getDestCoords]);

  // ── Controles de mapa ────────────────────────────────────────────
  const recenterMap = () => {
    if (mapRef.current && coords) mapRef.current.flyTo(coords, 16, { animate: true, duration: 0.8 });
  };
  const fitBothMarkers = () => {
    if (!mapRef.current || !coords) return;
    const dest = getDestCoords();
    if (dest) mapRef.current.fitBounds(L.latLngBounds([dest, coords]), { padding: [60, 60], maxZoom: 15 });
  };

  // ── Acciones ─────────────────────────────────────────────────────
  async function markInTransit() {
    if (!id) return;
    setLoading(true); setError('');
    try {
      await api.patch(`/deliveries/${id}/in-transit`);
      setDelivery(p => p ? { ...p, state: 'in_transit' as DeliveryState } : p);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function markDelivered() {
    if (!id) return;
    setLoading(true); setError('');
    try {
      await api.patch(`/deliveries/${id}/deliver`, { note: note || undefined });
      setDelivery(p => p ? { ...p, state: 'delivered' as DeliveryState } : p);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  // ── Firma digital ────────────────────────────────────────────────
  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function sigDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e);
    lastPointRef.current = p;
    setIsDrawing(true); setHasSig(true);
    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (ctx) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#e8e8f4'; ctx.fill(); }
  }
  function sigMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !lastPointRef.current) return;
    const ctx = signatureCanvasRef.current?.getContext('2d');
    const p = getCanvasPoint(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#e8e8f4'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPointRef.current = p;
  }
  function sigUp() { setIsDrawing(false); lastPointRef.current = null; }
  function clearSig() {
    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, 350, 120);
    setHasSig(false);
  }

  // ── Foto de entrega ──────────────────────────────────────────────
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await r.json();
      setProofImgUrl(data.url ?? null);
    } catch { setError('Error al subir foto'); }
    finally { setUploadingProof(false); }
  }

  // ── Render ───────────────────────────────────────────────────────
  if (!delivery) {
    return (
      <AppShell>
        {error
          ? <div className="p-6"><div className="banner-error">{error}</div></div>
          : <div className="spinner" />}
      </AppShell>
    );
  }

  const isAssigned  = delivery.state === 'assigned';
  const isInTransit = delivery.state === 'in_transit';
  const isDelivered = delivery.state === 'delivered';

  const gpsCoords = delivery.location_link?.match(/[-\d.]+,[-\d.]+/)?.[0];
  const mapsUrl   = delivery.location_link?.startsWith('http')
    ? delivery.location_link
    : gpsCoords ? `https://www.google.com/maps/search/?api=1&query=${gpsCoords}` : null;
  const wazeUrl = gpsCoords ? `https://waze.com/ul?ll=${gpsCoords}&navigate=yes` : null;

  const gpsColor = gpsStatus === 'active' ? '#22c55e' : gpsStatus === 'requesting' ? '#f59e0b' : '#ef4444';
  const gpsLabel = gpsStatus === 'active'
    ? `GPS Activo · ±${accuracy ? Math.round(accuracy) : '?'}m`
    : gpsStatus === 'requesting' ? 'Buscando GPS…'
    : gpsStatus === 'denied' ? 'GPS bloqueado'
    : 'GPS inactivo';

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        title="Detalle del envío"
        back="/mensajero"
        actions={
          <div className="flex items-center gap-2">
            {/* Chat button */}
            <button
              onClick={handleOpenChat}
              className="relative flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#5b8af9]/15 text-[#5b8af9] border border-[#5b8af9]/25 cursor-pointer text-[10px] font-bold hover:bg-[#5b8af9]/25 transition-all"
            >
              <IconMessage size={13} /> Chat
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-1 animate-bounce shadow-lg">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {/* GPS badge */}
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0b0b14] border border-[#252540] text-[10px] font-bold"
              style={{ color: gpsColor }}
            >
              <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'animate-pulse' : ''}`} style={{ background: gpsColor }} />
              {gpsLabel}
            </span>
          </div>
        }
      />

      {/* ── Mapa ─────────────────────────────────────────────────── */}
      <div className="relative z-10" style={{ minHeight: '52vw', maxHeight: '55vh', height: '52vw' }}>
        <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" style={{ minHeight: 'inherit', height: 'inherit' }} />

        {/* Info de ruta */}
        {routeInfo && (
          <div className="absolute top-3 left-3 z-[999] bg-[#13131f]/95 border border-[#252540] rounded-xl p-2.5 shadow-lg flex flex-col gap-0.5">
            <span className="text-[9px] text-[#6b6b8a] uppercase tracking-wider font-bold">A destino</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black text-white">{routeInfo.duration}</span>
              <span className="text-[10px] text-[#6b6b8a]">{routeInfo.distance}</span>
            </div>
          </div>
        )}

        {/* Indicador "en camino" */}
        {isInTransit && (
          <div className="absolute bottom-3 left-3 z-[999] bg-[#f59e0b]/90 text-[#0b0b14] px-2.5 py-1 rounded-lg text-[10px] font-extrabold shadow-lg flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0b0b14]" /> EN CAMINO
          </div>
        )}

        {/* Precisión GPS */}
        {gpsStatus === 'active' && accuracy !== null && (
          <div className="absolute bottom-3 right-3 z-[999] bg-[#13131f]/80 border border-[#252540] rounded-lg px-2 py-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[10px] text-[#6b6b8a]">±{Math.round(accuracy)}m</span>
          </div>
        )}

        {/* Controles flotantes */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
          {coords && (
            <button
              onClick={recenterMap}
              className="w-9 h-9 rounded-xl bg-[#13131f]/90 border border-[#252540] flex items-center justify-center text-[#5b8af9] hover:bg-[#5b8af9] hover:text-white transition-colors cursor-pointer shadow-lg"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
              </svg>
            </button>
          )}
          {coords && isInTransit && getDestCoords() && (
            <button
              onClick={fitBothMarkers}
              className="w-9 h-9 rounded-xl bg-[#13131f]/90 border border-[#252540] flex items-center justify-center text-[#f59e0b] hover:bg-[#f59e0b] hover:text-[#0b0b14] transition-colors cursor-pointer shadow-lg"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Panel de información ──────────────────────────────────── */}
      <div className="p-4 md:p-6 max-w-lg mx-auto flex flex-col gap-4 pb-10">
        {error && <div className="banner-error">{error}</div>}

        {/* Card cliente */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#5b8af9]/15 flex items-center justify-center shrink-0">
              <IconPackage size={20} color="#5b8af9" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[#e8e8f4]">{delivery.customer_name ?? 'Cliente'}</div>
              {delivery.customer_phone && (
                <a href={`tel:${delivery.customer_phone}`} className="text-xs text-[#5b8af9] hover:underline">
                  {delivery.customer_phone}
                </a>
              )}
            </div>
            {/* Cobrar */}
            {Number(delivery.delivery_fee) > 0 && (
              <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl px-3 py-1.5 text-right shrink-0">
                <div className="text-[9px] text-[#22c55e] uppercase tracking-wider font-bold">Cobrar</div>
                <div className="text-sm font-extrabold text-[#e8e8f4]">RD${Number(delivery.delivery_fee).toFixed(0)}</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {(delivery.customer_address ?? delivery.address_override) && (
              <div className="p-3 bg-[#0b0b14] rounded-xl">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide mb-1">Dirección</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.customer_address ?? delivery.address_override}</div>
              </div>
            )}
            {delivery.customer_reference && (
              <div className="p-3 bg-[#0b0b14] rounded-xl">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide mb-1">Referencia</div>
                <div className="text-sm text-[#f59e0b]">📍 {delivery.customer_reference}</div>
              </div>
            )}
            {delivery.products && (
              <div className="p-3 bg-[#0b0b14] rounded-xl">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide mb-1">Productos</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.products}</div>
              </div>
            )}
            {delivery.notes && (
              <div className="p-3 bg-[#2a1800]/40 rounded-xl border border-[#f59e0b]/20">
                <div className="text-[10px] text-[#f59e0b] uppercase tracking-wide mb-1">Instrucciones</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Navegación */}
        {(mapsUrl || wazeUrl) && (isAssigned || isInTransit) && (
          <div className="flex gap-2">
            {mapsUrl && <NavBtn href={mapsUrl} icon={<IconMap size={15} />} label="Google Maps" color="#4285F4" />}
            {wazeUrl && <NavBtn href={wazeUrl} icon={<IconNavigate size={15} />} label="Waze" color="#35CAED" />}
          </div>
        )}

        {/* Acción: Salir a entregar */}
        {isAssigned && (
          <button
            onClick={markInTransit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#f59e0b] text-[#0b0b14] font-extrabold text-base hover:bg-[#e08e00] active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer shadow-lg shadow-[#f59e0b]/25"
          >
            <IconMotorbike size={20} color="#0b0b14" />
            {loading ? 'Iniciando entrega…' : '🛵 Salir a Entregar'}
          </button>
        )}

        {/* Acción: Confirmar entrega */}
        {isInTransit && (
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4 flex flex-col gap-4">
            <div className="text-sm font-bold text-[#e8e8f4]">Confirmar entrega</div>

            {/* Foto de prueba */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b8a]">Foto de Entrega (Opcional)</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#252540] hover:border-[#5b8af9] bg-[#0b0b14] text-[#e8e8f4] text-xs font-bold transition-all cursor-pointer"
                >
                  Tomar Foto
                </button>
                <input type="file" accept="image/*" capture="environment" ref={photoInputRef} className="hidden" onChange={handlePhotoCapture} />
                {uploadingProof && <span className="text-xs text-[#6b6b8a]">Subiendo…</span>}
                {proofImgUrl && (
                  <img src={proofImgUrl} alt="Prueba" className="w-12 h-12 object-cover rounded-xl border border-[#22c55e]/30 shrink-0" />
                )}
              </div>
            </div>

            {/* Firma digital */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b8a]">Firma del Cliente (Opcional)</label>
                {hasSig && (
                  <button type="button" onClick={clearSig} className="text-[10px] text-red-500 hover:underline bg-transparent border-0 cursor-pointer font-bold">
                    Borrar
                  </button>
                )}
              </div>
              <div className="relative w-full rounded-xl bg-[#0b0b14] border border-[#252540] overflow-hidden" style={{ height: 120 }}>
                <canvas
                  ref={signatureCanvasRef}
                  width={350} height={120}
                  onPointerDown={sigDown} onPointerMove={sigMove} onPointerUp={sigUp}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                {!hasSig && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[11px] text-[#3a3a58]">Firma aquí</span>
                  </div>
                )}
              </div>
            </div>

            <textarea
              className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/30 resize-none placeholder:text-[#6b6b8a]"
              placeholder="Nota de entrega (opcional)…"
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button
              onClick={markDelivered}
              disabled={loading || uploadingProof}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#22c55e] text-[#0b0b14] font-extrabold text-base hover:bg-[#1f9e4c] active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer shadow-lg shadow-[#22c55e]/25"
            >
              <IconCheck size={20} color="#0b0b14" />
              {loading ? 'Confirmando…' : '✅ Confirmar Entrega'}
            </button>
          </div>
        )}

        {/* Estado: Entregado */}
        {isDelivered && (
          <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
              <IconCheck size={24} color="#22c55e" />
            </div>
            <div className="font-extrabold text-[#22c55e] text-base">¡Envío Entregado!</div>
            <p className="text-xs text-[#6b6b8a]">El cliente fue notificado. ¡Buen trabajo! 🎉</p>
          </div>
        )}

        {/* Estado: Cancelado */}
        {delivery.state === 'cancelled' && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4 flex flex-col items-center gap-2 text-center">
            <div className="font-bold text-[#ef4444]">Envío Cancelado</div>
            <p className="text-xs text-[#6b6b8a]">Este envío fue cancelado por el operador.</p>
          </div>
        )}
      </div>

      {/* ── Modal Chat ───────────────────────────────────────────── */}
      {showChat && (
        <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-[#13131f] border-t sm:border border-[#252540] rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl" style={{ height: '88vh', maxHeight: 600 }}>
            {/* Header chat */}
            <div className="px-4 py-3 border-b border-[#252540] flex justify-between items-center bg-[#0b0b14]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#5b8af9]/15 flex items-center justify-center font-bold text-[#5b8af9] text-xs">
                  {delivery.customer_name?.charAt(0).toUpperCase() || 'C'}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#e8e8f4]">{delivery.customer_name ?? 'Cliente'}</div>
                  <div className="text-[9px] text-[#6b6b8a] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5b8af9] animate-pulse" /> Chat del envío
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-[#6b6b8a] hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1.5 rounded-lg hover:bg-[#252540] transition-colors text-xs font-bold"
              >
                Cerrar
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0b0b14]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#252540]/60 flex items-center justify-center">
                    <IconMessage size={18} color="#6b6b8a" />
                  </div>
                  <p className="text-xs font-bold text-[#6b6b8a]">Di algo para iniciar el chat</p>
                  <p className="text-[10px] text-[#3a3a58]">El cliente lo verá desde su link de seguimiento.</p>
                </div>
              ) : (
                messages.map(m => {
                  const isMe = m.sender === 'messenger';
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                        isMe
                          ? 'bg-[#5b8af9] text-white rounded-tr-none'
                          : 'bg-[#1c1c30] text-[#e8e8f4] border border-[#252540] rounded-tl-none'
                      }`}>
                        <p className="break-words">{m.message}</p>
                        <div className={`text-[8px] mt-1 text-right ${isMe ? 'text-white/70' : 'text-[#6b6b8a]'}`}>
                          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#252540] flex gap-2 bg-[#13131f]">
              <input
                type="text"
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                placeholder="Escribe un mensaje al cliente…"
                className="flex-1 bg-[#0b0b14] border border-[#252540] rounded-xl px-3 py-2 text-xs outline-none text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
              />
              <button
                type="submit"
                disabled={!newMsg.trim() || sendingMsg}
                className="p-2.5 rounded-xl bg-[#5b8af9] hover:bg-[#3a68e0] text-white disabled:opacity-40 transition-colors border-0 cursor-pointer flex items-center justify-center"
              >
                <IconSend size={15} color="#ffffff" />
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
