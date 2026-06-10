import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import type { Tenant } from '../../types';
import L from 'leaflet';
import { IconPackage, IconCheck, IconMotorbike, IconMap, IconNavigate, IconMessage, IconSend } from '../../components/Icons';
import { ThemeToggle } from '../../components/ThemeToggle';
import { applyTenantTheme } from '../../lib/theme';

// ── Tipos ─────────────────────────────────────────────────────
interface PublicMessengerDelivery {
  id: string;
  state: 'draft' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
  delivery_fee: number;
  customer: {
    name: string | null;
    phone: string | null;
    address: string;
    reference: string | null;
  };
  notes: string | null;
  nav_google: string;
  nav_waze: string;
  tenant?: Tenant;
  total_amount?: number;
  products?: string | null;
}

type GpsState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

// ── Constante de throttle de reporte ─────────────────────────
const REPORT_THROTTLE_MS = 6000;

// ── Componente Principal ──────────────────────────────────────
export function MessengerPortal() {
  const { token } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<PublicMessengerDelivery | null>(null);
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  // GPS
  const [gpsState, setGpsState] = useState<GpsState>('idle');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastReportRef = useRef<number>(0);

  // PWA Install
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);

  // Mapa Leaflet
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const courierMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  // Firma digital y foto de entrega
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [proofImgUrl, setProofImgUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // ── PWA: capturar evento de instalación ───────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!installDismissed) setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, [installDismissed]);

  // ── Chat Realtime ──
  interface ChatMessage {
    id: string;
    sender: 'messenger' | 'customer';
    message: string;
    created_at: string;
  }
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (fromBackground = false) => {
    if (!token) return;
    if (!showChat && !fromBackground) return;
    try {
      const msgs = await publicApi.get<ChatMessage[]>(`/p/m/${token}/chat`);
      setMessages(msgs);
      if (!showChat) {
        // Contar mensajes del cliente no vistos
        const lastSeen = lastSeenIdRef.current;
        const customerMsgs = msgs.filter(m => m.sender === 'customer');
        if (!lastSeen) {
          setUnreadCount(customerMsgs.length);
        } else {
          const lastSeenIdx = msgs.findIndex(m => m.id === lastSeen);
          const newCustomer = msgs.slice(lastSeenIdx + 1).filter(m => m.sender === 'customer');
          setUnreadCount(newCustomer.length);
        }
      } else {
        // Chat abierto: marcar todo como leído
        if (msgs.length > 0) lastSeenIdRef.current = msgs[msgs.length - 1].id;
        setUnreadCount(0);
      }
    } catch (e) {
      console.warn('Error loading chat messages:', e);
    }
  }, [token, showChat]);

  // Polling: activo (3s) si chat abierto, background (10s) si cerrado.
  // Se pausa automáticamente cuando el tab no está visible.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      loadMessages(true);
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadMessages(true);
        }
      }, showChat ? 3000 : 10000);
    };

    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadMessages(true); // carga inmediata al volver
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [showChat, loadMessages]);

  // Scroll al final
  useEffect(() => {
    if (showChat) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  // Al abrir chat, marcar como leídos
  const handleOpenChat = () => {
    setShowChat(true);
    setUnreadCount(0);
    if (messages.length > 0) lastSeenIdRef.current = messages[messages.length - 1].id;
  };

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newMsg.trim() || sendingMsg) return;
    setSendingMsg(true);
    try {
      const sent = await publicApi.post<ChatMessage>(`/p/m/${token}/chat`, { message: newMsg });
      setMessages((prev) => [...prev, sent]);
      setNewMsg('');
      lastSeenIdRef.current = sent.id;
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMsg(false);
    }
  }


  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  };

  // ── Cargar datos del envío ────────────────────────────────
  const loadDelivery = useCallback(() => {
    if (!token) return;
    publicApi.get<PublicMessengerDelivery>(`/p/m/${token}`)
      .then(setDelivery)
      .catch((err) => setApiError(err instanceof Error ? err.message : 'Error al cargar el envío'));
  }, [token]);

  useEffect(() => {
    loadDelivery();
    const interval = setInterval(() => {
      loadDelivery();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadDelivery]);

  // Aplicar tema del tenant
  useEffect(() => {
    if (delivery?.tenant) applyTenantTheme(delivery.tenant);
    return () => { applyTenantTheme(null); };
  }, [delivery?.tenant]);

  // ── GPS: iniciar watchPosition o plugin nativo según entorno ──
  const startGps = useCallback(() => {
    // 1. Detectar si corre bajo Capacitor Móvil
    const isCapacitor = (window as any).Capacitor !== undefined;

    if (isCapacitor) {
      setGpsState('requesting');
      const registerNativeBgGps = async () => {
        try {
          const { registerPlugin } = await import('@capacitor/core');
          const BackgroundGeolocation = registerPlugin<any>("BackgroundGeolocation");
          
          // Solicitar y observar coordenadas nativamente
          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "Transmitiendo tu ubicación en tiempo real...",
              backgroundTitle: "Envíos App activo",
              requestPermissions: true,
              stale: false,
              distanceFilter: 2 // Reportar cada 2 metros de movimiento
            },
            (location: any, error: any) => {
              if (error) {
                console.error("Nativo GPS watcher error:", error);
                setGpsState('error');
                return;
              }
              if (location) {
                const newCoords: [number, number] = [location.latitude, location.longitude];
                setCoords(newCoords);
                setGpsAccuracy(location.accuracy || 10);
                setGpsState('active');
              }
            }
          );
          watchIdRef.current = watcherId as any;
        } catch (err) {
          console.error("No se pudo iniciar GPS en segundo plano nativo:", err);
          setGpsState('error');
        }
      };
      registerNativeBgGps();
      return;
    }

    // 2. Fallback estándar para Navegador Web
    if (!navigator.geolocation) {
      setGpsState('error');
      return;
    }
    if (watchIdRef.current !== null) return;
    setGpsState('requesting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newCoords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCoords(newCoords);
        setGpsAccuracy(pos.coords.accuracy);
        setGpsState('active');
      },
      (err) => {
        console.warn('[GPS Portal] Error:', err.code, err.message);
        setGpsState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // Iniciar GPS al cargar, siempre
  useEffect(() => {
    // Verificar permiso actual
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          startGps();
        } else if (result.state === 'prompt') {
          setGpsState('idle'); // solicitar manualmente con diálogo
        } else {
          setGpsState('denied');
        }
        result.onchange = () => {
          if (result.state === 'granted') startGps();
          else if (result.state === 'denied') {
            setGpsState('denied');
            if (watchIdRef.current !== null) {
              navigator.geolocation.clearWatch(watchIdRef.current);
              watchIdRef.current = null;
            }
          }
        };
      });
    } else {
      startGps();
    }
    return () => {
      if (watchIdRef.current !== null) {
        const isCapacitor = (window as any).Capacitor !== undefined;
        if (isCapacitor) {
          import('@capacitor/core').then(({ registerPlugin }) => {
            const BackgroundGeolocation = registerPlugin<any>("BackgroundGeolocation");
            BackgroundGeolocation.removeWatcher({ id: watchIdRef.current as any }).catch((err: any) => console.error(err));
          });
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
      }
    };
  }, [startGps]);

  // ── GPS: reportar ubicación al servidor con throttle ──────
  useEffect(() => {
    if (!token || !coords) return;
    const now = Date.now();
    if (now - lastReportRef.current < REPORT_THROTTLE_MS) return;
    lastReportRef.current = now;
    publicApi.post(`/p/m/${token}/location`, {
      latitude: coords[0],
      longitude: coords[1],
    }).catch(() => {/* silencioso */});
  }, [coords, token]);

  // ── Mapa: extraer coordenadas de destino ──────────────────
  const getDestinationCoords = (): [number, number] | null => {
    if (!delivery) return null;
    const match = delivery.nav_google.match(/([-\d.]+),\s*([-\d.]+)/);
    if (match) return [Number(match[1]), Number(match[2])];
    return [18.4861, -69.9312]; // Santo Domingo por defecto
  };

  // ── Mapa: inicializar Leaflet ─────────────────────────────
  useEffect(() => {
    if (!delivery || !mapContainerRef.current) return;
    const dest = getDestinationCoords();
    if (!dest) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(dest, 15);

      const isDark = document.documentElement.classList.contains('dark');
      tileLayerRef.current = L.tileLayer(
        isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 20 }
      ).addTo(mapRef.current);

      setTimeout(() => { if (mapRef.current) mapRef.current.invalidateSize(); }, 300);

      // Marcador destino (cliente)
      const custIcon = L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:rgba(239,68,68,0.18);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(239,68,68,0.5)">
                 <div style="width:14px;height:14px;border-radius:50%;background:#ef4444;animation:pulse 1.2s infinite"></div>
               </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      destinationMarkerRef.current = L.marker(dest, { icon: custIcon })
        .addTo(mapRef.current)
        .bindPopup(`<b>📦 Destino:</b> ${delivery.customer.name ?? 'Cliente'}`);
    } else {
      mapRef.current.setView(dest, 15);
      destinationMarkerRef.current?.setLatLng(dest);
    }

    return () => {
      if (mapRef.current) {
        if (routePolylineRef.current) {
          mapRef.current.removeLayer(routePolylineRef.current);
          routePolylineRef.current = null;
        }
      }
    };
  }, [delivery?.id]);

  // ── Mapa: alternar tile al cambiar tema ────────────────────
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

  // ── Mapa: actualizar marcador del mensajero ────────────────
  useEffect(() => {
    if (!mapRef.current || !coords) return;

    const messengerIcon = L.divIcon({
      className: '',
      html: `<div style="width:40px;height:40px;border-radius:50%;background:rgba(91,138,249,0.2);border:2.5px solid #5b8af9;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(91,138,249,0.6)">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="2.5">
                 <circle cx="12" cy="5" r="3"/><path d="M5 12h14l-4 8H9l-4-8z"/>
               </svg>
             </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(coords, { icon: messengerIcon, zIndexOffset: 1000 }).addTo(mapRef.current);
    } else {
      courierMarkerRef.current.setLatLng(coords).setIcon(messengerIcon);
    }
  }, [coords]);

  // Actualizar ruta y tiempos (OSRM)
  useEffect(() => {
    if (!mapRef.current || !coords || !delivery || delivery.state !== 'in_transit') {
      if (routePolylineRef.current && mapRef.current) {
        mapRef.current.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      setRouteInfo(null);
      return;
    }

    const dest = getDestinationCoords();
    if (!dest) return;

    // Consultar API OSRM
    const url = `https://router.project-osrm.org/route/v1/driving/${coords[1]},${coords[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 'Ok' && data.routes?.[0]) {
          const route = data.routes[0];
          const distanceKm = (route.distance / 1000).toFixed(1);
          const durationMin = Math.round(route.duration / 60);

          setRouteInfo({
            distance: `${distanceKm} km`,
            duration: `${durationMin} min`,
          });

          // Dibujar ruta
          const coordinates = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
          
          if (!mapRef.current) return;

          if (!routePolylineRef.current) {
            routePolylineRef.current = L.polyline(coordinates, {
              color: '#f59e0b',
              weight: 4,
              opacity: 0.8,
              dashArray: '5, 10'
            }).addTo(mapRef.current);
          } else {
            routePolylineRef.current.setLatLngs(coordinates);
          }
        }
      })
      .catch((err) => {
        console.warn('[Routing Messenger] Error:', err);
      });
  }, [coords, delivery?.state]);

  // ── Centrar mapa en posición actual ───────────────────────
  const recenterMap = () => {
    if (mapRef.current && coords) {
      mapRef.current.flyTo(coords, 16, { animate: true, duration: 0.8 });
    }
  };

  // ── Ajustar vista para incluir mensajero y destino ─────────
  const fitBothMarkers = useCallback(() => {
    if (!mapRef.current || !coords) return;
    const dest = getDestinationCoords();
    if (dest) {
      const bounds = L.latLngBounds([dest, coords]);
      mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [coords, delivery]);

  // ── Acciones principales ──────────────────────────────────
  const handleStartTransit = async () => {
    if (!token) return;
    setLoading(true); setApiError('');
    try {
      const res = await publicApi.post<{ ok: boolean; state: string }>(`/p/m/${token}/in-transit`, {});
      setDelivery((d) => d ? { ...d, state: res.state as any } : null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al iniciar ruta');
    } finally { setLoading(false); }
  };

  const handleDeliver = async () => {
    if (!token) return;
    setLoading(true); setApiError('');

    let finalSigUrl = sigUrl;
    // Upload de firma si hay dibujo pero no URL aún
    if (hasSig && !sigUrl && signatureCanvasRef.current) {
      try {
        const blob = await new Promise<Blob>((res) => signatureCanvasRef.current!.toBlob((b) => res(b!), 'image/png'));
        const file = new File([blob], 'firma.png', { type: 'image/png' });
        const form = new FormData();
        form.append('file', file);
        const r = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await r.json();
        finalSigUrl = data.url ?? null;
        setSigUrl(finalSigUrl);
      } catch { /* ignorar */ }
    }

    try {
      const res = await publicApi.post<{ ok: boolean; state: string }>(`/p/m/${token}/deliver`, {
        note: note || undefined,
        proof_img: proofImgUrl ?? undefined,
        proof_signature: finalSigUrl ?? undefined,
      });
      setDelivery((d) => d ? { ...d, state: res.state as any } : null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al confirmar entrega');
    } finally { setLoading(false); }
  };

  // ── Helpers de firma ──────────────────────────────────────
  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function sigPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e);
    lastPointRef.current = p;
    setIsDrawing(true);
    setHasSig(true);
    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#e8e8f4';
      ctx.fill();
    }
  }

  function sigPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !lastPointRef.current) return;
    const ctx = signatureCanvasRef.current?.getContext('2d');
    const p = getCanvasPoint(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#e8e8f4';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPointRef.current = p;
  }

  function sigPointerUp() {
    setIsDrawing(false);
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    setSigUrl(null);
  }

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
    } catch {
      setApiError('Error al subir foto');
    } finally {
      setUploadingProof(false);
    }
  }

  // ── Loading / error inicial ────────────────────────────────
  if (!delivery) {
    return (
      <div className="min-h-screen bg-[#0b0b14] flex flex-col justify-center items-center">
        {apiError ? (
          <div className="max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#2a0a0a] flex items-center justify-center mx-auto mb-4 border border-[#ef4444]/20">
              <svg className="w-8 h-8 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className="text-sm text-[#ef4444] font-semibold mb-1">No se pudo cargar el envío</p>
            <p className="text-xs text-[#6b6b8a]">{apiError}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-[#5b8af9]/30 animate-ping" />
              <div className="w-12 h-12 rounded-full border-2 border-t-[#5b8af9] border-[#252540] animate-spin" />
            </div>
            <span className="text-xs text-[#6b6b8a] font-medium">Cargando portal del mensajero…</span>
          </div>
        )}
      </div>
    );
  }

  const isAssigned  = delivery.state === 'assigned';
  const isInTransit = delivery.state === 'in_transit';
  const isDelivered = delivery.state === 'delivered';

  // ── Color del indicador GPS ───────────────────────────────
  const gpsIndicatorColor = gpsState === 'active' ? '#22c55e' : gpsState === 'requesting' ? '#f59e0b' : '#ef4444';
  const gpsLabel = gpsState === 'active' ? 'GPS Activo' : gpsState === 'requesting' ? 'Buscando GPS…' : gpsState === 'denied' ? 'GPS Bloqueado' : 'GPS Inactivo';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex flex-col select-none">

      {/* ── Banner de instalación PWA ─────────────────────── */}
      {showInstallBanner && !installDismissed && (
        <div className="fixed top-0 inset-x-0 z-[1000] bg-gradient-to-r from-[#5b8af9] to-[#a75bf9] px-4 py-3 flex items-center gap-3 shadow-2xl">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-xs">Instalar app del mensajero</div>
            <div className="text-white/70 text-[10px]">Acceso rápido y GPS más preciso sin abrir el navegador</div>
          </div>
          <button
            onClick={handleInstall}
            className="bg-white text-[#5b8af9] font-bold text-xs px-3 py-1.5 rounded-lg border-0 cursor-pointer shrink-0"
          >
            Instalar
          </button>
          <button
            onClick={() => { setShowInstallBanner(false); setInstallDismissed(true); }}
            className="text-white/60 bg-transparent border-0 cursor-pointer p-1 shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <header
        className="bg-[#13131f]/95 backdrop-blur-md border-b border-[#252540] px-4 py-3 flex items-center justify-between sticky z-20"
        style={{ top: showInstallBanner && !installDismissed ? '60px' : '0' }}
      >
        <div className="flex items-center gap-2.5">
          {delivery?.tenant?.logo_url ? (
            <img src={delivery.tenant.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <IconPackage size={16} className="text-primary" />
            </div>
          )}
          <span className="font-bold text-sm text-[#e8e8f4]">{delivery?.tenant?.name ?? 'Envíos App'}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Chat con Cliente */}
          {delivery && (
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
          )}

          {/* Indicador GPS */}
          <button
            onClick={gpsState === 'idle' || gpsState === 'error' ? startGps : undefined}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0b0b14] border border-[#252540] cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${gpsState === 'active' ? 'animate-pulse' : ''}`}
              style={{ background: gpsIndicatorColor }}
            />
            <span className="text-[10px] font-bold" style={{ color: gpsIndicatorColor }}>{gpsLabel}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Banner GPS bloqueado ──────────────────────────────── */}
      {gpsState === 'denied' && (
        <div className="bg-[#2a0a0a] border-b border-[#ef4444]/30 px-4 py-2.5 flex items-center gap-3 z-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-xs text-[#ef4444] flex-1">
            GPS bloqueado. Ve a <strong>Configuración del navegador → Privacidad → Ubicación</strong> y permite el acceso a este sitio.
          </p>
        </div>
      )}

      {/* ── Banner solicitud GPS si está idle ─────────────────── */}
      {gpsState === 'idle' && (
        <div className="bg-[#1a1500] border-b border-[#f59e0b]/30 px-4 py-2.5 flex items-center gap-3 z-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-xs text-[#f59e0b] flex-1">Para compartir tu ubicación en tiempo real, activa el GPS.</p>
          <button
            onClick={startGps}
            className="bg-[#f59e0b] text-[#0b0b14] font-bold text-[10px] px-3 py-1 rounded-lg border-0 cursor-pointer shrink-0"
          >
            Activar GPS
          </button>
        </div>
      )}

      {/* ── Mapa ─────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-[50vh] md:min-h-[380px] z-10">
        <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" style={{ minHeight: '50vh' }} />

        {/* Indicador de ruta en tiempo real */}
        {routeInfo && (
          <div className="absolute top-3 left-3 z-[999] bg-[#13131f] border border-[#252540] rounded-xl p-3 shadow-lg flex flex-col gap-1 transition-all">
            <span className="text-[9px] text-[#6b6b8a] uppercase tracking-wider font-bold">A destino</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-white">{routeInfo.duration}</span>
              <span className="text-[10px] text-[#6b6b8a]">{routeInfo.distance}</span>
            </div>
          </div>
        )}

        {/* Controles flotantes del mapa */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
          {/* Recenter */}
          {coords && (
            <button
              onClick={recenterMap}
              title="Centrar en mi posición"
              className="w-9 h-9 rounded-xl bg-[#13131f]/90 border border-[#252540] flex items-center justify-center text-[#5b8af9] hover:bg-[#5b8af9] hover:text-white transition-colors cursor-pointer shadow-lg"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
              </svg>
            </button>
          )}
          {/* Fit ambos marcadores */}
          {coords && isInTransit && (
            <button
              onClick={fitBothMarkers}
              title="Ver ruta completa"
              className="w-9 h-9 rounded-xl bg-[#13131f]/90 border border-[#252540] flex items-center justify-center text-[#f59e0b] hover:bg-[#f59e0b] hover:text-[#0b0b14] transition-colors cursor-pointer shadow-lg"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
          )}
        </div>

        {/* Indicador de precisión GPS */}
        {gpsState === 'active' && gpsAccuracy !== null && (
          <div className="absolute bottom-3 left-3 z-[999] bg-[#13131f]/80 backdrop-blur-sm border border-[#252540] rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[10px] text-[#6b6b8a] font-medium">
              ±{Math.round(gpsAccuracy)}m
            </span>
          </div>
        )}
      </div>

      {/* ── Panel de Información ──────────────────────────────── */}
      <div className="bg-[#13131f] border-t border-[#252540] p-4 flex flex-col gap-4 max-w-lg mx-auto w-full rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-20 pb-8">

        {apiError && (
          <div className="bg-[#2a0a0a] border border-[#ef4444]/30 rounded-xl px-3 py-2.5 text-[#ef4444] text-xs font-semibold">
            {apiError}
          </div>
        )}

        {/* Cliente */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Cliente</div>
            <h2 className="text-base font-bold text-[#e8e8f4] mt-0.5 truncate">{delivery.customer.name ?? 'Cliente'}</h2>
            {delivery.customer.phone && (
              <a href={`tel:${delivery.customer.phone}`} className="text-xs text-[#5b8af9] font-semibold hover:underline block mt-0.5">
                📞 {delivery.customer.phone}
              </a>
            )}
          </div>
          {Number(delivery.delivery_fee) > 0 && (
            <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl px-3 py-2 text-right shrink-0">
              <div className="text-[9px] text-[#22c55e] uppercase tracking-wider font-bold">Cobrar</div>
              <div className="text-sm font-extrabold text-[#e8e8f4] mt-0.5">RD$ {Number(delivery.delivery_fee).toFixed(2)}</div>
            </div>
          )}
        </div>

        {/* Dirección */}
        <div className="bg-[#0b0b14] border border-[#252540]/60 rounded-xl p-3">
          <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold mb-1">Dirección de Entrega</div>
          <p className="text-sm text-[#e8e8f4] leading-relaxed">{delivery.customer.address}</p>
          {delivery.customer.reference && (
            <p className="text-xs text-[#f59e0b] mt-1.5 font-medium">📍 {delivery.customer.reference}</p>
          )}
        </div>

        {/* Productos y Monto Total */}
        {(delivery.products || (delivery.total_amount !== undefined && delivery.total_amount > 0)) && (
          <div className="bg-[#0b0b14] border border-[#252540]/60 rounded-xl p-3 flex flex-col gap-2">
            {delivery.products && (
              <div>
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Productos del pedido</div>
                <p className="text-xs text-[#e8e8f4] mt-0.5 font-medium">{delivery.products}</p>
              </div>
            )}
            {delivery.total_amount !== undefined && delivery.total_amount > 0 && (
              <div className="flex justify-between items-center border-t border-[#252540]/40 pt-2">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Monto del pedido</div>
                <div className="text-xs font-bold text-[#22c55e]">RD$ {Number(delivery.total_amount).toFixed(2)}</div>
              </div>
            )}
          </div>
        )}

        {/* Notas */}
        {delivery.notes && (
          <div className="bg-[#2a1800]/30 border border-[#f59e0b]/20 rounded-xl p-3">
            <div className="text-[10px] text-[#f59e0b] uppercase tracking-wider font-semibold mb-1">Instrucciones</div>
            <p className="text-xs text-[#e8e8f4]">{delivery.notes}</p>
          </div>
        )}

        {/* Botones de navegación externa */}
        {(isAssigned || isInTransit) && (
          <div className="flex gap-2">
            <a
              href={delivery.nav_google} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#4285F4]/12 hover:bg-[#4285F4]/22 text-[#4285F4] text-xs font-bold transition-all"
            >
              <IconMap size={14} /> Google Maps
            </a>
            <a
              href={delivery.nav_waze} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#35CAED]/12 hover:bg-[#35CAED]/22 text-[#35CAED] text-xs font-bold transition-all"
            >
              <IconNavigate size={14} /> Waze
            </a>
          </div>
        )}

        {/* Acción: Salir a entregar */}
        {isAssigned && (
          <button
            onClick={handleStartTransit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#f59e0b] text-[#0b0b14] font-extrabold text-base hover:bg-[#e08e00] active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer shadow-lg shadow-[#f59e0b]/25"
          >
            <IconMotorbike size={20} color="#0b0b14" />
            {loading ? 'Iniciando entrega…' : '🛵 Salir a Entregar'}
          </button>
        )}

        {/* Acción: Confirmar entrega */}
        {isInTransit && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[#252540]">
            {/* Foto de Entrega (Prueba de Entrega) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Foto de Entrega (Opcional)</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#252540] hover:border-[#5b8af9] bg-[#0b0b14] text-[#e8e8f4] text-xs font-bold transition-all cursor-pointer"
                >
                  Tomar Foto
                </button>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={photoInputRef}
                  className="hidden"
                  onChange={handlePhotoCapture}
                />
                {uploadingProof && (
                  <span className="text-xs text-[#6b6b8a]">Subiendo foto...</span>
                )}
                {proofImgUrl && (
                  <img src={proofImgUrl} alt="Prueba de entrega" className="w-12 h-12 object-cover rounded-lg border border-green-500/30 shrink-0" />
                )}
              </div>
            </div>

            {/* Firma del Cliente */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Firma del Cliente (Opcional)</label>
                {hasSig && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-[10px] text-red-500 hover:underline bg-transparent border-0 cursor-pointer font-bold"
                  >
                    Borrar
                  </button>
                )}
              </div>
              <div className="relative w-full h-[120px] rounded-xl bg-[#0b0b14] border border-[#252540] overflow-hidden">
                <canvas
                  ref={signatureCanvasRef}
                  width={350}
                  height={120}
                  onPointerDown={sigPointerDown}
                  onPointerMove={sigPointerMove}
                  onPointerUp={sigPointerUp}
                  className="w-full h-full cursor-crosshair touch-none"
                />
              </div>
            </div>

            <textarea
              className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/30 resize-none placeholder:text-[#3a3a58]"
              placeholder="Nota de entrega (opcional)…"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={handleDeliver}
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
            <p className="text-xs text-[#6b6b8a]">El cliente fue notificado automáticamente. ¡Buen trabajo! 🎉</p>
          </div>
        )}

        {/* Estado: Cancelado */}
        {delivery.state === 'cancelled' && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-[#ef4444]/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <div className="font-extrabold text-[#ef4444] text-base">Envío Cancelado</div>
            <p className="text-xs text-[#6b6b8a]">Este envío fue cancelado por el operador.</p>
          </div>
        )}
      </div>
      {/* ── Overlay Chat Modal Premium (Mensajero) ── */}
      {showChat && delivery && (
        <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#13131f] border-t sm:border border-[#252540] rounded-t-2xl sm:rounded-2xl w-full max-w-md h-[90vh] sm:h-[600px] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#252540] flex justify-between items-center bg-[#0b0b14]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#5b8af9]/15 flex items-center justify-center font-bold text-[#5b8af9] text-xs">
                  {delivery.customer.name?.charAt(0).toUpperCase() || 'C'}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#e8e8f4]">{delivery.customer.name}</div>
                  <div className="text-[9px] text-[#6b6b8a] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5b8af9] animate-pulse" /> Cliente del envío
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

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0b0b14]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#252540]/60 flex items-center justify-center text-[#6b6b8a]">
                    <IconMessage size={18} />
                  </div>
                  <p className="text-xs font-bold text-[#6b6b8a]">Di algo para iniciar el chat</p>
                  <p className="text-[10px] text-[#3a3a58]">El cliente recibirá una notificación al ver su link de seguimiento.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender === 'messenger';
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                        isMe
                          ? 'bg-[#5b8af9] text-white rounded-tr-none'
                          : 'bg-[#1c1c30] text-[#e8e8f4] border border-[#252540] rounded-tl-none'
                      }`}>
                        <p className="break-words">{m.message}</p>
                        <div className={`text-[8px] mt-1 text-right ${isMe ? 'text-white/75' : 'text-[#6b6b8a]'}`}>
                          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#252540] flex gap-2 bg-[#13131f]">
              <input
                type="text"
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                placeholder="Escribe un mensaje al cliente..."
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
    </div>
  );
}
