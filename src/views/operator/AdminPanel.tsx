import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { AppShell, PageHeader } from '../../components/AppShell';
import { TenantSettings } from './TenantSettings';
import { getSession } from '../../lib/auth';

// ── Tipos ────────────────────────────────────────────────────
interface StateCount { state: string; count: number; }
interface Stats {
  total_deliveries: number;
  active_messengers: number;
  active_sellers: number;
  total_customers: number;
  total_fees: number;
  states: StateCount[];
}
interface Seller {
  id: string; name: string; email: string | null; phone: string | null;
  created_at: string; deliveries_created: number;
}
interface Messenger {
  id: string; name: string; email: string | null; phone: string | null;
  active: boolean; created_at: string;
  deliveries_completed: number; deliveries_total: number; average_rating: number;
  latitude: number | null; longitude: number | null; location_updated_at: string | null;
}
interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  address: string | null; reference: string | null; created_at: string;
  deliveries_received: number; deliveries_delivered: number;
}
interface AdminData {
  stats: Stats;
  sellers: Seller[];
  messengers: Messenger[];
  customers: Customer[];
}

// ── Paleta de estados ────────────────────────────────────────
const STATE_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'En Espera',  color: '#a75bf9', bg: 'rgba(167,91,249,0.12)' },
  assigned:   { label: 'Asignados',  color: '#7caeff', bg: 'rgba(124,174,255,0.12)' },
  in_transit: { label: 'En Camino',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  delivered:  { label: 'Entregados', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  cancelled:  { label: 'Cancelados', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

// ── Icono Estrella ───────────────────────────────────────────
function Stars({ value }: { value: number }) {
  const stars = Math.round(Number(value) * 2) / 2;
  return (
    <span className="flex gap-0.5 items-center">
      {[1,2,3,4,5].map(s => (
        <svg key={s} width="11" height="11" viewBox="0 0 24 24"
          fill={s <= stars ? '#f59e0b' : 'none'}
          stroke={s <= stars ? '#f59e0b' : '#94a3b8'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
      <span className="text-[10px] text-slate-500 dark:text-[#6b6b8a] ml-1">{Number(value).toFixed(1)}</span>
    </span>
  );
}

// ── Badge de estado ──────────────────────────────────────────
function StateBadge({ active }: { active: boolean }) {
  return active
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-[#22c55e]/10 text-green-600 dark:text-[#22c55e]">Activo</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-[#ef4444]/10 text-red-500 dark:text-[#ef4444]">Inactivo</span>;
}

// ── KPI Card ─────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, sub }: { label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl p-5 flex items-center gap-4 transition-colors duration-200 hover:shadow-md">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '22' }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider">{label}</div>
        <div className="text-2xl font-extrabold text-slate-800 dark:text-[#e8e8f4] mt-0.5 tabular-nums">{value}</div>
        {sub && <div className="text-[11px] text-slate-400 dark:text-[#6b6b8a] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Búsqueda genérica ────────────────────────────────────────
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#6b6b8a]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] placeholder:text-slate-400 dark:placeholder:text-[#3a3a58] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30 transition-all"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Panel Principal ─────────────────────────────────────────
export function AdminPanel() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'sellers' | 'messengers' | 'customers' | 'settings'>('messengers');
  const [search, setSearch] = useState('');

  // ── Modal de Registro de Colaboradores ──
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', role: 'messenger' as 'messenger' | 'operator' });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPassword: string; slug: string } | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterError('');
    try {
      const res = await api.post<{
        message: string;
        user: { id: string; name: string; email: string; role: string };
        tempPassword: string;
      }>('/users', registerForm);

      const session = getSession();
      const slug = session?.tenant?.slug ?? 'enviosrh';
      
      setCreatedCredentials({
        email: res.user.email,
        tempPassword: res.tempPassword,
        slug
      });

      // Refrescar dashboard / datos
      const updated = await api.get<AdminData>('/users/admin-dashboard');
      setData(updated);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Error al registrar colaborador');
    } finally {
      setRegisterLoading(false);
    }
  };

  const closeRegisterModal = () => {
    setShowRegisterModal(false);
    setRegisterForm({ name: '', email: '', phone: '', role: 'messenger' });
    setRegisterError('');
    setCreatedCredentials(null);
  };

  useEffect(() => {
    setLoading(true);
    api.get<AdminData>('/users/admin-dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar datos'))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;

  // Barra de progreso por estado
  const totalState = stats ? stats.states.reduce((a, s) => a + s.count, 0) || 1 : 1;

  // Filtros de búsqueda
  const q = search.toLowerCase();
  const filteredSellers = useMemo(() =>
    (data?.sellers ?? []).filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q)
    ), [data?.sellers, q]);

  const filteredMessengers = useMemo(() =>
    (data?.messengers ?? []).filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      (m.phone ?? '').toLowerCase().includes(q)
    ), [data?.messengers, q]);

  const filteredCustomers = useMemo(() =>
    (data?.customers ?? []).filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q)
    ), [data?.customers, q]);

  return (
    <AppShell>
      <PageHeader title="Panel Administrativo" back="/operador" />

      <div className="p-4 md:p-6 flex flex-col gap-6 pb-16">

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 dark:bg-[#2a0a0a] border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-red-600 dark:text-[#ef4444] text-sm font-semibold">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-4 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-[#16162a] rounded-2xl" />)}
          </div>
        )}

        {stats && (
          <>
            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Total Envíos"
                value={stats.total_deliveries}
                color="#5b8af9"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
              />
              <KpiCard
                label="Ingresos Totales"
                value={`RD$ ${stats.total_fees.toFixed(2)}`}
                color="#22c55e"
                sub="Suma de tarifas cobradas"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>}
              />
              <KpiCard
                label="Vendedores"
                value={stats.active_sellers}
                color="#f59e0b"
                sub="Operadores activos"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              />
              <KpiCard
                label="Mensajeros"
                value={stats.active_messengers}
                color="#a75bf9"
                sub="En servicio activo"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a75bf9" strokeWidth="2.5"><circle cx="12" cy="5" r="3"/><path d="M5 12h14l-4 8H9l-4-8z"/></svg>}
              />
              <KpiCard
                label="Clientes"
                value={stats.total_customers}
                color="#7caeff"
                sub="Registrados en BD"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7caeff" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
            </div>

            {/* ── Distribución de Estados ── */}
            <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl p-5 transition-colors duration-200">
              <div className="text-xs font-bold text-slate-400 dark:text-[#6b6b8a] uppercase tracking-wider mb-4">Distribución de Envíos por Estado</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(STATE_META).map(([key, meta]) => {
                  const stateRow = stats.states.find(s => s.state === key);
                  const count = stateRow?.count ?? 0;
                  const pct = Math.round((count / totalState) * 100);
                  return (
                    <div key={key} className="flex-1 min-w-[100px] flex flex-col gap-1.5">
                      <div className="flex justify-between text-[10px] font-semibold">
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        <span className="text-slate-500 dark:text-[#6b6b8a]">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-[#0b0b14] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: meta.color }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-400 dark:text-[#6b6b8a] text-right">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Directorios ── */}
            <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl transition-colors duration-200 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-100 dark:border-[#252540] overflow-x-auto">
                {([
                  { key: 'messengers', label: 'Mensajeros', count: data.messengers.length },
                  { key: 'sellers',    label: 'Vendedores', count: data.sellers.length },
                  { key: 'customers',  label: 'Clientes',   count: data.customers.length },
                  { key: 'settings',   label: 'Marca y Perfil', count: null },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setSearch(''); }}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-colors border-0 cursor-pointer ${
                      tab === t.key
                        ? 'text-[#5b8af9] border-b-2 border-[#5b8af9] bg-[#5b8af9]/5'
                        : 'text-slate-400 dark:text-[#6b6b8a] hover:text-slate-700 dark:hover:text-[#e8e8f4] bg-transparent'
                    }`}
                  >
                    {t.label}
                    {t.count !== null && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${tab === t.key ? 'bg-[#5b8af9]/15 text-[#5b8af9]' : 'bg-slate-100 dark:bg-[#252540]/60 text-slate-400 dark:text-[#6b6b8a]'}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Búsqueda */}
              {tab !== 'settings' && (
                <div className="p-4 border-b border-slate-50 dark:border-[#252540]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={
                        tab === 'sellers' ? 'Buscar por nombre, email o teléfono…' :
                        tab === 'messengers' ? 'Buscar mensajero por nombre, email o teléfono…' :
                        'Buscar cliente por nombre, teléfono, email o dirección…'
                      }
                    />
                  </div>
                  {(tab === 'messengers' || tab === 'sellers') && (
                    <button
                      onClick={() => setShowRegisterModal(true)}
                      className="px-4 py-2 bg-[#5b8af9] hover:bg-[#5b8af9]/90 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors border-0 cursor-pointer self-start sm:self-auto"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Registrar Colaborador
                    </button>
                  )}
                </div>
              )}

              {/* ── Tabla Mensajeros ── */}
              {tab === 'messengers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#0b0b14]/50 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a] border-b border-slate-100 dark:border-[#252540]">
                        <th className="px-4 py-3 text-left">Mensajero</th>
                        <th className="px-4 py-3 text-left">Contacto</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-center">Completados</th>
                        <th className="px-4 py-3 text-center">Total</th>
                        <th className="px-4 py-3 text-center">Calificación</th>
                        <th className="px-4 py-3 text-center">GPS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#252540]/40">
                      {filteredMessengers.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400 dark:text-[#6b6b8a]">Sin resultados</td></tr>
                      )}
                      {filteredMessengers.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-[#0b0b14]/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#a75bf9]/15 flex items-center justify-center shrink-0 font-bold text-[#a75bf9] text-xs border border-[#a75bf9]/30">
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-[#e8e8f4] text-xs">{m.name}</div>
                                <div className="text-[10px] text-slate-400 dark:text-[#6b6b8a]">@{m.email ?? 'sin usuario'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-[#6b6b8a]">{m.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-center"><StateBadge active={m.active} /></td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-[#22c55e] text-sm">{m.deliveries_completed}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-slate-600 dark:text-[#6b6b8a] text-sm">{m.deliveries_total}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <Stars value={m.average_rating} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {m.latitude && m.longitude ? (
                              <a
                                href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-[#22c55e]/10 text-green-600 dark:text-[#22c55e] text-[10px] font-bold hover:opacity-80 transition-opacity"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                                Live
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-300 dark:text-[#3a3a58]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabla Vendedores ── */}
              {tab === 'sellers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#0b0b14]/50 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a] border-b border-slate-100 dark:border-[#252540]">
                        <th className="px-4 py-3 text-left">Vendedor / Operador</th>
                        <th className="px-4 py-3 text-left">Contacto</th>
                        <th className="px-4 py-3 text-center">Envíos Registrados</th>
                        <th className="px-4 py-3 text-left">Miembro desde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#252540]/40">
                      {filteredSellers.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-slate-400 dark:text-[#6b6b8a]">Sin resultados</td></tr>
                      )}
                      {filteredSellers.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-[#0b0b14]/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#f59e0b]/15 flex items-center justify-center shrink-0 font-bold text-[#f59e0b] text-xs border border-[#f59e0b]/30">
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-[#e8e8f4] text-xs">{s.name}</div>
                                <div className="text-[10px] text-slate-400 dark:text-[#6b6b8a]">@{s.email ?? '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-[#6b6b8a]">{s.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-[#5b8af9] text-sm">{s.deliveries_created}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 dark:text-[#6b6b8a]">
                            {new Date(s.created_at).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabla Clientes ── */}
              {tab === 'customers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#0b0b14]/50 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a] border-b border-slate-100 dark:border-[#252540]">
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">Teléfono / Email</th>
                        <th className="px-4 py-3 text-left">Dirección</th>
                        <th className="px-4 py-3 text-center">Recibidos</th>
                        <th className="px-4 py-3 text-center">Entregados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#252540]/40">
                      {filteredCustomers.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400 dark:text-[#6b6b8a]">Sin resultados</td></tr>
                      )}
                      {filteredCustomers.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-[#0b0b14]/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#7caeff]/15 flex items-center justify-center shrink-0 font-bold text-[#7caeff] text-xs border border-[#7caeff]/30">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-slate-800 dark:text-[#e8e8f4] text-xs">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700 dark:text-[#e8e8f4]">{c.phone}</div>
                            {c.email && <div className="text-[10px] text-slate-400 dark:text-[#6b6b8a]">{c.email}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#6b6b8a] max-w-[200px] truncate">
                            {c.address ?? '—'}
                            {c.reference && <span className="text-[10px] italic block text-slate-400 dark:text-[#3a3a58]">{c.reference}</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-[#5b8af9] text-sm">{c.deliveries_received}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-[#22c55e] text-sm">{c.deliveries_delivered}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* ── Configuración de Marca ── */}
              {tab === 'settings' && (
                <div className="p-4 md:p-6 bg-slate-50 dark:bg-[#0b0b14]/30">
                  <TenantSettings />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modal de Registro de Colaborador ── */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200">
            
            {/* Encabezado */}
            <div className="p-5 border-b border-slate-100 dark:border-[#252540] flex justify-between items-center">
              <h3 className="font-extrabold text-slate-800 dark:text-[#e8e8f4] text-base">
                {createdCredentials ? '¡Colaborador Registrado!' : 'Registrar Nuevo Colaborador'}
              </h3>
              <button 
                onClick={closeRegisterModal}
                className="text-slate-400 hover:text-slate-600 dark:text-[#6b6b8a] dark:hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252540]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {!createdCredentials ? (
              /* Formulario de registro */
              <form onSubmit={handleRegister} className="p-5 flex flex-col gap-4">
                {registerError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-red-600 dark:text-[#ef4444] text-xs font-semibold">
                    {registerError}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                    Correo Electrónico (Usuario)
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Ej. juan.perez@empresa.com"
                    className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    placeholder="Ej. 8091234567"
                    className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                    Rol en la Empresa
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setRegisterForm({ ...registerForm, role: 'messenger' })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        registerForm.role === 'messenger'
                          ? 'bg-[#5b8af9]/15 border-[#5b8af9] text-[#5b8af9]'
                          : 'bg-transparent border-slate-200 dark:border-[#252540] text-slate-500 dark:text-[#6b6b8a] hover:bg-slate-50 dark:hover:bg-[#0b0b14]/50'
                      }`}
                    >
                      🛵 Mensajero
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegisterForm({ ...registerForm, role: 'operator' })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        registerForm.role === 'operator'
                          ? 'bg-[#5b8af9]/15 border-[#5b8af9] text-[#5b8af9]'
                          : 'bg-transparent border-slate-200 dark:border-[#252540] text-slate-500 dark:text-[#6b6b8a] hover:bg-slate-50 dark:hover:bg-[#0b0b14]/50'
                      }`}
                    >
                      💼 Vendedor / Operador
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registerLoading}
                  className="mt-2 w-full py-2.5 bg-[#5b8af9] hover:bg-[#5b8af9]/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all cursor-pointer border-0 flex items-center justify-center gap-2"
                >
                  {registerLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'Registrar Colaborador'}
                </button>
              </form>
            ) : (
              /* Pantalla de éxito con credenciales */
              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2 text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#6b6b8a]">
                    Se ha enviado un correo de bienvenida automático al colaborador con sus accesos.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Código de Empresa (Slug)</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-[#e8e8f4] font-mono mt-0.5">{createdCredentials.slug}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Usuario / Correo</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-[#e8e8f4] font-mono mt-0.5">{createdCredentials.email}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Contraseña Temporal</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-sm font-bold text-green-600 dark:text-green-400 font-mono">{createdCredentials.tempPassword}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdCredentials.tempPassword);
                        }}
                        className="px-2 py-1 bg-slate-200 dark:bg-[#252540] hover:bg-slate-300 dark:hover:bg-[#252540]/80 rounded text-[10px] font-bold text-slate-700 dark:text-[#e8e8f4] border-0 cursor-pointer transition-all"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={closeRegisterModal}
                  className="w-full py-2.5 bg-[#5b8af9] hover:bg-[#5b8af9]/90 text-white font-bold text-sm rounded-xl transition-all cursor-pointer border-0"
                >
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
