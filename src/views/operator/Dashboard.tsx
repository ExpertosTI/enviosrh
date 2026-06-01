import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { STATE_LABEL } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconPlus, IconPackage, IconMotorbike, IconCheck } from '../../components/Icons';

const TABS: { state: DeliveryState; label: string; color: string }[] = [
  { state: 'assigned',   label: 'Asignados',    color: '#7caeff' },
  { state: 'in_transit', label: 'En camino',     color: '#f59e0b' },
  { state: 'draft',      label: 'Borradores',    color: '#6b6b8a' },
  { state: 'delivered',  label: 'Entregados',    color: '#22c55e' },
  { state: 'cancelled',  label: 'Cancelados',    color: '#ef4444' },
];

const BADGE_CLASS: Record<DeliveryState, string> = {
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

function fmt(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function OperatorDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<DeliveryState>('assigned');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [counts, setCounts] = useState<Partial<Record<DeliveryState, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.get<Delivery[]>(`/deliveries?state=${tab}`);
      setDeliveries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // Carga contadores al montar
  useEffect(() => {
    Promise.all(
      ['assigned', 'in_transit', 'draft'].map((s) =>
        api.get<Delivery[]>(`/deliveries?state=${s}`).then((r) => [s, r.length] as const)
      )
    ).then((pairs) => {
      setCounts(Object.fromEntries(pairs));
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount = (counts['assigned'] ?? 0) + (counts['in_transit'] ?? 0);
  const draftCount  = counts['draft'] ?? 0;

  return (
    <AppShell>
      <PageHeader
        title="Envíos"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav('/operador/usuarios')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2a1a4c] text-[#a75bf9] text-xs font-semibold hover:bg-[#362060] transition-colors"
            >
              Aprobaciones
            </button>
            <button
              onClick={() => nav('/operador/nuevo')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5b8af9] text-white text-xs font-semibold hover:bg-[#3a68e0] transition-colors"
            >
              <IconPlus size={14} /> Nuevo
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={activeCount} label="Activos" color="#5b8af9" />
          <StatCard value={counts['in_transit'] ?? 0} label="En camino" color="#f59e0b" />
          <StatCard value={draftCount} label="Sin asignar" color="#6b6b8a" />
          <StatCard value={counts['assigned'] ?? 0} label="Asignados" color="#7caeff" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map((t) => (
            <button
              key={t.state}
              onClick={() => setTab(t.state)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border-0 cursor-pointer transition-all duration-150',
                tab === t.state
                  ? 'text-white'
                  : 'text-[#6b6b8a] bg-[#13131f] hover:text-[#e8e8f4]',
              ].join(' ')}
              style={tab === t.state ? { background: t.color + '30', color: t.color } : {}}
            >
              {t.label}
              {counts[t.state] !== undefined && counts[t.state]! > 0 && (
                <span
                  className="px-1.5 py-0 rounded-full text-[10px] font-bold"
                  style={{ background: t.color + '30', color: t.color }}
                >
                  {counts[t.state]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading && <div className="spinner" />}
        {error && <div className="banner-error">{error}</div>}

        {!loading && !error && deliveries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#13131f] flex items-center justify-center">
              <IconPackage size={24} color="#6b6b8a" />
            </div>
            <p className="text-sm text-[#6b6b8a]">Sin envíos en este estado</p>
            {tab === 'draft' || tab === 'assigned' ? (
              <button
                onClick={() => nav('/operador/nuevo')}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5b8af9]/15 text-[#5b8af9] text-sm font-semibold hover:bg-[#5b8af9]/25 transition-colors border-0 cursor-pointer"
              >
                <IconPlus size={16} /> Crear envío
              </button>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {deliveries.map((d) => (
            <Link key={d.id} to={`/operador/envio/${d.id}/compartir`} className="ditem group">
              {/* Ícono estado */}
              <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
                   style={{ background: 'rgba(91,138,249,.1)' }}>
                {STATE_ICON[d.state as DeliveryState]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#e8e8f4] truncate">{d.customer_name}</span>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE_CLASS[d.state as DeliveryState]}`}>
                    {STATE_LABEL[d.state as DeliveryState]}
                  </span>
                </div>
                <div className="text-xs text-[#6b6b8a] truncate mt-0.5">
                  {d.customer_address ?? d.address_override ?? '—'}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {d.messenger_name && (
                    <span className="flex items-center gap-1 text-[10px] text-[#6b6b8a]">
                      <IconMotorbike size={11} /> {d.messenger_name}
                    </span>
                  )}
                  {d.delivery_fee > 0 && (
                    <span className="text-[10px] text-[#6b6b8a]">
                      ${d.delivery_fee.toFixed(2)}
                    </span>
                  )}
                  <span className="text-[10px] text-[#6b6b8a] ml-auto">{fmt(d.created_at)}</span>
                </div>
              </div>

              <svg className="shrink-0 text-[#6b6b8a] opacity-0 group-hover:opacity-100 transition-opacity" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => nav('/operador/nuevo')}
        aria-label="Nuevo envío"
        className="md:hidden fixed bottom-20 right-4 w-14 h-14 rounded-2xl bg-[#5b8af9] text-white shadow-[0_8px_32px_rgba(91,138,249,.5)] flex items-center justify-center border-0 cursor-pointer active:scale-95 transition-transform z-20"
      >
        <IconPlus size={24} />
      </button>
    </AppShell>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4">
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-[#6b6b8a] mt-0.5">{label}</div>
    </div>
  );
}
