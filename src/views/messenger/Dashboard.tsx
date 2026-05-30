import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { logout, getSession } from '../../lib/auth';
import type { Delivery } from '../../types';
import { STATE_LABEL, STATE_COLOR } from '../../types';

export function MessengerDashboard() {
  const nav = useNavigate();
  const user = getSession()!;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // El mensajero ve solo los suyos; filtramos los activos
      const all = await api.get<Delivery[]>('/deliveries');
      setDeliveries(all.filter((d) => d.state !== 'cancelled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleLogout() {
    logout();
    nav('/login');
  }

  return (
    <div className="shell">
      <div className="shell__header">
        <span style={{ flex: 1 }}>Mis envíos</span>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{user.name}</span>
        <button className="btn btn--ghost btn--sm" onClick={handleLogout}>Salir</button>
      </div>

      <div className="shell__scroll">
        {loading && <div className="spinner">Cargando…</div>}
        {error && <div className="banner banner--error">{error}</div>}
        {!loading && !error && deliveries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-2)', paddingTop: 40 }}>
            No tienes envíos asignados
          </div>
        )}
        {deliveries.map((d) => (
          <Link key={d.id} to={`/mensajero/envio/${d.id}`} className="ditem">
            <div className="ditem__body">
              <div className="ditem__name">{d.customer_name}</div>
              <div className="ditem__sub">{d.customer_address ?? d.address_override ?? '—'}</div>
              <div className="ditem__meta">
                <span
                  className={`badge badge--${d.state}`}
                  style={{ color: STATE_COLOR[d.state] }}
                >
                  {STATE_LABEL[d.state]}
                </span>
                {d.delivery_fee > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    ${d.delivery_fee.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 22 }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
