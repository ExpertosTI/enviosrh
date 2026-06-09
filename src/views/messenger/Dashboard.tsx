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

  const active   = deliveries.filter((d) => d.state === 'in_transit');
  const assigned = deliveries.filter((d) => d.state === 'assigned');
  const rest     = deliveries.filter((d) => !['in_transit', 'assigned'].includes(d.state));

  return (
    <AppShell>
      <PageHeader title="Mis envíos" />
      <div className="p-4 md:p-6 flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4">
            <div className="text-2xl font-bold text-[#f59e0b]">{active.length}</div>
            <div className="text-xs text-[#6b6b8a] mt-0.5">En camino</div>
          </div>
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4">
            <div className="text-2xl font-bold text-[#7caeff]">{assigned.length}</div>
            <div className="text-xs text-[#6b6b8a] mt-0.5">Por entregar</div>
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

        {!loading && deliveries.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#13131f] flex items-center justify-center">
              <IconPackage size={24} color="#6b6b8a" />
            </div>
            <p className="text-sm text-[#6b6b8a]">No tienes envíos asignados</p>
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
