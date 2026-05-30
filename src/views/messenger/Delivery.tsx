import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery } from '../../types';
import { STATE_LABEL, STATE_COLOR } from '../../types';

interface NavData {
  id: string;
  state: string;
  delivery_fee: number;
  customer: { name: string; phone: string; address: string; reference: string | null };
  notes: string | null;
  nav_google: string;
  nav_waze: string;
}

export function MessengerDelivery() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<NavData | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<Delivery[]>('/deliveries').then((all) => all.find((d) => d.id === id) ?? null),
    ])
      .then(([d]) => {
        setDelivery(d);
        // Construir nav_data desde la entrega
        if (d) {
          const address = d.address_override ?? d.customer_address ?? '';
          const q = encodeURIComponent(address);
          setData({
            id: d.id,
            state: d.state,
            delivery_fee: d.delivery_fee,
            customer: {
              name: d.customer_name,
              phone: d.customer_phone,
              address,
              reference: d.customer_reference ?? null,
            },
            notes: d.notes,
            nav_google: `https://www.google.com/maps/search/?api=1&query=${q}`,
            nav_waze: `https://waze.com/ul?q=${q}&navigate=yes`,
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id]);

  async function markInTransit() {
    if (!id) return;
    setWorking(true);
    try {
      await api.patch(`/deliveries/${id}/in-transit`);
      setDelivery((d) => d ? { ...d, state: 'in_transit' } : d);
      setData((d) => d ? { ...d, state: 'in_transit' } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setWorking(false);
    }
  }

  async function markDelivered() {
    if (!id) return;
    setWorking(true);
    try {
      await api.patch(`/deliveries/${id}/deliver`, { messenger_note: note || undefined });
      setDelivery((d) => d ? { ...d, state: 'delivered' } : d);
      setData((d) => d ? { ...d, state: 'delivered' } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setWorking(false);
    }
  }

  if (!data || !delivery) {
    return <div className="spinner">{error || 'Cargando…'}</div>;
  }

  const state = delivery.state as keyof typeof STATE_LABEL;

  return (
    <div className="shell">
      <div className="shell__header">
        <button className="back-btn" onClick={() => nav('/mensajero')}>‹</button>
        Envío
        <span
          className={`badge badge--${state}`}
          style={{ marginLeft: 'auto', color: STATE_COLOR[state] }}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="shell__scroll">
        {error && <div className="banner banner--error">{error}</div>}

        {/* Cliente */}
        <div className="card">
          <div className="card__title">Destino</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{data.customer.name}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{data.customer.address}</div>
          {data.customer.reference && (
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>📍 {data.customer.reference}</div>
          )}
          {data.delivery_fee > 0 && (
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 16 }}>
              Cobrar: ${data.delivery_fee.toFixed(2)}
            </div>
          )}
          {data.notes && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, fontSize: 13 }}>
              📝 {data.notes}
            </div>
          )}
        </div>

        {/* Navegación */}
        <div className="card">
          <div className="card__title">Navegar</div>
          <div className="nav-actions">
            <a
              href={data.nav_google}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary"
            >
              🗺 Google Maps
            </a>
            <a
              href={data.nav_waze}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost"
            >
              🚗 Waze
            </a>
          </div>
        </div>

        {/* Acciones */}
        {state === 'assigned' && (
          <button className="btn btn--primary" onClick={markInTransit} disabled={working}>
            {working ? 'Procesando…' : '🛵 Iniciar entrega'}
          </button>
        )}

        {state === 'in_transit' && (
          <div className="card">
            <div className="card__title">Confirmar entrega</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Nota (opcional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Se entregó a familiar…"
              />
            </div>
            <button className="btn btn--success" onClick={markDelivered} disabled={working}>
              {working ? 'Procesando…' : '✓ Marcar como entregado'}
            </button>
          </div>
        )}

        {state === 'delivered' && (
          <div className="banner banner--success" style={{ textAlign: 'center', padding: 20 }}>
            ✓ Entrega confirmada
          </div>
        )}
      </div>
    </div>
  );
}
