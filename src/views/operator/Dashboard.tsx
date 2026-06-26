import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { OnboardingTour } from '../../components/OnboardingTour';
import { IconPlus, IconPackage, IconMotorbike } from '../../components/Icons';
import L from 'leaflet';

const TABS: { state: DeliveryState | 'all'; label: string; color: string }[] = [
  { state: 'all',        label: 'Todos',        color: '#5b8af9' },
  { state: 'draft',      label: 'Bandeja Entrada', color: '#a75bf9' },
  { state: 'assigned',   label: 'Asignados',    color: '#7caeff' },
  { state: 'in_transit', label: 'En camino',     color: '#f59e0b' },
  { state: 'delivered',  label: 'Entregados',    color: '#22c55e' },
  { state: 'cancelled',  label: 'Cancelados',    color: '#ef4444' },
];

const STATE_COLORS: Record<DeliveryState, string> = {
  draft:      '#a75bf9',
  assigned:   '#7caeff',
  in_transit: '#f59e0b',
  delivered:  '#22c55e',
  cancelled:  '#ef4444',
};

const BADGE_CLASS: Record<DeliveryState, string> = {
  draft:      'bg-[#a75bf9]/15 text-[#a75bf9] border border-[#a75bf9]/30',
  assigned:   'bg-[#7caeff]/15 text-[#7caeff] border border-[#7caeff]/30',
  in_transit: 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30',
  delivered:  'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30',
  cancelled:  'bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30',
};

// ── Helpers ────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0]; }

