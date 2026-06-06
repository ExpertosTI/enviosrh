import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconPlus, IconPackage, IconMotorbike } from '../../components/Icons';
import L from 'leaflet';

const TABS: { state: DeliveryState | 'all'; label: string; color: string }[] = [
  { state: 'all',        label: 'Todos',        color: '#5b8af9' },
  { state: 'draft',      label: 'Bandeja Entrada', color: '#a75bf9' }, // Borradores sin asignar
  { state: 'assigned',   label: 'Asignados',    color: '#7caeff' },
  { state: 'in_transit', label: 'En camino',     color: '#f59e0b' },
  { state: 'delivered',  label: 'Entregados',    color: '#22c55e' },
  { state: 'cancelled',  label: 'Cancelados',    color: '#ef4444' },
];

const STATE_COLORS: Record<DeliveryState, string> = {
  draft:      '#a75bf9', // Violeta
  assigned:   '#7caeff', // Azul claro
  in_transit: '#f59e0b', // Amarillo/Naranja
  delivered:  '#22c55e', // Verde
  cancelled:  '#ef4444', // Rojo
};

const BADGE_CLASS: Record<DeliveryState, string> = {
  draft:      'bg-[#a75bf9]/15 text-[#a75bf9] border border-[#a75bf9]/30',
  assigned:   'bg-[#7caeff]/15 text-[#7caeff] border border-[#7caeff]/30',
  in_transit: 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30',
  delivered:  'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30',
  cancelled:  'bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30',
};

