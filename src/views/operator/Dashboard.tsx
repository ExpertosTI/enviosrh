import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { logout, getSession } from '../../lib/auth';
import type { Delivery, DeliveryState } from '../../types';
import { STATE_LABEL, STATE_COLOR } from '../../types';

const TABS: DeliveryState[] = ['draft', 'assigned', 'in_transit', 'delivered', 'cancelled'];

function fmt(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

export function OperatorDashboard() {
  const nav = useNavigate();
  const user = getSession()!;
  const [tab, setTab] = useState<DeliveryState>('assigned');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.get<Delivery[]>(`/deliveries?state=${tab}`);
      setDeliveries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  function handleLogout() {
    logout();
    nav('/login');
  }

  return (
    <div className="shell">
      <div className="shell__header">
        <span style={{ flex: 1 }}>EnvíosRH</span>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{user.name}</span>
        <button className="btn btn--ghost btn--sm" onClick={handleLogout}>Salir</button>
      </div>

      {/* Tabs de estado */}
      <div style={{ display: 'flex', overflowX: 'auto', background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
        {TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: tab === s ? STATE_COLOR[s] : 'var(--text-2)',
              borderBottom: tab === s ? `2px solid ${STATE_COLOR[s]}` : '2px solid transparent',
            }}
          >
            {STATE_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="shell__scroll">
        {loading && <div className="spinner">Cargando…</div>}
        {error && <div className="banner banner--error">{error}</div>}
        {!loading && !error && deliveries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-2)', paddingTop: 40 }}>
            Sin envíos en este estado
          </div>
        )}
        {deliveries.map((d) => (
          <Link key={d.id} to={`/operador/envio/${d.id}/compartir`} className="ditem">
            <div className="ditem__body">
              <div className="ditem__name">{d.customer_name}</div>
              <div className="ditem__sub">{d.customer_address ?? d.address_override ?? '—'}</div>
              <div className="ditem__meta">
                <span className={`badge badge--${d.state}`}>{STATE_LABEL[d.state]}</span>
                {d.messenger_name && (
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>🛵 {d.messenger_name}</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>
                  {fmt(d.created_at)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="shell__footer">
        <button className="btn btn--primary" onClick={() => nav('/operador/nuevo')}>
          + Nuevo envío
        </button>
      </div>
    </div>
  );
}