function exportCSV(rows: Delivery[]) {
  const headers = ['ID','Cliente','Teléfono','Dirección','Estado','Mensajero','Costo Envío','Total Pedido','Fecha'];
  const lines = rows.map((d) => [
    d.id.slice(0,8).toUpperCase(),
    `"${d.customer_name ?? ''}"`,
    d.customer_phone ?? '',
    `"${d.customer_address ?? d.address_override ?? ''}"`,
    STATE_LABEL[d.state as DeliveryState] ?? d.state,
    `"${d.messenger_name ?? ''}"`,
    Number(d.delivery_fee ?? 0).toFixed(2),
    Number(d.total_amount ?? 0).toFixed(2),
    new Date(d.created_at ?? '').toLocaleDateString('es-DO'),
  ].join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `envios_${todayISO()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function OperatorDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<DeliveryState | 'all'>('all');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState(todayISO()); // Hoy por defecto
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [kpi, setKpi] = useState({ ingresos: 0, entregados: 0, pendientes: 0 });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const messengerMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  const loadDeliveries = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('state', tab);
      if (dateFilter) params.set('date', dateFilter);
      const qs = params.toString() ? `?${params}` : '';
      const list = await api.get<Delivery[]>(`/deliveries${qs}`);
      setDeliveries(list);

      // Calcular KPIs
      const delivered = list.filter(d => d.state === 'delivered');
      const pending = list.filter(d => ['draft','assigned','in_transit'].includes(d.state));
      const ingresos = delivered.reduce((s, d) => s + Number(d.delivery_fee ?? 0), 0);
      setKpi({ ingresos, entregados: delivered.length, pendientes: pending.length });

      // Contadores por estado (usando la misma lista)
      const tally: Record<string, number> = { all: list.length };
      list.forEach((d) => { tally[d.state] = (tally[d.state] || 0) + 1; });
      setCounts(tally);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener envíos');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [tab, dateFilter]);

  // Polling con visibilitychange (se pausa si el tab está oculto)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      loadDeliveries();
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') loadDeliveries(true);
      }, 8000);
    };
    const stopPolling = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => document.visibilityState === 'visible' ? startPolling() : stopPolling();

    startPolling();
    document.addEventListener('visibilitychange', onVis);
    return () => { stopPolling(); document.removeEventListener('visibilitychange', onVis); };
  }, [loadDeliveries]);

  // Mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false })
      .setView([18.4861, -69.9312], 12);
    const isDark = document.documentElement.classList.contains('dark');
    tileLayerRef.current = L.tileLayer(
      isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
             : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(mapRef.current);
    setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => { mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null; };
  }, []);

  useEffect(() => {
    const h = () => {
      if (!tileLayerRef.current) return;
      const isDark = document.documentElement.classList.contains('dark');
      tileLayerRef.current.setUrl(
        isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
               : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      );
    };
    window.addEventListener('themechange', h);
    return () => window.removeEventListener('themechange', h);
  }, []);

  // Marcadores en mapa
  useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;
    const activeMarkers = markersRef.current;
    const activeMessengerMarkers = messengerMarkersRef.current;
    const incomingDeliveryIds = new Set<string>();
    const activeMessengerIds = new Set<string>();

    deliveries.forEach((d) => {
      const gpsCoords = d.location_link?.match(/[-\d.]+,\s*[-\d.]+/)?.[0];
      if (!gpsCoords) return;
      const [lat, lng] = gpsCoords.split(',').map(Number);
      incomingDeliveryIds.add(d.id);
      const color = STATE_COLORS[d.state as DeliveryState] ?? '#6b6b8a';
      const isDraft = d.state === 'draft';

      const customerIcon = L.divIcon({
        className: `cust-marker-${d.id}`,
        html: `<div class="relative w-8 h-8 rounded-full bg-[#13131f] border-2 flex items-center justify-center shadow-lg" style="border-color: ${color}">
                 <div class="w-3 h-3 rounded-full ${isDraft ? 'animate-ping' : ''}" style="background-color: ${color}"></div>
               </div>`,
        iconSize: [32, 32], iconAnchor: [16, 16]
      });

      if (!activeMarkers.has(d.id)) {
        const marker = L.marker([lat, lng], { icon: customerIcon })
          .addTo(currentMap)
          .bindPopup(`
            <div class="p-1 font-sans" style="min-width: 160px;">
              <h4 class="font-bold text-sm m-0 mb-1">${d.customer_name}</h4>
              <p class="text-xs text-slate-500 m-0 mb-1">${d.customer_address ?? d.address_override ?? 'Sin dirección'}</p>
              <div class="flex items-center gap-1.5 mt-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold text-white" style="background-color: ${color}">
                  ${STATE_LABEL[d.state as DeliveryState]}
                </span>
                ${d.messenger_name ? `<span class="text-[10px] text-slate-500 font-medium">🛵 ${d.messenger_name}</span>` : ''}
              </div>
              <a href="/operador/envio/${d.id}/compartir" class="display-block w-full mt-3 py-1.5 rounded text-center font-bold text-[11px] no-underline" style="background:#5b8af9;color:white;display:block">
                Ver Ficha Completa →
              </a>
            </div>
          `);
        activeMarkers.set(d.id, marker);
      } else {
        const marker = activeMarkers.get(d.id)!;
        marker.setLatLng([lat, lng]);
        marker.setIcon(customerIcon);
      }

      if (d.messenger_id && d.state === 'in_transit' && d.messenger_latitude && d.messenger_longitude) {
        const mLat = Number(d.messenger_latitude);
        const mLng = Number(d.messenger_longitude);
        activeMessengerIds.add(d.messenger_id);
        const messengerIcon = L.divIcon({
          className: `messenger-marker-${d.messenger_id}`,
          html: `<div class="w-8 h-8 rounded-full bg-[#13131f] border-2 border-[#5b8af9] flex items-center justify-center shadow-[0_0_10px_rgba(91,138,249,0.5)]">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="3"><circle cx="12" cy="5" r="3"/><path d="M5 12h14l-4 8H9l-4-8z"/></svg>
                 </div>`,
          iconSize: [32, 32], iconAnchor: [16, 16]
        });
        if (!activeMessengerMarkers.has(d.messenger_id)) {
          const mMarker = L.marker([mLat, mLng], { icon: messengerIcon })
            .addTo(currentMap)
            .bindPopup(`<b class="font-sans text-xs">🛵 En camino: ${d.messenger_name}</b>`);
          activeMessengerMarkers.set(d.messenger_id, mMarker);
        } else {
          activeMessengerMarkers.get(d.messenger_id)!.setLatLng([mLat, mLng]);
        }
      }
    });

    activeMarkers.forEach((marker, id) => {
      if (!incomingDeliveryIds.has(id)) { currentMap.removeLayer(marker); activeMarkers.delete(id); }
    });
    activeMessengerMarkers.forEach((marker, id) => {
      if (!activeMessengerIds.has(id)) { currentMap.removeLayer(marker); activeMessengerMarkers.delete(id); }
    });
  }, [deliveries]);

  const focusOnDelivery = (d: Delivery) => {
    const gpsCoords = d.location_link?.match(/[-\d.]+,\s*[-\d.]+/)?.[0];
    if (gpsCoords && mapRef.current) {
      const [lat, lng] = gpsCoords.split(',').map(Number);
      mapRef.current.setView([lat, lng], 14, { animate: true, duration: 1 });
      markersRef.current.get(d.id)?.openPopup();
    }
  };

  const filteredDeliveries = deliveries.filter((d) => {
    const q = searchQuery.toLowerCase();
    return [d.customer_name, d.customer_phone, d.customer_address, d.address_override, d.external_ref]
      .some((v) => (v ?? '').toLowerCase().includes(q));
  });

  return (
    <AppShell>
      <OnboardingTour role="operator" />
      <PageHeader
        title="Centro de Despacho RH"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5b8af9] text-white text-xs font-extrabold hover:bg-[#3a68e0] transition-all border-0 cursor-pointer shadow-lg shadow-[#5b8af9]/20"
            >
              <IconPlus size={14} color="#ffffff" /> Nuevo Envío
            </button>
          </div>
        }
      />

      {/* ── KPI Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0b0b14] border-b border-[#252540] overflow-x-auto shrink-0">
        {/* Filtro de fecha */}
        <div className="flex items-center gap-1.5 shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b6b8a" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-[#13131f] border border-[#252540] rounded-lg px-2 py-1 text-[11px] text-[#e8e8f4] outline-none focus:border-[#5b8af9] cursor-pointer"
          />
          {dateFilter !== todayISO() && (
            <button
              onClick={() => setDateFilter(todayISO())}
              className="text-[10px] text-[#5b8af9] font-bold bg-transparent border-0 cursor-pointer hover:underline"
            >
              Hoy
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-[#252540] shrink-0" />

        {/* KPIs */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[#6b6b8a]">Ingresos:</span>
          <span className="text-[11px] font-extrabold text-[#22c55e]">RD$ {kpi.ingresos.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[#6b6b8a]">Entregados:</span>
          <span className="text-[11px] font-extrabold text-[#22c55e]">{kpi.entregados}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[#6b6b8a]">Pendientes:</span>
          <span className="text-[11px] font-extrabold text-[#f59e0b]">{kpi.pendientes}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[#6b6b8a]">Total:</span>
          <span className="text-[11px] font-extrabold text-[#e8e8f4]">{counts.all ?? 0}</span>
        </div>

        {/* Exportar CSV */}
        <button
          onClick={() => exportCSV(filteredDeliveries)}
          disabled={filteredDeliveries.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#13131f] border border-[#252540] text-[10px] text-[#6b6b8a] font-bold hover:border-[#22c55e]/40 hover:text-[#22c55e] transition-all cursor-pointer disabled:opacity-30 shrink-0"
          title="Exportar listado como CSV"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          CSV
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-105px)] overflow-hidden">

        {/* Panel Izquierdo: Bandeja */}
        <div className="w-full lg:w-[420px] shrink-0 border-r border-[#252540] bg-[#13131f]/40 flex flex-col h-1/2 lg:h-full overflow-hidden">

          {/* Buscador */}
          <div className="p-4 border-b border-[#252540] flex flex-col gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input
                type="text"
                className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl pl-9 pr-4 py-2.5 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#3a3a58] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30"
                placeholder="Buscar por cliente, teléfono, dirección..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {TABS.map((t) => {
                const count = counts[t.state] ?? counts.all;
                const active = tab === t.state;
                return (
                  <button
                    key={t.state}
                    onClick={() => setTab(t.state)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border-0 cursor-pointer transition-all ${
                      active ? 'text-white' : 'text-[#6b6b8a] bg-[#0b0b14] hover:text-[#e8e8f4]'
                    }`}
                    style={active
                      ? { background: t.color + '25', color: t.color, border: `1px solid ${t.color}40` }
                      : { border: '1px solid #252540' }
                    }
                  >
                    {t.label}
                    {count !== undefined && count > 0 && (
                      <span className="px-1.5 rounded-full text-[9px] font-extrabold"
                        style={{ background: t.color + '20', color: t.color }}>
                        {t.state === 'all' ? (counts.all ?? 0) : (counts[t.state] ?? 0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Listado */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {loading && <div className="spinner" />}
            {error && <div className="banner-error">{error}</div>}

            {!loading && !error && filteredDeliveries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#0b0b14] border border-[#252540] flex items-center justify-center">
                  <IconPackage size={22} color="#3a3a58" />
                </div>
                <p className="text-xs text-[#6b6b8a]">No hay envíos para esta fecha y filtro</p>
                <button
                  onClick={() => setDateFilter('')}
                  className="text-[11px] text-[#5b8af9] font-bold bg-transparent border-0 cursor-pointer hover:underline"
                >
                  Ver todos los envíos
                </button>
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
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm text-[#e8e8f4] group-hover:text-[#5b8af9] transition-colors truncate">
                        {d.customer_name}
                      </span>
                      {isDraft && <span className="w-2 h-2 rounded-full bg-[#a75bf9] animate-ping shrink-0" />}
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold ${BADGE_CLASS[d.state as DeliveryState]}`}>
                      {STATE_LABEL[d.state as DeliveryState]}
                    </span>
                  </div>

                  <p className="text-xs text-[#6b6b8a] line-clamp-1 leading-relaxed">
                    {d.customer_address ?? d.address_override ?? 'Sin dirección'}
                  </p>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#252540]/60 mt-1 flex-wrap">
                    {d.messenger_name ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#7caeff] font-medium">
                        <IconMotorbike size={11} color="#7caeff" /> {d.messenger_name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#a75bf9] font-semibold">⚠️ Sin mensajero</span>
                    )}

                    {Number(d.delivery_fee) > 0 && (
                      <span className="text-[10px] text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/20 px-1.5 py-0.5 rounded font-bold">
                        RD$ {Number(d.delivery_fee).toFixed(0)}
                      </span>
                    )}

                    {hasGps && (
                      <span className="text-[10px] text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/25 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> GPS
                      </span>
                    )}

                    <span className="text-[9px] text-[#3a3a58] ml-auto">
                      {new Date(d.created_at ?? '').toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <button
                      onClick={(e) => { e.stopPropagation(); nav(`/operador/envio/${d.id}/compartir`); }}
                      className="flex items-center justify-center p-1 rounded bg-[#252540] text-[#6b6b8a] hover:text-[#5b8af9] hover:bg-[#323258] transition-all border-0 cursor-pointer"
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

        {/* Panel Derecho: Mapa */}
        <div className="flex-1 h-1/2 lg:h-full relative z-10">
          <div ref={mapContainerRef} className="w-full h-full bg-[#0b0b14]" />

          {/* Leyenda del mapa */}
          <div className="absolute bottom-4 right-4 bg-[#13131f]/90 backdrop-blur-sm border border-[#252540] rounded-xl p-3 flex flex-col gap-1.5 text-[10px] z-[1000]">
            {Object.entries(STATE_COLORS).map(([state, color]) => (
              <div key={state} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[#6b6b8a]">{STATE_LABEL[state as DeliveryState]}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-[#252540]">
              <span className="w-2 h-2 rounded-full bg-[#5b8af9] shrink-0" />
              <span className="text-[#6b6b8a]">Mensajero</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
