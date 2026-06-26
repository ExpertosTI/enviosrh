import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicApi, uploadFile } from '../lib/api';
import { IconPackage, IconUser } from '../components/Icons';
import { ThemeToggle } from '../components/ThemeToggle';

export function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [registerMode, setRegisterMode] = useState<'new_company' | 'join_company' | 'customer'>('new_company');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    companyName: '',
    companySlug: ''
  });
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError('');
    try {
      const res = await uploadFile(file);
      setAvatarUrl(res.url);
    } catch (err: any) {
      setError(err.message || 'Error al subir la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        registerMode,
        companyName: registerMode === 'new_company' ? form.companyName : undefined,
        companySlug: form.companySlug,
        avatar_url: avatarUrl || undefined
      };
      const res = await publicApi.post<any>('/auth/register', payload);
      setSuccess(res.message || 'Registro completado con éxito.');
      setTimeout(() => navigate('/login'), 5000);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al registrarse.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-[#1a1a2e] border border-[#252540] rounded-xl px-4 py-3.5 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#4a4a6a] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30';

  return (
    <div className="min-h-screen bg-[#0b0b14] flex items-center justify-center px-4 py-12">
      {/* Theme Toggle in Register */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Glow Visual de Fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#5b8af9]/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-16 h-16 rounded-[20px] bg-[#5b8af9]/20 border border-[#5b8af9]/30 flex items-center justify-center shadow-[0_0_32px_rgba(91,138,249,.2)]">
            <IconPackage size={32} color="#5b8af9" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-[#e8e8f4] tracking-tight">Envíos App</h1>
            <p className="text-[11px] text-[#5b8af9] font-bold uppercase tracking-widest mt-1">by Renace.tech</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#13131f] border border-[#252540] rounded-3xl p-7 shadow-[0_30px_70px_rgba(0,0,0,.6)]">
          {/* Mode Switcher */}
          <div className="flex bg-[#0b0b14] p-1.5 rounded-2xl border border-[#252540] mb-6">
            <button
              type="button"
              onClick={() => setRegisterMode('new_company')}
              className={`flex-1 py-2.5 text-[10px] font-black rounded-xl uppercase tracking-wider transition-all border-0 cursor-pointer ${
                registerMode === 'new_company'
                  ? 'bg-[#5b8af9] text-[#0b0b14]'
                  : 'bg-transparent text-[#6b6b8a] hover:text-[#e8e8f4]'
              }`}
            >
              Nueva
            </button>
            <button
              type="button"
              onClick={() => setRegisterMode('join_company')}
              className={`flex-1 py-2.5 text-[10px] font-black rounded-xl uppercase tracking-wider transition-all border-0 cursor-pointer ${
                registerMode === 'join_company'
                  ? 'bg-[#5b8af9] text-[#0b0b14]'
                  : 'bg-transparent text-[#6b6b8a] hover:text-[#e8e8f4]'
              }`}
            >
              Unirse
            </button>
            <button
              type="button"
              onClick={() => setRegisterMode('customer')}
              className={`flex-1 py-2.5 text-[10px] font-black rounded-xl uppercase tracking-wider transition-all border-0 cursor-pointer ${
                registerMode === 'customer'
                  ? 'bg-[#5b8af9] text-[#0b0b14]'
                  : 'bg-transparent text-[#6b6b8a] hover:text-[#e8e8f4]'
              }`}
            >
              Cliente
            </button>
          </div>

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
            {registerMode === 'new_company' && (
              <div className="flex flex-col gap-1.5 animate-slide-up">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Nombre de la Empresa</label>
                <input
                  required
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className={inputCls}
                  placeholder="Ej. Express Logistic"
                  disabled={loading || !!success}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">Código de la Empresa (Slug)</label>
              <input
                required
                type="text"
                value={form.companySlug}
                onChange={(e) => setForm({ ...form, companySlug: e.target.value })}
                className={inputCls}
                placeholder="Ej. express"
                disabled={loading || !!success}
              />
              <span className="text-[9px] text-[#6b6b8a]">Único, sin espacios ni caracteres especiales.</span>
            </div>

             <div className="flex flex-col items-center gap-2 mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b8a]">Foto de Perfil</label>
              <div className="relative group w-20 h-20 rounded-full bg-[#0b0b14] border border-[#252540] flex items-center justify-center overflow-hidden transition-all hover:border-[#5b8af9] cursor-pointer">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <IconUser size={32} color="#3a3a58" />
                )}
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-[#0b0b14]/70 flex items-center justify-center">
                    <svg className="w-5 h-5 animate-spin text-[#5b8af9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                    </svg>
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] text-white font-bold uppercase">
                  Subir
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
                </label>
              </div>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="text-[10px] text-[#ef4444] hover:underline bg-transparent border-0 cursor-pointer font-semibold"
                >
                  Eliminar Foto
                </button>
              )}
            </div>

            <hr className="border-[#252540] my-1" />

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
                  Procesando…
                </>
              ) : registerMode === 'new_company' ? 'Crear Empresa y Cuenta' : 'Registrarse'}
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
