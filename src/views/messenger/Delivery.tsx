import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import { api, uploadFile } from '../../lib/api';
import type { Delivery } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import {
  IconMap, IconNavigate,
  IconMessage,
} from '../../components/Icons';
import { useGps } from '../../lib/GpsContext';
import { ChatPanel, type ChatMessage } from '../../components/ChatPanel';
import { QrScanner } from '../../components/QrScanner';
import { TurnByTurn } from '../../components/TurnByTurn';
import { enqueueAction } from '../../lib/offline';
import { useI18n } from '../../lib/i18n';
import { parseLocationLink } from '../../lib/coords';
import { useMapRoute } from '../../lib/useMapRoute';

// ── Componente Principal ─────────────────────────────────────────────
export function MessengerDelivery() {
  const { id } = useParams<{ id: string }>();
  const { coords, status: gpsStatus } = useGps();
  const { t } = useI18n();

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [note, setNote]         = useState('');

  // Mapa
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const tileLayerRef    = useRef<L.TileLayer | null>(null);
  const courierMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const historyLineRef = useRef<L.Polyline | null>(null);

  // Firma y Foto
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [proofImgUrl, setProofImgUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // ── Lógica de Carga ──────────────────────────────────────────────
  const loadDelivery = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const d = await api.get<Delivery>(`/deliveries/${id}`);
      setDelivery(d);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDelivery();
    const iv = setInterval(() => loadDelivery(true), 10000);
    return () => clearInterval(iv);
  }, [loadDelivery]);

  // ── Lógica de Chat ───────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!id) return;
    try {
      const msgs = await api.get<ChatMessage[]>(`/deliveries/${id}/messages`);
      setMessages(msgs);
      setUnreadCount(msgs.filter(m => m.sender === 'customer' && !m.read_at).length);
    } catch { /* */ }
  }, [id]);

  useEffect(() => {
    if (!id || !mapRef.current) return;
    api.get<{ lat: number; lng: number }[]>(`/deliveries/${id}/location-history`)
      .then(points => {
        if (!mapRef.current || points.length < 2) return;
        const latlngs = points.map(p => [p.lat, p.lng] as [number, number]);
        if (historyLineRef.current) mapRef.current.removeLayer(historyLineRef.current);
        historyLineRef.current = L.polyline(latlngs, { color: '#a78bfa', weight: 3, opacity: 0.7, dashArray: '4,6' }).addTo(mapRef.current);
      }).catch(() => {});
  }, [id, delivery?.state]);

  // ── Mapa ────────────────────────────────────────────────────────
  const destCoords = delivery ? parseLocationLink(delivery.location_link) : null;

  const routeInfo = useMapRoute(
    mapRef,
    routePolylineRef,
    coords,
    destCoords,
    !!(delivery && (delivery.state === 'assigned' || delivery.state === 'in_transit') && coords && destCoords),
    { color: delivery?.state === 'in_transit' ? '#f59e0b' : '#5b8af9', fitBounds: false },
  );

  useEffect(() => {
    if (!delivery || !mapContainerRef.current || mapRef.current) return;
    const dest = destCoords || [18.4861, -69.9312];

    mapRef.current = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView(dest, 15);
    const isDark = document.documentElement.classList.contains('dark');
    tileLayerRef.current = L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(mapRef.current);

    if (destCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:rgba(239,68,68,0.2);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(239,68,68,0.5)">
                 <div style="width:14px;height:14px;border-radius:50%;background:#ef4444"></div>
               </div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      destinationMarkerRef.current = L.marker(destCoords, { icon }).addTo(mapRef.current);
    }
    setTimeout(() => mapRef.current?.invalidateSize(), 400);
  }, [delivery?.id, destCoords?.[0], destCoords?.[1]]);

  useEffect(() => {
    if (!mapRef.current || !coords || !destCoords) return;
    const bounds = L.latLngBounds([coords, destCoords]);
    mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }, [coords, destCoords, routeInfo?.duration_sec]);

  useEffect(() => {
    if (!mapRef.current || !coords) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:40px;height:40px;border-radius:50%;background:rgba(91,138,249,0.2);border:2.5px solid #5b8af9;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(91,138,249,0.6)">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="2.5">
                 <circle cx="12" cy="5" r="3"/><path d="M5 12h14l-4 8H9l-4-8z"/>
               </svg>
             </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20],
    });
    if (!courierMarkerRef.current) courierMarkerRef.current = L.marker(coords, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
    else courierMarkerRef.current.setLatLng(coords).setIcon(icon);
  }, [coords]);

  // ── Acciones de Entrega ──────────────────────────────────────────
  const startTransit = async () => {
    try {
      await api.patch(`/deliveries/${id}/in-transit`, {});
      loadDelivery();
    } catch (err: any) {
      if (!navigator.onLine) {
        enqueueAction({ method: 'PATCH', path: `/deliveries/${id}/in-transit` });
        setDelivery(d => d ? { ...d, state: 'in_transit' } : d);
      } else setError(err.message);
    }
  };

  const confirmDelivery = async () => {
    setLoading(true);
    try {
      await api.patch(`/deliveries/${id}/deliver`, { note: note || undefined, proof_img: proofImgUrl || undefined });
      loadDelivery();
    } catch (err: any) {
      if (!navigator.onLine) {
        enqueueAction({ method: 'PATCH', path: `/deliveries/${id}/deliver`, body: { note, proof_img: proofImgUrl } });
      } else setError(err.message);
    }
    finally { setLoading(false); }
  };

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const { url } = await uploadFile(file);
      setProofImgUrl(url);
    } catch { setError('Error al subir foto'); }
    finally { setUploadingProof(false); }
  }

  // ── Firma ────────────────────────────────────────────────────────
  function sigDown(e: any) {
    const rect = signatureCanvasRef.current!.getBoundingClientRect();
    lastPointRef.current = { x: (e.clientX || e.touches?.[0]?.clientX) - rect.left, y: (e.clientY || e.touches?.[0]?.clientY) - rect.top };
    setIsDrawing(true); setHasSig(true);
  }
  function sigMove(e: any) {
    if (!isDrawing) return;
    const ctx = signatureCanvasRef.current!.getContext('2d')!;
    const rect = signatureCanvasRef.current!.getBoundingClientRect();
    const p = { x: (e.clientX || e.touches?.[0]?.clientX) - rect.left, y: (e.clientY || e.touches?.[0]?.clientY) - rect.top };
    ctx.beginPath(); ctx.moveTo(lastPointRef.current!.x, lastPointRef.current!.y);
    ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#e8e8f4'; ctx.lineWidth = 2.5; ctx.stroke();
    lastPointRef.current = p;
  }

  // ── Render ───────────────────────────────────────────────────────
  if (!delivery) return <AppShell><div className="spinner" /></AppShell>;

  const isInTransit = delivery.state === 'in_transit';
  const isAssigned  = delivery.state === 'assigned';
  const gpsColor    = gpsStatus === 'active' ? '#22c55e' : '#ef4444';

  return (
    <AppShell>
      <PageHeader
        title="Detalle del envío"
        back="/mensajero"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowChat(true)} className="btn btn-ghost btn-sm relative">
              <IconMessage size={16} /> Chat {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 rounded-full">{unreadCount}</span>}
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0b0b14] border border-[#252540] text-[10px] font-bold" style={{ color: gpsColor }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: gpsColor }} /> {gpsStatus === 'active' ? 'GPS Activo' : 'GPS Inactivo'}
            </div>
          </div>
        }
      />

      {error && <div className="mx-4 mt-3 banner-error">{error}</div>}

      <div className="relative h-64 w-full bg-[#0b0b14] overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />
        {routeInfo && (isAssigned || isInTransit) && (
          <div className="absolute bottom-2 left-2 z-[1000] bg-[#13131f]/95 border border-[#252540] rounded-xl px-3 py-2 shadow-lg">
            <div className="text-[9px] text-[#6b6b8a] uppercase font-bold">Ruta al cliente</div>
            <div className="text-sm font-black text-[#e8e8f4]">{routeInfo.duration} · {routeInfo.distance}</div>
          </div>
        )}
        {isInTransit && destCoords && (
          <div className="absolute top-2 left-2 right-2 z-[1000]">
            <TurnByTurn origin={coords} dest={destCoords} />
          </div>
        )}
        {isInTransit && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-[#f59e0b] text-[#0b0b14] px-3 py-1 rounded-lg text-[10px] font-black animate-pulse">{t('delivery.in_transit').toUpperCase()}</div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4 max-w-lg mx-auto pb-24">
        {/* Card info */}
        <div className="bg-[#16162a] border border-[#252540] rounded-2xl p-5 shadow-xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-black text-[#e8e8f4]">{delivery.customer_name}</h2>
              <a href={`tel:${delivery.customer_phone}`} className="text-sm font-bold text-[#5b8af9]">{delivery.customer_phone}</a>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#22c55e] font-black uppercase">Cobrar</div>
              <div className="text-xl font-black text-[#e8e8f4]">RD${Number(delivery.delivery_fee).toFixed(0)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="p-3 bg-[#0b0b14] rounded-xl text-sm text-[#e8e8f4]">
               <div className="text-[10px] text-[#6b6b8a] uppercase font-bold mb-1">Productos</div>
               {delivery.products || '—'}
            </div>
            <div className="p-3 bg-[#0b0b14] rounded-xl text-sm text-[#e8e8f4]">
               <div className="text-[10px] text-[#6b6b8a] uppercase font-bold mb-1">Dirección</div>
               {delivery.customer_address}
            </div>
          </div>
        </div>

        {/* Navegación */}
        {(isAssigned || isInTransit) && delivery.location_link && (
          <div className="flex gap-3">
             <a href={delivery.location_link} target="_blank" rel="noreferrer" className="flex-1 btn btn-ghost bg-[#4285F4]/10 text-[#4285F4] border-0"><IconMap size={18}/> Google Maps</a>
             <a href={delivery.location_link} target="_blank" rel="noreferrer" className="flex-1 btn btn-ghost bg-[#35CAED]/10 text-[#35CAED] border-0"><IconNavigate size={18}/> Waze</a>
          </div>
        )}

        {/* Acciones */}
        {isAssigned && (
          <button onClick={startTransit} className="btn-primary w-full py-5 text-base font-black shadow-lg shadow-[#5b8af9]/20">🛵 SALIR A ENTREGAR</button>
        )}

        {isInTransit && (
          <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 flex flex-col gap-4">
             <h3 className="text-sm font-black text-[#e8e8f4] uppercase">{t('delivery.confirm')}</h3>
             <button onClick={() => setShowQr(true)} className="btn btn-ghost border-[#252540] text-xs w-full">{t('qr.scan')}</button>
             <div className="flex gap-3 items-center">
                <button type="button" onClick={() => photoInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#252540] hover:border-[#5b8af9] bg-[#0b0b14] text-[#e8e8f4] text-xs font-bold transition-all cursor-pointer">Tomar Foto</button>
                <input type="file" accept="image/*" capture="environment" ref={photoInputRef} className="hidden" onChange={handlePhoto} />
                {uploadingProof && <span className="text-xs text-[#6b6b8a]">Subiendo…</span>}
                {proofImgUrl && <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center text-green-500">✓</div>}
             </div>
             <div className="relative h-32 bg-[#0b0b14] border border-[#252540] rounded-xl overflow-hidden">
                <canvas ref={signatureCanvasRef} width={400} height={128} onPointerDown={sigDown} onPointerMove={sigMove} onPointerUp={() => setIsDrawing(false)} className="w-full h-full" />
                {!hasSig && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#3a3a58] pointer-events-none">FIRMA AQUÍ</div>}
             </div>
             <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)" className="input h-20 resize-none" />
             <button onClick={confirmDelivery} disabled={loading} className="btn btn-success w-full py-4 font-black">✅ CONFIRMAR ENTREGA</button>
          </div>
        )}
      </div>

      <ChatPanel
        open={showChat}
        onClose={() => setShowChat(false)}
        peerName={delivery.customer_name ?? 'Cliente'}
        peerInitial={delivery.customer_name?.charAt(0).toUpperCase() || 'C'}
        subtitle="Chat del envío"
        messages={messages}
        mySender="messenger"
        streamPath={id ? `/deliveries/${id}/stream` : null}
        onLoad={loadMessages}
        onMarkRead={() => id ? api.post(`/deliveries/${id}/messages/read`, {}) : Promise.resolve()}
        onTyping={(typing) => id ? api.post(`/deliveries/${id}/typing`, { typing }) : Promise.resolve()}
        onSend={async (text) => { await api.post(`/deliveries/${id}/messages`, { message: text }); await loadMessages(); }}
        placeholder="Escribe un mensaje al cliente…"
      />

      {showQr && (
        <QrScanner
          onClose={() => setShowQr(false)}
          onScan={(code) => {
            if (code === id || code === delivery.id) confirmDelivery();
            else setNote(prev => prev ? `${prev} · QR:${code}` : `QR:${code}`);
            setShowQr(false);
          }}
        />
      )}
    </AppShell>
  );
}
