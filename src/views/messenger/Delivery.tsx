import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery } from '../../types';
import { STATE_LABEL, STATE_COLOR } from '../../types';
import { IconBack, IconMap, IconMotorbike, IconCheck, IconNavigate } from '../../components/Icons';

export function MessengerDelivery() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Delivery>(`/deliveries/${id}`)
      .then(setDelivery)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id]);

  async function markInTransit() {
    if (!id) return;
    setWorking(true);
    try {
      await api.patch(`/deliveries/${id}/in-transit`);
      setDelivery((d) => d ? { ...d, state: 'in_transit' } : d);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setWorking(false);
    }
  }

  if (!delivery) {
    return <div className="spinner">{error || 'Cargando…'}</div>;
  }

  const state = delivery.state as keyof typeof STATE_LABEL;
  const address = delivery.address_override ?? delivery.customer_address ?? '';
  const q = encodeURIComponent(
    delivery.location_link && delivery.location_link.startsWith('http')
      ? delivery.location_link
      : address
  );
  const navGoogle = delivery.location_link?.startsWith('http')
    ? delivery.location_link
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
  const navWaze = `https://waze.com/ul?q=${q}&navigate=yes`;

  return (
    <div className="shell">
      <div className="shell__header">
        <button className="back-btn" onClick={() => nav('/mensajero')} aria-label="Volver">
          <IconBack size={20} />
        </button>
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
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{delivery.customer_name}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{address}</div>
          {delivery.customer_reference && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
              <IconNavigate size={14} /> {delivery.customer_reference}
            </div>
          )}
          {delivery.delivery_fee > 0 && (
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 16 }}>
              Cobrar: ${delivery.delivery_fee.toFixed(2)}
            </div>
          )}
          {delivery.notes && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, fontSize: 13, color: 'var(--text-2)' }}>
              {delivery.notes}
            </div>
          )}
        </div>

        {/* Navegación */}
        <div className="card">
          <div className="card__title">Navegar</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={navGoogle} target="_blank" rel="noopener noreferrer" className="btn btn--primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <IconMap size={18} /> Google Maps
            </a>
            <a href={navWaze} target="_blank" rel="noopener noreferrer" className="btn btn--ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <IconMap size={18} /> Waze
            </a>
          </div>
        </div>

        {/* Acciones */}
        {state === 'assigned' && (
          <button
            className="btn btn--primary"
            onClick={markInTransit}
            disabled={working}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <IconMotorbike size={20} />
            {working ? 'Procesando…' : 'Iniciar entrega'}
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
            <button
              className="btn btn--success"
              onClick={markDelivered}
              disabled={working}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              <IconCheck size={20} />
              {working ? 'Procesando…' : 'Marcar como entregado'}
            </button>
          </div>
        )}

        {state === 'delivered' && (
          <div className="banner banner--success" style={{ textAlign: 'center', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <IconCheck size={20} color="var(--success)" /> Entrega confirmada
          </div>
        )}
      </div>
    </div>
  );
}
