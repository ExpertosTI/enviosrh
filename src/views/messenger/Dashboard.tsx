import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconPackage, IconMotorbike, IconCheck } from '../../components/Icons';
import { useGps } from '../../lib/GpsContext';

const BADGE_BG: Record<DeliveryState, string> = {
  draft:      'bg-[#1a1a30] text-[#6b6b8a]',
  assigned:   'bg-[#0f2040] text-[#7caeff]',
  in_transit: 'bg-[#2a1800] text-[#f59e0b]',
  delivered:  'bg-[#0a2a18] text-[#22c55e]',
  cancelled:  'bg-[#2a0a0a] text-[#ef4444]',
};

const STATE_ICON: Record<DeliveryState, React.ReactNode> = {
  draft:      <IconPackage size={16} color="#6b6b8a" />,
  assigned:   <IconPackage size={16} color="#7caeff" />,
  in_transit: <IconMotorbike size={16} color="#f59e0b" />,
  delivered:  <IconCheck size={16} color="#22c55e" />,
  cancelled:  <IconPackage size={16} color="#ef4444" />,
};

export function MessengerDashboard() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { status: gpsStatus, coords, accuracy, requestGps } = useGps();

  const loadDeliveries = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const ds = await api.get<Delivery[]>('/deliveries');
      setDeliveries(ds.filter((d) => d.state !== 'cancelled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener envíos');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
    const interval = setInterval(() => {
      loadDeliveries(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadDeliveries]);

  const [filterMode, setFilterMode] = useState<'today' | 'all'>('today');

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const todayEnd = new Date();
  todayEnd.setHours(23,59,59,999);

  // Filtrar envíos según modo
  const filteredDeliveries = deliveries.filter((d) => {
    if (filterMode === 'today') {
      const dDate = new Date(d.created_at);
      return dDate >= todayStart && dDate <= todayEnd;
    }
    return true;
  });

  // KPIs de hoy (siempre sobre envíos de hoy)
  const todayDeliveries = deliveries.filter((d) => {
    const dDate = new Date(d.created_at);
    return dDate >= todayStart && dDate <= todayEnd;
  });
  const todayCompleted = todayDeliveries.filter((d) => d.state === 'delivered');
  const todayEarnings = todayCompleted.reduce((acc, d) => acc + Number(d.delivery_fee || 0), 0);

  // Estimación de km recorridos hoy basándose en coordenadas de entrega
  const todayKm = todayCompleted.reduce((acc, d) => {
    if (!d.location_link) return acc + 6.5; // Estimación base si no hay link
    const match = d.location_link.match(/([-\d.]+),\s*([-\d.]+)/) || d.location_link.match(/query=([-\d.]+),([-\d.]+)/) || d.location_link.match(/@([-\d.]+),([-\d.]+)/);
    if (!match) return acc + 6.5;
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    // Haversine a base Richard Hookah SRL: 18.5201702, -70.0261773
    const R = 6371;
    const dLat = (lat - 18.5201702) * Math.PI / 180;
    const dLng = (lng - (-70.0261773)) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(18.5201702*Math.PI/180) * Math.cos(lat*Math.PI/180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const dKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return acc + dKm;
  }, 0);

  const active   = filteredDeliveries.filter((d) => d.state === 'in_transit');
  const assigned = filteredDeliveries.filter((d) => d.state === 'assigned');
  const rest     = filteredDeliveries.filter((d) => !['in_transit', 'assigned'].includes(d.state));

  return (
    <AppShell>
      <PageHeader
        title="Mis envíos"
        actions={
          <div className="flex bg-[#13131f] border border-[#252540] rounded-xl p-0.5">
            <button
              onClick={() => setFilterMode('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                filterMode === 'today' ? 'bg-[#5b8af9] text-white' : 'text-[#6b6b8a] hover:text-[#e8e8f4]'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                filterMode === 'all' ? 'bg-[#5b8af9] text-white' : 'text-[#6b6b8a] hover:text-[#e8e8f4]'
              }`}
            >
              Todos
            </button>
          </div>
        }
      />
      <div className="p-4 md:p-6 flex flex-col gap-5">
        {/* Stats / KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-3 text-center">
            <div className="text-[9px] font-bold text-[#6b6b8a] uppercase tracking-wider mb-1">Completados</div>
            <div className="text-xl font-black text-green-400">
              {todayCompleted.length}<span className="text-xs text-[#6b6b8a] font-normal">/{todayDeliveries.length}</span>
            </div>
          </div>
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-3 text-center">
            <div className="text-[9px] font-bold text-[#6b6b8a] uppercase tracking-wider mb-1">Ingresos de Hoy</div>
            <div className="text-xl font-black text-[#5b8af9] truncate">
              <span className="text-xs font-semibold mr-0.5">RD$</span>{todayEarnings.toFixed(0)}
            </div>
          </div>
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-3 text-center">
            <div className="text-[9px] font-bold text-[#6b6b8a] uppercase tracking-wider mb-1">Distancia Est.</div>
            <div className="text-xl font-black text-[#f59e0b]">
              {todayKm.toFixed(1)}<span className="text-xs font-semibold ml-0.5">km</span>
            </div>
          </div>
        </div>

        {/* ── Estado GPS ── */}
        <div
          className={`rounded-[14px] border p-3 flex items-center gap-3 transition-colors ${
            gpsStatus === 'active'
              ? 'bg-[#0a2a18] border-[#22c55e]/30'
              : gpsStatus === 'denied'
              ? 'bg-[#2a0a0a] border-[#ef4444]/30'
              : 'bg-[#16162a] border-[#252540]'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              gpsStatus === 'active' ? 'bg-[#22c55e]/15' : gpsStatus === 'denied' ? 'bg-[#ef4444]/15' : 'bg-[#5b8af9]/10'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={gpsStatus === 'active' ? '#22c55e' : gpsStatus === 'denied' ? '#ef4444' : '#5b8af9'} strokeWidth="2.5">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-xs font-bold ${gpsStatus === 'active' ? 'text-[#22c55e]' : gpsStatus === 'denied' ? 'text-[#ef4444]' : 'text-[#6b6b8a]'}`}>
              {gpsStatus === 'active' ? '📡 Ubicación Activa — Estás en línea' :
               gpsStatus === 'requesting' ? '⏳ Buscando señal GPS…' :
               gpsStatus === 'denied' ? '⛔ GPS Bloqueado' :
               gpsStatus === 'unavailable' ? '❌ GPS no disponible' :
               '📍 GPS Inactivo'}
            </div>
            <div className="text-[10px] text-[#6b6b8a] mt-0.5">
              {gpsStatus === 'active' && accuracy !== null
                ? `Precisión: ±${Math.round(accuracy)}m · Lat ${coords?.[0].toFixed(5)}, Lng ${coords?.[1].toFixed(5)}`
                : gpsStatus === 'denied'
                ? 'Activa el permiso de ubicación en la configuración de tu navegador'
                : 'Tu ubicación se comparte automáticamente cuando GPS está activo'}
            </div>
          </div>
          {(gpsStatus === 'idle' || gpsStatus === 'error') && (
            <button
              onClick={requestGps}
              className="bg-[#5b8af9] text-white font-bold text-[10px] px-3 py-1.5 rounded-lg border-0 cursor-pointer shrink-0"
            >
              Activar
            </button>
          )}
          {gpsStatus === 'active' && (
            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
          )}
        </div>

        {loading && <div className="spinner" />}
        {error && <div className="banner-error">{error}</div>}


        {/* En camino */}
        {active.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
              <span className="text-xs font-bold text-[#f59e0b] uppercase tracking-wide">En camino</span>
            </div>
            <div className="flex flex-col gap-2">
              {active.map((d) => <DeliveryCard key={d.id} d={d} />)}
            </div>
          </section>
        )}

        {/* Asignados */}
        {assigned.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7caeff]" />
              <span className="text-xs font-bold text-[#7caeff] uppercase tracking-wide">Asignados</span>
            </div>
            <div className="flex flex-col gap-2">
              {assigned.map((d) => <DeliveryCard key={d.id} d={d} />)}
            </div>
          </section>
        )}

        {/* Resto */}
        {rest.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              <span className="text-xs font-bold text-[#22c55e] uppercase tracking-wide">Entregados</span>
            </div>
            <div className="flex flex-col gap-2">
              {rest.map((d) => <DeliveryCard key={d.id} d={d} />)}
            </div>
          </section>
        )}

        {!loading && filteredDeliveries.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#13131f] flex items-center justify-center">
              <IconPackage size={24} color="#6b6b8a" />
            </div>
            <p className="text-sm text-[#6b6b8a]">No tienes envíos {filterMode === 'today' ? 'para hoy' : ''}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DeliveryCard({ d }: { d: Delivery }) {
  function fmt(date: string | null) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return (
    <Link to={`/mensajero/envio/${d.id}`} className="ditem group">
      <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-[#5b8af9]/10">
        {STATE_ICON[d.state as DeliveryState]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#e8e8f4] truncate">{d.customer_name ?? 'Cliente'}</span>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE_BG[d.state as DeliveryState]}`}>
            {STATE_LABEL[d.state as DeliveryState]}
          </span>
        </div>
        <div className="text-xs text-[#6b6b8a] truncate mt-0.5">{d.customer_address ?? d.address_override ?? '—'}</div>
        <div className="text-[10px] text-[#6b6b8a] mt-1">{fmt(d.created_at)}</div>
      </div>
      <svg className="shrink-0 text-[#6b6b8a] opacity-0 group-hover:opacity-100 transition-opacity" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
