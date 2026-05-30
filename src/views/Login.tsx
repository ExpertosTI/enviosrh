import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { saveSession } from '../lib/auth';
import type { User } from '../types';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.post<{ token: string; user: User }>(
        '/auth/login',
        { email, password },
      );
      saveSession(token, user);
      nav(user.role === 'messenger' ? '/mensajero' : '/operador');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="logo">EnvíosRH</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <h2 style={{ textAlign: 'center', fontSize: 18 }}>Iniciar sesión</h2>
        {error && <div className="banner banner--error">{error}</div>}
        <div className="field">
          <label>Correo</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
