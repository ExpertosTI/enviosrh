import { useEffect, useState, useMemo, useRef } from 'react';
import { api, uploadFile } from '../../lib/api';
import { exportToCsv, exportToPdfHtml } from '../../lib/export';
import { AppShell, PageHeader } from '../../components/AppShell';
import { TenantSettings } from './TenantSettings';
import { AssignRulesSettings } from '../../components/AssignRulesSettings';
import { BillingPanel } from '../../components/BillingPanel';
import { getSession } from '../../lib/auth';
import { IconUser } from '../../components/Icons';
import L from 'leaflet';


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
  avatar_url?: string | null; status?: string | null;
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
  const [chartData, setChartData] = useState<{ daily: { day: string; delivered: number; fees: number }[]; summary: { avg_delivery_minutes: number } } | null>(null);

  // ── Modal de Registro de Colaboradores ──
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', role: 'messenger' as 'messenger' | 'operator', avatar_url: '' });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPassword: string; slug: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // ── Modal de Edición de Colaboradores ──
  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: 'messenger' | 'operator';
    active: boolean;
    avatar_url: string;
    password?: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError('');
    try {
      const res = await uploadFile(file);
      setRegisterForm(prev => ({ ...prev, avatar_url: res.url }));
    } catch (err: any) {
      setAvatarError(err.message || 'Error al subir la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleEditAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError('');
    try {
      const res = await uploadFile(file);
      setEditingUser(prev => prev ? { ...prev, avatar_url: res.url } : null);
    } catch (err: any) {
      setAvatarError(err.message || 'Error al subir la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      await api.patch(`/users/${editingUser.id}`, {
        name: editingUser.name,
        email: editingUser.email,
        phone: editingUser.phone,
        role: editingUser.role,
        active: editingUser.active,
        avatar_url: editingUser.avatar_url,
        password: editingUser.password || undefined
      });
      // Refrescar
      const updated = await api.get<AdminData>('/users/admin-dashboard');
      setData(updated);
      setEditingUser(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar colaborador');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${name}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.delete(`/users/${id}`);
      const updated = await api.get<AdminData>('/users/admin-dashboard');
      setData(updated);
      if (editingUser?.id === id) {
        setEditingUser(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar colaborador');
    }
  };

  // ── Modal de Mapa de Mensajeros ──
  const [selectedMessengerForMap, setSelectedMessengerForMap] = useState<{ name: string; latitude: number; longitude: number; updatedAt?: string | null } | null>(null);

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
    setRegisterForm({ name: '', email: '', phone: '', role: 'messenger', avatar_url: '' });
    setRegisterError('');
    setCreatedCredentials(null);
    setAvatarError('');
  };

  useEffect(() => {
    setLoading(true);
    api.get<AdminData>('/users/admin-dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar datos'))
      .finally(() => setLoading(false));
    api.get<typeof chartData>('/analytics/dashboard?days=14')
      .then(setChartData)
      .catch(() => {});
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

            {chartData && chartData.daily.length > 0 && (
              <div className="card">
                <div className="flex justify-between items-center mb-3">
                  <div className="card-title mb-0">Entregas últimos 14 días</div>
                  <div className="flex gap-2">
                    <a href="/operador/zonas" className="btn btn-ghost btn-sm text-xs no-underline">Zonas</a>
                    <button type="button" onClick={() => api.get<Record<string,unknown>[]>('/analytics/export').then(rows => exportToCsv('envios-hoy.csv', rows))} className="btn btn-ghost btn-sm text-xs">CSV</button>
                    <button type="button" onClick={() => api.get<Record<string,unknown>[]>('/analytics/export').then(rows => exportToPdfHtml('Reporte Envíos', rows))} className="btn btn-ghost btn-sm text-xs">PDF</button>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-28">
                  {chartData.daily.map(d => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[#5b8af9]/80 rounded-t" style={{ height: `${Math.max(8, d.delivered * 12)}px` }} title={`${d.delivered} entregas`} />
                      <span className="text-[8px] text-[#6b6b8a]">{new Date(d.day).getDate()}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#6b6b8a] mt-2">Tiempo promedio de entrega: {chartData.summary.avg_delivery_minutes} min</p>
              </div>
            )}

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
                  { key: 'messengers', label: 'Mensajeros', count: data?.messengers?.length ?? 0 },
                  { key: 'sellers',    label: 'Vendedores', count: data?.sellers?.length ?? 0 },
                  { key: 'customers',  label: 'Clientes',   count: data?.customers?.length ?? 0 },
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
                        <th className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#252540]/40">
                      {filteredMessengers.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400 dark:text-[#6b6b8a]">Sin resultados</td></tr>
                      )}
                      {filteredMessengers.map(m => (
                        <tr 
                          key={m.id} 
                          onClick={() => {
                            if (m.latitude && m.longitude) {
                              setSelectedMessengerForMap({
                                name: m.name,
                                latitude: Number(m.latitude),
                                longitude: Number(m.longitude),
                                updatedAt: m.location_updated_at
                              });
                            }
                          }}
                          className={`hover:bg-slate-50 dark:hover:bg-[#0b0b14]/30 transition-colors ${m.latitude && m.longitude ? 'cursor-pointer' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {m.avatar_url ? (
                                <img src={m.avatar_url} alt={m.name} className="w-8 h-8 rounded-full shrink-0 object-cover border border-[#a75bf9]/30" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#a75bf9]/15 flex items-center justify-center shrink-0 font-bold text-[#a75bf9] text-xs border border-[#a75bf9]/30">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-[#e8e8f4] text-xs flex items-center gap-1.5">
                                  {m.name}
                                  {m.status && (
                                    <span 
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        m.status === 'available' 
                                          ? 'bg-[#22c55e]' 
                                          : m.status === 'busy' 
                                            ? 'bg-[#f59e0b]' 
                                            : 'bg-slate-400 dark:bg-[#3a3a58]'
                                      }`} 
                                      title={m.status === 'available' ? 'Disponible' : m.status === 'busy' ? 'Ocupado' : 'Offline'} 
                                    />
                                  )}
                                </div>
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
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedMessengerForMap({
                                    name: m.name,
                                    latitude: Number(m.latitude),
                                    longitude: Number(m.longitude),
                                    updatedAt: m.location_updated_at
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-[#22c55e]/10 text-green-600 dark:text-[#22c55e] text-[10px] font-bold hover:opacity-80 transition-opacity border-0 cursor-pointer"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                                Live
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300 dark:text-[#3a3a58]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setEditingUser({
                                  id: m.id,
                                  name: m.name,
                                  email: m.email || '',
                                  phone: m.phone || '',
                                  role: 'messenger',
                                  active: m.active,
                                  avatar_url: m.avatar_url || ''
                                })}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-[#5b8af9] hover:bg-[#3a68e0] rounded-lg border-0 cursor-pointer transition-all"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(m.id, m.name)}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg border-0 cursor-pointer transition-all"
                              >
                                Eliminar
                              </button>
                            </div>
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
                        <th className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#252540]/40">
                      {filteredSellers.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400 dark:text-[#6b6b8a]">Sin resultados</td></tr>
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
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setEditingUser({
                                  id: s.id,
                                  name: s.name,
                                  email: s.email || '',
                                  phone: s.phone || '',
                                  role: 'operator',
                                  active: true,
                                  avatar_url: ''
                                })}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-[#5b8af9] hover:bg-[#3a68e0] rounded-lg border-0 cursor-pointer transition-all"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(s.id, s.name)}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg border-0 cursor-pointer transition-all"
                              >
                                Eliminar
                              </button>
                            </div>
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
                <div className="p-4 md:p-6 bg-slate-50 dark:bg-[#0b0b14]/30 flex flex-col gap-2">
                  <BillingPanel />
                  <AssignRulesSettings />
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

                <div className="flex flex-col items-center gap-2 mb-2">
                  <div className="relative group w-16 h-16 rounded-full bg-slate-100 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] flex items-center justify-center overflow-hidden transition-all hover:border-[#5b8af9] cursor-pointer">
                    {registerForm.avatar_url ? (
                      <img src={registerForm.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <IconUser size={24} color="#8c8cb4" />
                    )}
                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-[#0b0b14]/70 flex items-center justify-center">
                        <svg className="w-4 h-4 animate-spin text-[#5b8af9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                        </svg>
                      </div>
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px] text-white font-bold uppercase">
                      Subir
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-[#6b6b8a] font-bold uppercase tracking-wider">Foto de Perfil (Opcional)</span>
                  {avatarError && <span className="text-[9px] text-red-500 font-medium">{avatarError}</span>}
                  {registerForm.avatar_url && (
                    <button
                      type="button"
                      onClick={() => setRegisterForm(prev => ({ ...prev, avatar_url: '' }))}
                      className="text-[9px] text-red-500 hover:underline bg-transparent border-0 cursor-pointer font-semibold"
                    >
                      Remover foto
                    </button>
                  )}
                </div>

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
                    Usuario o Correo Electrónico
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. juanperez o juan@empresa.com"
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

      {/* ── Modal de Edición de Colaborador ── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-all animate-in zoom-in-95 duration-200">
            
            {/* Encabezado */}
            <div className="p-5 border-b border-slate-100 dark:border-[#252540] flex justify-between items-center bg-white dark:bg-[#13131f]">
              <h3 className="font-extrabold text-slate-800 dark:text-[#e8e8f4] text-base">
                Editar Colaborador
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:text-[#6b6b8a] dark:hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252540]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-5 flex flex-col gap-4">
              {editError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-2.5 text-red-600 dark:text-[#ef4444] text-xs font-semibold">
                  {editError}
                </div>
              )}

              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-2 mb-2">
                <div className="relative group w-16 h-16 rounded-full bg-slate-100 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] flex items-center justify-center overflow-hidden transition-all hover:border-[#5b8af9] cursor-pointer">
                  {editingUser.avatar_url ? (
                    <img src={editingUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <IconUser size={24} color="#8c8cb4" />
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-[#0b0b14]/70 flex items-center justify-center">
                      <svg className="w-4 h-4 animate-spin text-[#5b8af9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                      </svg>
                    </div>
                  )}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px] text-white font-bold uppercase">
                    Subir
                    <input type="file" accept="image/*" className="hidden" onChange={handleEditAvatarChange} disabled={uploadingAvatar} />
                  </label>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-[#6b6b8a] font-bold uppercase tracking-wider">Foto de Perfil (Opcional)</span>
                {avatarError && <span className="text-[9px] text-red-500 font-medium">{avatarError}</span>}
                {editingUser.avatar_url && (
                  <button
                    type="button"
                    onClick={() => setEditingUser(prev => prev ? { ...prev, avatar_url: '' } : null)}
                    className="text-[9px] text-red-500 hover:underline bg-transparent border-0 cursor-pointer font-semibold"
                  >
                    Remover foto
                  </button>
                )}
              </div>

              {/* Nombre */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>

              {/* Usuario o Correo */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                  Usuario o Correo Electrónico
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. juanperez o juan@empresa.com"
                  className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                />
              </div>

              {/* Teléfono */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                  Teléfono
                </label>
                <input
                  type="tel"
                  placeholder="Ej. 8091234567"
                  className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                  value={editingUser.phone}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </div>

              {/* Rol */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                  Rol en la Empresa
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditingUser(prev => prev ? { ...prev, role: 'messenger' } : null)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      editingUser.role === 'messenger'
                        ? 'border-[#5b8af9] bg-[#5b8af9]/15 text-[#5b8af9]'
                        : 'border-slate-200 dark:border-[#252540] bg-transparent text-slate-400 dark:text-[#6b6b8a] hover:border-slate-300 dark:hover:border-[#252540]/80'
                    }`}
                  >
                    Mensajero
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingUser(prev => prev ? { ...prev, role: 'operator' } : null)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      editingUser.role === 'operator'
                        ? 'border-[#5b8af9] bg-[#5b8af9]/15 text-[#5b8af9]'
                        : 'border-slate-200 dark:border-[#252540] bg-transparent text-slate-400 dark:text-[#6b6b8a] hover:border-slate-300 dark:hover:border-[#252540]/80'
                    }`}
                  >
                    Vendedor / Operador
                  </button>
                </div>
              </div>

              {/* Estado Activo */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">Cuenta Activa</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-[#5b8af9] focus:ring-[#5b8af9] bg-slate-50 dark:bg-[#0b0b14] border-slate-200 dark:border-[#252540]"
                  checked={editingUser.active}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, active: e.target.checked } : null)}
                />
              </div>

              {/* Nueva Contraseña (Opcional) */}
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#6b6b8a]">
                  Nueva Contraseña <span className="text-[9px] text-[#6b6b8a] normal-case">(Opcional, dejar vacío para no cambiar)</span>
                </label>
                <input
                  type="password"
                  placeholder="Nueva contraseña"
                  className="px-3 py-2 bg-slate-50 dark:bg-[#0b0b14] border border-slate-200 dark:border-[#252540] rounded-xl text-sm outline-none text-slate-800 dark:text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, password: e.target.value } : null)}
                />
              </div>

              {/* Botón de Enviar */}
              <button
                type="submit"
                disabled={editLoading}
                className="w-full mt-2 py-3 bg-[#5b8af9] hover:bg-[#3a68e0] text-[#0b0b14] font-extrabold text-sm rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-0 shadow-lg"
              >
                {editLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedMessengerForMap && (
        <MessengerMapModal
          messenger={selectedMessengerForMap}
          onClose={() => setSelectedMessengerForMap(null)}
        />
      )}
    </AppShell>
  );
}

// ── Componente Modal de Mapa en Vivo del Mensajero ──────────────────
interface MessengerMapModalProps {
  messenger: { name: string; latitude: number; longitude: number; updatedAt?: string | null };
  onClose: () => void;
}

function MessengerMapModal({ messenger, onClose }: MessengerMapModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Inicializar mapa de Leaflet
    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([messenger.latitude, messenger.longitude], 15);

    const isDark = document.documentElement.classList.contains('dark');
    L.tileLayer(
      isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(mapRef.current);

    // Pin personalizado del mensajero
    const messengerIcon = L.divIcon({
      className: 'messenger-map-pin',
      html: `<div class="w-8 h-8 rounded-full bg-[#13131f] border-2 border-[#5b8af9] flex items-center justify-center shadow-[0_0_12px_rgba(91,138,249,0.7)]">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" stroke-width="3">
                 <circle cx="12" cy="5" r="3" />
                 <path d="M5 12h14l-4 8H9l-4-8z" />
               </svg>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    L.marker([messenger.latitude, messenger.longitude], { icon: messengerIcon })
      .addTo(mapRef.current)
      .bindPopup(`<b class="font-sans text-xs text-slate-800">🛵 ${messenger.name}</b>`)
      .openPopup();

    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [messenger]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#13131f] border border-slate-200 dark:border-[#252540] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl transition-all animate-in zoom-in-95 duration-200 flex flex-col h-[400px]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-[#252540] flex justify-between items-center bg-white dark:bg-[#13131f]">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 dark:text-[#e8e8f4]">
              Ubicación en Vivo de {messenger.name}
            </h3>
            {messenger.updatedAt && (
              <p className="text-[10px] text-slate-400 dark:text-[#6b6b8a] mt-0.5">
                Última actualización: {new Date(messenger.updatedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-[#6b6b8a] dark:hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#252540] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-slate-100 dark:bg-[#0b0b14]">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    </div>
  );
}
