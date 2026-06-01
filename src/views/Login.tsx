import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { saveSession } from '../lib/auth';
import { IconPackage } from '../components/Icons';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post<{ token: string; user: { id: string; name: string; role: 'operator' | 'messenger' } }>(
        '/auth/login', { email, password }
      );
      saveSession(res.token, res.user);
      nav(res.user.role === 'messenger' ? '/mensajero' : '/operador', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#3a3a58] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex items-center justify-center px-4 py-12">
      {/* BG glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#5b8af9]/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#5b8af9]/20 border border-[#5b8af9]/30 flex items-center justify-center shadow-[0_0_32px_rgba(91,138,249,.2)]">
            <IconPackage size={28} color="#5b8af9" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#e8e8f4] tracking-tight">EnvíosRH</h1>
            <p className="text-xs text-[#6b6b8a] mt-0.5">Plataforma de gestión de envíos</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,.5)]">
          <h2 className="text-base font-bold text-[#e8e8f4] mb-5">Iniciar sesión</h2>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-[#2a0a0a] border border-[#ef4444]/30 text-[#ef4444] text-sm">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Correo electrónico</label>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Contraseña</label>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#5b8af9] text-white font-semibold text-sm hover:bg-[#3a68e0] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Entrando…
                </>
              ) : 'Entrar'}
            </button>

            <Link 
              to="/register" 
              className="mt-1 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-transparent border border-[#3a3a58] text-[#e8e8f4] font-semibold text-sm hover:bg-[#1f1f3a] active:scale-[.98] transition-all cursor-pointer text-decoration-none"
            >
              Regístrate
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
