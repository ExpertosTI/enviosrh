import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicApi } from '../lib/api';

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

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-700 relative overflow-hidden">
        {/* Adorno visual */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Crear Cuenta</h1>
          <p className="text-slate-400">Regístrate para acceder al sistema</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/50 rounded-xl text-emerald-400 text-sm font-medium">
            {success}
            <p className="text-xs text-emerald-500/70 mt-1">Redirigiendo al login en 5 segundos...</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre Completo</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              placeholder="Ej. Juan Pérez"
              disabled={loading || !!success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Teléfono</label>
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              placeholder="Ej. 123456789"
              disabled={loading || !!success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Correo Electrónico</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              placeholder="tu@correo.com"
              disabled={loading || !!success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              disabled={loading || !!success}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              'Registrarse'
            )}
          </button>

          <p className="text-center text-sm text-slate-400 mt-6">
            ¿Ya tienes una cuenta?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Inicia Sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
