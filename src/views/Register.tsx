import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicApi } from '../lib/api';
import { IconPackage } from '../components/Icons';

export function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await publicApi.post<any>('/auth/register', form);
      setSuccess(res.message || 'Registro enviado con éxito. Espera a ser aprobado.');
      setTimeout(() => navigate('/login'), 5000);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al registrarse.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#3a3a58] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex items-center justify-center px-4 py-12">
      {/* Glow Visual de Fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#5b8af9]/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#5b8af9]/20 border border-[#5b8af9]/30 flex items-center justify-center shadow-[0_0_32px_rgba(91,138,249,.2)]">
            <IconPackage size={28} color="#5b8af9" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#e8e8f4] tracking-tight">EnvíosRH</h1>
            <p className="text-xs text-[#6b6b8a] mt-0.5">Crear cuenta en la plataforma</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,.5)]">
          <h2 className="text-base font-bold text-[#e8e8f4] mb-4">Registro</h2>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-[#2a0a0a] border border-[#ef4444]/30 text-[#ef4444] text-sm">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 flex flex-col gap-1.5 p-3.5 rounded-xl bg-[#0a2a18] border border-[#22c55e]/30 text-[#22c55e] text-xs font-semibold">
              <div>{success}</div>
              <div className="text-[#22c55e]/70 font-medium">Redirigiendo en 5 segundos...</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Nombre Completo</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Ej. Juan Pérez"
                disabled={loading || !!success}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Teléfono</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputCls}
                placeholder="Ej. 809-555-0199"
                disabled={loading || !!success}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Usuario (Email)</label>
              <input
                required
                type="text"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="usuario@correo.com"
                disabled={loading || !!success}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Contraseña</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputCls}
                placeholder="••••••••"
                disabled={loading || !!success}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#5b8af9] text-[#0b0b14] font-extrabold text-sm hover:bg-[#3a68e0] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer shadow-lg shadow-[#5b8af9]/25"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-[#0b0b14]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Creando cuenta…
                </>
              ) : 'Registrarse'}
            </button>

            <p className="text-center text-xs text-[#6b6b8a] mt-2">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-[#5b8af9] hover:underline font-bold transition-colors">
                Inicia Sesión
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
