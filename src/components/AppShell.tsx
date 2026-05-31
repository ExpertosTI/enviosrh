import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSession, logout } from '../lib/auth';
import {
  IconPackage, IconPlus, IconLogout, IconUser, IconMotorbike,
} from './Icons';

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
  const user = getSession();
  const location = useLocation();
  const navigate = useNavigate();

  const items = nav ?? (user?.role === 'messenger' ? messengerNav() : operatorNav());

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
    <div className="flex h-full bg-[#0b0b14]">
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
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            <div className="w-7 h-7 rounded-full bg-[#5b8af9]/20 flex items-center justify-center shrink-0">
              <IconUser size={14} color="#5b8af9" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#e8e8f4] truncate">{user?.name}</div>
              <div className="text-[10px] text-[#6b6b8a] capitalize">{user?.role === 'operator' ? 'Operador' : 'Mensajero'}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-[#6b6b8a] hover:text-[#ef4444] hover:bg-[#2a0a0a] transition-colors"
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
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#13131f] border-b border-[#252540] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#5b8af9]/20 flex items-center justify-center">
            <IconPackage size={16} color="#5b8af9" />
          </div>
          <span className="font-bold text-sm text-[#e8e8f4] flex-1">EnvíosRH</span>
          <span className="text-xs text-[#6b6b8a]">{user?.name}</span>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* ── Bottom nav mobile ─────────────────────────── */}
        <nav className="md:hidden flex items-center bg-[#13131f] border-t border-[#252540] shrink-0">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors',
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
            className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-[#6b6b8a] transition-colors"
          >
            <IconLogout size={20} />
            Salir
          </button>
        </nav>
      </main>
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
          className="p-1.5 rounded-lg text-[#6b6b8a] hover:text-[#e8e8f4] hover:bg-[#252540] transition-colors"
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