export function OperatorDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<DeliveryState | 'all'>('all');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Contadores
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const messengerMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Cargar envíos desde la API
  const loadDeliveries = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const stateParam = tab !== 'all' ? `?state=${tab}` : '';
      const list = await api.get<Delivery[]>(`/deliveries${stateParam}`);
      setDeliveries(list);

      // Calcular contadores
      const allList = tab === 'all' ? list : await api.get<Delivery[]>('/deliveries?state=');
      const tally: Record<string, number> = { all: allList.length };
      allList.forEach((d) => {
        tally[d.state] = (tally[d.state] || 0) + 1;
      });
      setCounts(tally);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener envíos');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [tab]);

  // Primera carga y polling cada 8 segundos
  useEffect(() => {
    loadDeliveries();
    const interval = setInterval(() => {
      loadDeliveries(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadDeliveries]);

  // Inicializar Mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([18.4861, -69.9312], 12); // Centro en Santo Domingo por defecto

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Actualizar marcadores en el mapa cuando cambian los envíos
  useEffect(() => {
    if (!mapRef.current) return;

    const currentMap = mapRef.current;
    const activeMarkers = markersRef.current;
    const activeMessengerMarkers = messengerMarkersRef.current;

    // IDs de envíos y mensajeros recibidos en esta tanda
    const incomingDeliveryIds = new Set<string>();
    const activeMessengerIds = new Set<string>();

    deliveries.forEach((d) => {
      const gpsCoords = d.location_link?.match(/[-\d.]+,\s*[-\d.]+/)?.[0];
      if (!gpsCoords) return; // Si no tiene coordenadas válidas, saltar

      const [lat, lng] = gpsCoords.split(',').map(Number);
      incomingDeliveryIds.add(d.id);

      // 1. Renderizar pin de entrega (Cliente)
      const color = STATE_COLORS[d.state as DeliveryState] ?? '#6b6b8a';
      const isDraft = d.state === 'draft';
      
      const customerIcon = L.divIcon({
        className: `cust-marker-${d.id}`,
        html: `<div class="relative w-8 h-8 rounded-full bg-[#13131f] border-2 flex items-center justify-center shadow-lg transition-transform hover:scale-110" style="border-color: ${color}">
                 <div class="w-3 h-3 rounded-full ${isDraft ? 'animate-ping' : ''}" style="background-color: ${color}"></div>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      if (!activeMarkers.has(d.id)) {
        const marker = L.marker([lat, lng], { icon: customerIcon })
          .addTo(currentMap)
          .bindPopup(`
            <div class="p-1 text-slate-800 font-sans" style="min-width: 160px;">
              <h4 class="font-bold text-sm text-[#13131f] m-0 mb-1">${d.customer_name}</h4>
              <p class="text-xs text-slate-600 m-0 mb-1">${d.customer_address ?? d.address_override ?? 'Sin dirección'}</p>
              <div class="flex items-center gap-1.5 mt-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold text-white" style="background-color: ${color}">
                  ${STATE_LABEL[d.state as DeliveryState]}
                </span>
                ${d.messenger_name ? `<span class="text-[10px] text-slate-500 font-medium">🛵 ${d.messenger_name}</span>` : ''}
              </div>
              <button onclick="window.location.hash='#/operador/envio/${d.id}/compartir'; document.getElementById('view-details-btn-${d.id}')?.click();" class="w-full mt-3 py-1.5 rounded bg-[#5b8af9] text-white font-bold text-[11px] border-0 cursor-pointer text-center">
                Ver Ficha Completa
              </button>
              <a id="view-details-btn-${d.id}" href="/operador/envio/${d.id}/compartir" style="display:none"></a>
            </div>
          `);
        activeMarkers.set(d.id, marker);
      } else {
        const marker = activeMarkers.get(d.id)!;
        marker.setLatLng([lat, lng]);
        marker.setIcon(customerIcon);
      }

      // 2. Renderizar marcador del mensajero si está activo
      if (d.messenger_id && d.state === 'in_transit' && d.messenger_latitude && d.messenger_longitude) {
        const mLat = Number(d.messenger_latitude);
        const mLng = Number(d.messenger_longitude);
        activeMessengerIds.add(d.messenger_id);

        const messengerIcon = L.divIcon({
          className: `messenger-marker-${d.messenger_id}`,
          html: `<div class="w-8 h-8 rounded-full bg-[#13131f] border-2 border-[#5b8af9] flex items-center justify-center shadow-[0_0_10px_rgba(91,138,249,0.5)] transition-all duration-500">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="3">
                     <circle cx="12" cy="5" r="3" />
                     <path d="M5 12h14l-4 8H9l-4-8z" />
                   </svg>
                 </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        if (!activeMessengerMarkers.has(d.messenger_id)) {
          const mMarker = L.marker([mLat, mLng], { icon: messengerIcon })
            .addTo(currentMap)
            .bindPopup(`<b class="font-sans text-slate-800 text-xs">🛵 En camino: ${d.messenger_name}</b>`);
          activeMessengerMarkers.set(d.messenger_id, mMarker);
        } else {
          const mMarker = activeMessengerMarkers.get(d.messenger_id)!;
          mMarker.setLatLng([mLat, mLng]);
        }
      }
    });

    // Limpiar marcadores obsoletos de envíos
    activeMarkers.forEach((marker, id) => {
      if (!incomingDeliveryIds.has(id)) {
        currentMap.removeLayer(marker);
        activeMarkers.delete(id);
      }
    });

    // Limpiar marcadores obsoletos de mensajeros
    activeMessengerMarkers.forEach((marker, id) => {
      if (!activeMessengerIds.has(id)) {
        currentMap.removeLayer(marker);
        activeMessengerMarkers.delete(id);
      }
    });

  }, [deliveries]);

  // Enfocar un envío en el mapa
  const focusOnDelivery = (d: Delivery) => {
    const gpsCoords = d.location_link?.match(/[-\d.]+,\s*[-\d.]+/)?.[0];
    if (gpsCoords && mapRef.current) {
      const [lat, lng] = gpsCoords.split(',').map(Number);
      mapRef.current.setView([lat, lng], 14, { animate: true, duration: 1 });
      const marker = markersRef.current.get(d.id);
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Filtrar lista según el buscador
  const filteredDeliveries = deliveries.filter((d) => {
    const name = (d.customer_name ?? '').toLowerCase();
    const phone = (d.customer_phone ?? '').toLowerCase();
    const address = (d.customer_address ?? d.address_override ?? '').toLowerCase();
    const ref = (d.external_ref ?? '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || phone.includes(query) || address.includes(query) || ref.includes(query);
  });

  return (
    <AppShell>
      <PageHeader
        title="Centro de Despacho RH (2026)"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav('/operador/usuarios')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2a1a4c] text-[#a75bf9] border border-[#a75bf9]/30 text-xs font-bold hover:bg-[#362060] transition-all"
            >
              Aprobaciones
            </button>
            <button
              onClick={() => nav('/operador/nuevo')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5b8af9] text-[#0b0b14] text-xs font-extrabold hover:bg-[#3a68e0] transition-all border-0 cursor-pointer shadow-lg shadow-[#5b8af9]/20"
            >
              <IconPlus size={14} color="#0b0b14" /> Nuevo Envío
            </button>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row h-[calc(100vh-65px)] overflow-hidden">
        
        {/* Panel Izquierdo: Bandeja de Entrada */}
        <div className="w-full lg:w-[420px] shrink-0 border-r border-[#252540] bg-[#13131f]/40 flex flex-col h-1/2 lg:h-full overflow-hidden">
          
          {/* Buscador */}
          <div className="p-4 border-b border-[#252540] flex flex-col gap-3">
            <input
              type="text"
              className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-2.5 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#3a3a58] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30"
              placeholder="Buscar por cliente, teléfono, dirección..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Categorías / Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {TABS.map((t) => {
                const count = t.state === 'all' ? counts.all : counts[t.state];
                const active = tab === t.state;
                return (
                  <button
                    key={t.state}
                    onClick={() => setTab(t.state)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border-0 cursor-pointer transition-all ${
                      active
                        ? 'text-white'
                        : 'text-[#6b6b8a] bg-[#0b0b14] hover:text-[#e8e8f4]'
                    }`}
                    style={active ? { background: t.color + '25', color: t.color, border: `1px solid ${t.color}40` } : { border: '1px solid #252540' }}
                  >
                    {t.label}
                    {count !== undefined && count > 0 && (
                      <span
                        className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold"
                        style={{ background: t.color + '20', color: t.color }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Listado de Envíos */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {loading && <div className="spinner" />}
            {error && <div className="banner-error">{error}</div>}

            {!loading && !error && filteredDeliveries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-10 h-10 rounded-xl bg-[#0b0b14] flex items-center justify-center">
                  <IconPackage size={20} color="#6b6b8a" />
                </div>
                <p className="text-xs text-[#6b6b8a]">No hay envíos en esta bandeja</p>
              </div>
            )}

            {filteredDeliveries.map((d) => {
              const hasGps = !!d.location_link?.match(/[-\d.]+,\s*[-\d.]+/);
              const isDraft = d.state === 'draft';
              return (
                <div
                  key={d.id}
                  onClick={() => focusOnDelivery(d)}
                  className={`flex flex-col gap-2 p-3.5 rounded-xl bg-[#13131f] border transition-all hover:bg-[#1a1a2e] cursor-pointer group ${
                    isDraft 
                      ? 'border-[#a75bf9]/40 shadow-[0_0_12px_rgba(167,91,249,0.1)] ring-1 ring-[#a75bf9]/20' 
                      : 'border-[#252540] hover:border-[#252540]/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#e8e8f4] group-hover:text-[#5b8af9] transition-colors">
                        {d.customer_name}
                      </span>
                      {isDraft && (
                        <span className="w-2 h-2 rounded-full bg-[#a75bf9] animate-ping" title="Nuevo / Sin asignar"></span>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold ${BADGE_CLASS[d.state as DeliveryState]}`}>
                      {STATE_LABEL[d.state as DeliveryState]}
                    </span>
                  </div>

                  <p className="text-xs text-[#6b6b8a] line-clamp-2 leading-relaxed">
                    {d.customer_address ?? d.address_override ?? 'Sin dirección'}
                  </p>

                  <div className="flex items-center gap-3 pt-2 border-t border-[#252540]/60 mt-1">
                    {d.messenger_name ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#7caeff] font-medium">
                        <IconMotorbike size={12} color="#7caeff" /> {d.messenger_name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#a75bf9] font-semibold">
                        ⚠️ Sin mensajero
                      </span>
                    )}

                    {Number(d.delivery_fee) > 0 && (
                      <span className="text-[10px] text-[#6b6b8a] bg-[#0b0b14] px-1.5 py-0.5 rounded border border-[#252540]/40 font-medium">
                        RD$ {Number(d.delivery_fee).toFixed(2)}
                      </span>
                    )}

                    {hasGps && (
                      <span className="text-[10px] text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/25 px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span> GPS
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/operador/envio/${d.id}/compartir`);
                      }}
                      className="ml-auto flex items-center justify-center p-1 rounded bg-[#252540] text-[#6b6b8a] hover:text-[#e8e8f4] hover:bg-[#323258] transition-all border-0 cursor-pointer"
                      title="Administrar Envío"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel Derecho: Mapa en Vivo */}
        <div className="flex-1 h-1/2 lg:h-full relative z-10">
          <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" />
        </div>

      </div>
    </AppShell>
  );
}
