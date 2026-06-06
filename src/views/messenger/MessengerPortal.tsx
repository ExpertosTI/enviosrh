import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';
import type { Tenant } from '../../types';
import L from 'leaflet';
import { IconPackage, IconCheck, IconMotorbike, IconMap, IconNavigate } from '../../components/Icons';
import { ThemeToggle } from '../../components/ThemeToggle';
import { applyTenantTheme } from '../../lib/theme';

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
}

export function MessengerPortal() {
  const { token } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<PublicMessengerDelivery | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [gpsActive, setGpsActive] = useState(false);
  const [simulating, setSimulating] = useState(false);
  
  // Coordenadas actuales del mensajero (reales o simuladas)
  const [courierCoords, setCourierCoords] = useState<[number, number] | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const courierMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);

  // Cargar datos del envío
  const loadDelivery = () => {
    if (!token) return;
    publicApi.get<PublicMessengerDelivery>(`/p/m/${token}`)
      .then(setDelivery)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar el envío'));
  };

  useEffect(() => {
    loadDelivery();
  }, [token]);

  useEffect(() => {
    if (delivery?.tenant) {
      applyTenantTheme(delivery.tenant);
    }
    return () => {
      applyTenantTheme(null);
    };
  }, [delivery?.tenant]);

  // Extraer coordenadas del cliente si existen en el link de navegación
  const getDestinationCoords = (): [number, number] | null => {
    if (!delivery) return null;
    const gpsCoords = delivery.nav_google.match(/[-\d.]+,\s*[-\d.]+/)?.[0];
    if (gpsCoords) {
      const [lat, lng] = gpsCoords.split(',').map(Number);
      return [lat, lng];
    }
    // Coordenada por defecto (Santo Domingo) si no se puede parsear
    return [18.4861, -69.9312];
  };

  // Inicializar Mapa Leaflet
  useEffect(() => {
    if (!delivery || !mapContainerRef.current) return;
    
    const dest = getDestinationCoords();
    if (!dest) return;

    if (!mapRef.current) {
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

      setTimeout(() => { if (mapRef.current) mapRef.current.invalidateSize(); }, 300);

      // Icono de destino (Cliente)
      const customerIcon = L.divIcon({
        className: 'custom-cust-marker',
        html: `<div class="w-8 h-8 rounded-full bg-[#ef4444]/20 border-2 border-[#ef4444] flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                 <div class="w-3.5 h-3.5 rounded-full bg-[#ef4444] animate-pulse"></div>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      destinationMarkerRef.current = L.marker(dest, { icon: customerIcon })
        .addTo(mapRef.current)
        .bindPopup(`<b>Cliente:</b> ${delivery.customer.name ?? 'Dirección de Entrega'}`)
        .openPopup();
    } else {
      mapRef.current.setView(dest, 14);
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setLatLng(dest);
      }
    }

    return () => {
      // No destruimos el mapa al desmontar el efecto de coordenadas,
      // pero si cambia el id del envío sí querríamos reiniciar.
    };
  }, [delivery?.id]);

  // Cambiar tile del mapa al alternar tema
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

  // Actualizar marcador del mensajero en el mapa
  useEffect(() => {
    if (!mapRef.current || !courierCoords) return;

    const messengerIcon = L.divIcon({
      className: 'custom-courier-marker',
      html: `<div class="w-9 h-9 rounded-full bg-[#5b8af9]/20 border-2 border-[#5b8af9] flex items-center justify-center shadow-[0_0_15px_rgba(91,138,249,0.6)]">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="2.5">
                 <circle cx="12" cy="5" r="3" />
                 <path d="M5 12h14l-4 8H9l-4-8z" />
               </svg>
             </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(courierCoords, { icon: messengerIcon }).addTo(mapRef.current);
    } else {
      courierMarkerRef.current.setLatLng(courierCoords);
    }

    // Ajustar vista para contener ambos marcadores si están lejos
    const dest = getDestinationCoords();
    if (dest) {
      const bounds = L.latLngBounds([dest, courierCoords]);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [courierCoords]);

  // Bucle de envío de ubicación al servidor
  useEffect(() => {
    if (!token || !courierCoords || delivery?.state !== 'in_transit') return;

    const reportLocation = async () => {
      try {
        await publicApi.post(`/p/m/${token}/location`, {
          latitude: courierCoords[0],
          longitude: courierCoords[1]
        });
      } catch (err) {
        console.error('Error reportando ubicación:', err);
      }
    };

    reportLocation();
    const interval = setInterval(reportLocation, 10000); // reportar cada 10s
    return () => clearInterval(interval);
  }, [courierCoords, delivery?.state, token]);

  // Watch GPS Geolocation real
  useEffect(() => {
    if (delivery?.state !== 'in_transit' || simulating || !gpsActive) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCourierCoords([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        console.error('Error de geolocalización:', err);
        setError('No se pudo acceder al GPS real. Activa simulación para pruebas.');
        setGpsActive(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsActive, delivery?.state, simulating]);

  // Simulación de recorrido paso a paso
  useEffect(() => {
    if (!simulating || delivery?.state !== 'in_transit') {
      setSimulating(false);
      return;
    }

    const dest = getDestinationCoords();
    if (!dest) return;

    // Empezar a unos ~800 metros de distancia
    const startLat = dest[0] - 0.006;
    const startLng = dest[1] - 0.008;
    let step = 0;
    const totalSteps = 20;

    setCourierCoords([startLat, startLng]);

    const interval = setInterval(() => {
      step++;
      if (step >= totalSteps) {
        setCourierCoords(dest);
        setSimulating(false);
        clearInterval(interval);
      } else {
        const ratio = step / totalSteps;
        const currentLat = startLat + (dest[0] - startLat) * ratio;
        const currentLng = startLng + (dest[1] - startLng) * ratio;
        // Agregar pequeña desviación aleatoria para que parezca más realista
        const jitterLat = (Math.random() - 0.5) * 0.0003;
        const jitterLng = (Math.random() - 0.5) * 0.0003;
        setCourierCoords([currentLat + jitterLat, currentLng + jitterLng]);
      }
    }, 4000); // Moverse cada 4 segundos

    return () => clearInterval(interval);
  }, [simulating, delivery?.state]);

  // Iniciar tránsito
  const handleStartTransit = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const res = await publicApi.post<{ ok: boolean, state: any }>(`/p/m/${token}/in-transit`);
      setDelivery((d) => d ? { ...d, state: res.state } : null);
      setGpsActive(true); // Activa el GPS automáticamente al iniciar ruta
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar ruta');
    } finally {
      setLoading(false);
    }
  };

  // Entregar envío
  const handleDeliver = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const res = await publicApi.post<{ ok: boolean, state: any }>(`/p/m/${token}/deliver`, { note: note || undefined });
      setDelivery((d) => d ? { ...d, state: res.state } : null);
      setGpsActive(false);
      setSimulating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar entrega');
    } finally {
      setLoading(false);
    }
  };

  if (!delivery) {
    return (
      <div className="min-h-screen bg-[#0b0b14] flex flex-col justify-center items-center">
        {error ? (
          <div className="max-w-sm p-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#2a0a0a] flex items-center justify-center mx-auto mb-4 border border-[#ef4444]/20">
              <svg className="w-7 h-7 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm text-[#ef4444] font-medium">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-8 h-8 text-[#5b8af9] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="text-xs text-[#6b6b8a]">Cargando portal…</span>
          </div>
        )}
      </div>
    );
  }

  const isAssigned = delivery.state === 'assigned';
  const isInTransit = delivery.state === 'in_transit';
  const isDelivered = delivery.state === 'delivered';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex flex-col">
      {/* Header */}
      <header className="bg-[#13131f]/90 backdrop-blur-md border-b border-[#252540] px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          {delivery?.tenant?.logo_url ? (
            <img src={delivery.tenant.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <IconPackage size={16} className="text-primary" />
            </div>
          )}
          <span className="font-bold text-sm text-[#e8e8f4]">
            {delivery?.tenant?.name ?? 'EnvíosRH'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
            Portal Mensajero
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Mapa */}
      <div className="relative flex-1 min-h-[260px] md:min-h-[380px] z-10">
        <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" />
        
        {/* Controles flotantes en mapa */}
        {isInTransit && (
          <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
            <button
              onClick={() => { setSimulating(!simulating); if (!simulating) setGpsActive(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer shadow-lg ${
                simulating
                  ? 'bg-[#f59e0b] text-[#0b0b14]'
                  : 'bg-[#13131f] text-[#f59e0b] border border-[#f59e0b]/20 hover:bg-[#252540]'
              }`}
            >
              🚗 {simulating ? 'Simulación Activa' : 'Simular Ruta'}
            </button>
            <button
              onClick={() => { setGpsActive(!gpsActive); if (!gpsActive) setSimulating(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer shadow-lg ${
                gpsActive
                  ? 'bg-[#22c55e] text-white'
                  : 'bg-[#13131f] text-[#6b6b8a] border border-[#252540] hover:text-[#e8e8f4]'
              }`}
            >
              📡 GPS: {gpsActive ? 'Activo' : 'Apagado'}
            </button>
          </div>
        )}
      </div>

      {/* Panel de Información */}
      <div className="bg-[#13131f] border-t border-[#252540] p-4 flex flex-col gap-4 max-w-lg mx-auto w-full rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-20">
        {error && <div className="banner-error">{error}</div>}

        {/* Cliente Card */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Cliente</div>
            <h2 className="text-base font-bold text-[#e8e8f4] mt-0.5">{delivery.customer.name ?? 'Cliente'}</h2>
            {delivery.customer.phone && (
              <a href={`tel:${delivery.customer.phone}`} className="text-xs text-[#5b8af9] font-medium hover:underline block mt-1">
                📞 {delivery.customer.phone}
              </a>
            )}
          </div>
          {Number(delivery.delivery_fee) > 0 && (
            <div className="bg-[#5b8af9]/10 rounded-xl px-3 py-2 text-right">
              <div className="text-[9px] text-[#5b8af9] uppercase tracking-wider font-bold">Cobrar Envío</div>
              <div className="text-sm font-extrabold text-[#e8e8f4] mt-0.5">RD$ {Number(delivery.delivery_fee).toFixed(2)}</div>
            </div>
          )}
        </div>

        {/* Dirección Card */}
        <div className="bg-[#0b0b14] border border-[#252540]/60 rounded-xl p-3">
          <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wider font-semibold">Dirección de Entrega</div>
          <p className="text-sm text-[#e8e8f4] mt-1 leading-relaxed">{delivery.customer.address}</p>
          {delivery.customer.reference && (
            <p className="text-xs text-[#f59e0b] mt-1.5 font-medium">📍 {delivery.customer.reference}</p>
          )}
        </div>

        {/* Notas Card */}
        {delivery.notes && (
          <div className="bg-[#2a1800]/25 border border-[#f59e0b]/20 rounded-xl p-3">
            <div className="text-[10px] text-[#f59e0b] uppercase tracking-wider font-semibold">Instrucciones Especiales</div>
            <p className="text-xs text-[#e8e8f4] mt-1">{delivery.notes}</p>
          </div>
        )}

        {/* Botones de Navegación Externa */}
        {isInTransit && (
          <div className="flex gap-2">
            <a
              href={delivery.nav_google} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#4285F4]/15 hover:bg-[#4285F4]/25 text-[#4285F4] text-xs font-bold transition-all border-0 cursor-pointer"
            >
              <IconMap size={14} /> Google Maps
            </a>
            <a
              href={delivery.nav_waze} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#35CAED]/15 hover:bg-[#35CAED]/25 text-[#35CAED] text-xs font-bold transition-all border-0 cursor-pointer"
            >
              <IconNavigate size={14} /> Navegar en Waze
            </a>
          </div>
        )}

        {/* Acciones principales */}
        {isAssigned && (
          <button
            onClick={handleStartTransit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#f59e0b] text-[#0b0b14] font-extrabold text-base hover:bg-[#e08e00] active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer shadow-lg shadow-[#f59e0b]/20 animate-pulse"
          >
            <IconMotorbike size={20} color="#0b0b14" />
            {loading ? 'Iniciando entrega…' : 'Salir a Entregar'}
          </button>
        )}

        {isInTransit && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[#252540]">
            <textarea
              className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/30 resize-none placeholder:text-[#3a3a58]"
              placeholder="Añadir nota de entrega (opcional)…"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={handleDeliver}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#22c55e] text-[#0b0b14] font-extrabold text-base hover:bg-[#1f9e4c] active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer shadow-lg shadow-[#22c55e]/25"
            >
              <IconCheck size={20} color="#0b0b14" />
              {loading ? 'Confirmando entrega…' : 'Confirmar Entrega'}
            </button>
          </div>
        )}

        {isDelivered && (
          <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-xl p-4 flex flex-col items-center gap-2 text-center py-6">
            <div className="w-10 h-10 rounded-full bg-[#22c55e]/20 flex items-center justify-center mb-1">
              <IconCheck size={20} color="#22c55e" />
            </div>
            <div className="font-extrabold text-[#22c55e] text-base">¡Envío Entregado con Éxito!</div>
            <p className="text-xs text-[#6b6b8a] max-w-xs">El cliente ya ha sido notificado y puede ver el estado actualizado en su pantalla de seguimiento.</p>
          </div>
        )}

        {delivery.state === 'cancelled' && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4 flex flex-col items-center gap-2 text-center py-6">
            <div className="w-10 h-10 rounded-full bg-[#ef4444]/20 flex items-center justify-center mb-1">
              <svg className="w-5 h-5 text-[#ef4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className="font-extrabold text-[#ef4444] text-base">Envío Cancelado</div>
            <p className="text-xs text-[#6b6b8a]">Este envío ha sido cancelado por el operador de despacho.</p>
          </div>
        )}
      </div>
    </div>
  );
}
