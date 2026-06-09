import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSession, logout, updateSessionUser } from '../lib/auth';
import { api } from '../lib/api';
import {
  IconPackage, IconPlus, IconLogout, IconUser, IconMotorbike,
} from './Icons';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

function operatorNav(): NavItem[] {
  return [
    { to: '/operador', label: 'Envíos', icon: <IconPackage size={20} />, exact: true },
    { to: '/operador/nuevo', label: 'Nuevo envío', icon: <IconPlus size={20} /> },
    { to: '/operador/admin', label: 'Panel Admin', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="7" height="9" rx="1"/><rect x="13" y="3" width="9" height="5" rx="1"/>
        <rect x="13" y="12" width="9" height="9" rx="1"/><rect x="2" y="16" width="7" height="5" rx="1"/>
      </svg>
    )},
  ];
}

function messengerNav(): NavItem[] {
  return [
    { to: '/mensajero', label: 'Mis envíos', icon: <IconMotorbike size={20} />, exact: true },
  ];
}

interface AppShellProps {
  children: React.ReactNode;
  /** Si se omite se infiere del rol en sesión */
  nav?: NavItem[];
}

export function AppShell({ children, nav }: AppShellProps) {
  const [currentUser, setCurrentUser] = useState(() => getSession());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const items = nav ?? (currentUser?.role === 'messenger' ? messengerNav() : operatorNav());

  // Formulario de edición del perfil
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Cargar datos actuales al abrir el modal
  useEffect(() => {
    if (showProfileModal) {
      setProfileLoading(true);
      setProfileError('');
      setProfileSuccess(false);
      api.get<{ id: string; name: string; email: string; phone: string | null }>('/users/profile')
        .then((data) => {
          setProfileForm({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            password: '',
          });
        })
        .catch((err) => {
          setProfileError(err instanceof Error ? err.message : 'Error al cargar perfil');
        })
        .finally(() => {
          setProfileLoading(false);
        });
    }
  }, [showProfileModal]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess(false);
    try {
      const payload: any = {
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone || null,
      };
      if (profileForm.password) {
        payload.password = profileForm.password;
      }
      
      const res = await api.patch<{ user: { name: string; email: string } }>('/users/profile', payload);
      updateSessionUser({ name: res.user.name });
      setCurrentUser(getSession());
      setProfileSuccess(true);
      setProfileForm(prev => ({ ...prev, password: '' }));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Error al actualizar perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  function isActive(item: NavItem) {
    return item.exact
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-full bg-[#0b0b14] text-[#e8e8f4]">
      {/* ── Sidebar desktop ─────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#13131f] border-r border-[#252540] h-full">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#252540]">
          <div className="w-8 h-8 rounded-lg bg-[#5b8af9]/20 flex items-center justify-center">
            <IconPackage size={18} color="#5b8af9" />
          </div>
          <span className="font-bold text-base text-[#e8e8f4] tracking-tight">EnvíosRH</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive(item)
                  ? 'bg-[#5b8af9]/15 text-[#5b8af9]'
                  : 'text-[#6b6b8a] hover:text-[#e8e8f4] hover:bg-[#252540]/60',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User + logout */}
        <div className="p-3 border-t border-[#252540]">
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-[#252540]/50 transition-colors">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex flex-1 items-center gap-2.5 min-w-0 text-left bg-transparent border-0 cursor-pointer p-1 rounded-lg"
              title="Ver Perfil"
            >
              <div className="w-8 h-8 rounded-full bg-[#5b8af9]/20 flex items-center justify-center shrink-0 border border-[#5b8af9]/40">
                <IconUser size={15} color="#5b8af9" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#e8e8f4] truncate hover:text-[#5b8af9] transition-colors">{currentUser?.name}</div>
                <div className="text-[9px] text-[#6b6b8a] capitalize">{currentUser?.role === 'operator' ? 'Operador' : 'Mensajero'}</div>
              </div>
            </button>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-[#6b6b8a] hover:text-[#ef4444] hover:bg-[#2a0a0a] transition-colors bg-transparent border-0 cursor-pointer"
              title="Cerrar sesión"
            >
              <IconLogout size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-2.5 px-4 py-2.5 bg-[#13131f] border-b border-[#252540] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#5b8af9]/20 flex items-center justify-center">
            <IconPackage size={16} color="#5b8af9" />
          </div>
          <span className="font-bold text-sm text-[#e8e8f4] flex-1">EnvíosRH</span>
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-1.5 bg-[#252540]/60 hover:bg-[#252540] px-2 py-1 rounded-lg transition-colors border-0 cursor-pointer text-[#e8e8f4]"
          >
            <div className="w-5 h-5 rounded-full bg-[#5b8af9]/20 flex items-center justify-center shrink-0 border border-[#5b8af9]/40">
              <IconUser size={11} color="#5b8af9" />
            </div>
            <span className="text-xs font-semibold max-w-[80px] truncate">{currentUser?.name}</span>
          </button>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto bg-[#0b0b14]">
          {children}
        </div>

        {/* ── Bottom nav mobile ─────────────────────────── */}
        <nav className="md:hidden flex items-center bg-[#13131f] border-t border-[#252540] shrink-0">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors',
                isActive(item) ? 'text-[#5b8af9]' : 'text-[#6b6b8a]',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-semibold text-[#6b6b8a] transition-colors bg-transparent border-0 cursor-pointer"
          >
            <IconLogout size={20} />
            Salir
          </button>
        </nav>
      </main>

      {/* ── Modal de Mi Perfil (Editable) ─────────────────────────── */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#13131f] border border-[#252540] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-all animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 border-b border-[#252540] flex justify-between items-center">
              <h3 className="font-extrabold text-sm text-[#e8e8f4]">
                Mi Perfil
              </h3>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="text-[#6b6b8a] hover:text-[#e8e8f4] bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-[#252540] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {profileLoading && !profileForm.name ? (
              <div className="p-10 flex flex-col items-center justify-center gap-3">
                <span className="w-8 h-8 border-3 border-[#5b8af9] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[#6b6b8a]">Cargando información...</span>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="p-4 flex flex-col gap-3">
                {profileError && (
                  <div className="bg-red-950/45 border border-red-900/50 rounded-xl px-3 py-2 text-[#ef4444] text-[11px] font-semibold">
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="bg-green-950/45 border border-green-900/50 rounded-xl px-3 py-2 text-[#22c55e] text-[11px] font-semibold">
                    ¡Perfil actualizado correctamente!
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#6b6b8a]">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Tu nombre"
                    className="px-3 py-2 bg-[#0b0b14] border border-[#252540] rounded-xl text-xs outline-none text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#6b6b8a]">
                    Usuario / Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@correo.com"
                    className="px-3 py-2 bg-[#0b0b14] border border-[#252540] rounded-xl text-xs outline-none text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#6b6b8a]">
                    Teléfono de Contacto
                  </label>
                  <input
                    type="tel"
                    placeholder="Tu teléfono"
                    className="px-3 py-2 bg-[#0b0b14] border border-[#252540] rounded-xl text-xs outline-none text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#6b6b8a]">
                    Nueva Contraseña (Dejar en blanco para no cambiar)
                  </label>
                  <input
                    type="password"
                    placeholder="Min. 6 caracteres"
                    className="px-3 py-2 bg-[#0b0b14] border border-[#252540] rounded-xl text-xs outline-none text-[#e8e8f4] focus:border-[#5b8af9] transition-all"
                    value={profileForm.password}
                    onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={profileLoading}
                  className="mt-2 w-full py-2.5 bg-[#5b8af9] hover:bg-[#5b8af9]/90 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer border-0 flex items-center justify-center gap-2"
                >
                  {profileLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'Guardar Cambios'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Header interno de una página (back + título) */
export function PageHeader({
  title,
  back,
  actions,
}: {
  title: string;
  back?: string;
  actions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-[#252540] bg-[#0b0b14] md:bg-transparent sticky top-0 z-10 backdrop-blur-sm">
      {back && (
        <button
          onClick={() => navigate(back)}
          className="p-1.5 rounded-lg text-[#6b6b8a] hover:text-[#e8e8f4] hover:bg-[#252540] transition-colors bg-transparent border-0 cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <h1 className="text-base font-bold text-[#e8e8f4] flex-1">{title}</h1>
      {actions}
    </div>
  );
}
