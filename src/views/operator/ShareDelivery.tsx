import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ShareData, Delivery, Messenger } from '../../types';
import { STATE_LABEL, STATE_COLOR } from '../../types';

export function ShareDelivery() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [share, setShare] = useState<ShareData | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [selMessenger, setSelMessenger] = useState('');
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<ShareData>(`/deliveries/${id}/share`),
      api.get<Delivery[]>('/deliveries').then((all) => all.find((d) => d.id === id) ?? null),
      api.get<Messenger[]>('/messengers'),
    ])
      .then(([s, d, m]) => {
        setShare(s);
        setDelivery(d);
        setMessengers(m);
        setSelMessenger(d?.messenger_id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id]);

  async function handleAssign() {
    if (!selMessenger || !id) return;
    setAssigning(true);
    try {
      await api.patch(`/deliveries/${id}/assign`, { messenger_id: selMessenger });
      const s = await api.get<ShareData>(`/deliveries/${id}/share`);
      setShare(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setAssigning(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    if (!confirm('¿Cancelar este envío?')) return;
    setCancelling(true);
    try {
      await api.patch(`/deliveries/${id}/cancel`);
      nav('/operador');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCancelling(false);
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
  }

  if (!share || !delivery) {
    return <div className="spinner">{error || 'Cargando…'}</div>;
  }

  const isClosed = delivery.state === 'delivered' || delivery.state === 'cancelled';

  return (
    <div className="shell">
      <div className="shell__header">
        <button className="back-btn" onClick={() => nav('/operador')}>‹</button>
        Detalle del envío
      </div>
      <div className="shell__scroll">
        {error && <div className="banner banner--error">{error}</div>}

        {/* Estado */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>Estado</div>
          <span
            className={`badge badge--${delivery.state}`}
            style={{ fontSize: 15, padding: '6px 18px', color: STATE_COLOR[delivery.state] }}
          >
            {STATE_LABEL[delivery.state]}
          </span>
        </div>

        {/* Cliente */}
        <div className="card">
          <div className="card__title">Cliente</div>
          <Row label="Nombre" value={delivery.customer_name} />
          <Row label="Teléfono" value={delivery.customer_phone} />
          {delivery.customer_address && <Row label="Dirección" value={delivery.customer_address} />}
          {delivery.delivery_fee > 0 && (
            <Row label="Costo de envío" value={`$${delivery.delivery_fee.toFixed(2)}`} />
          )}
        </div>

        {/* Asignación */}
        {!isClosed && (
          <div className="card">
            <div className="card__title">Mensajero</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 15 }}
                value={selMessenger}
                onChange={(e) => setSelMessenger(e.target.value)}
              >
                <option value="">— Sin asignar —</option>
                {messengers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button className="btn btn--primary btn--sm" onClick={handleAssign} disabled={assigning || !selMessenger}>
                {assigning ? '…' : 'Asignar'}
              </button>
            </div>
          </div>
        )}

        {/* WhatsApp links */}
        <div className="card">
          <div className="card__title">Compartir por WhatsApp</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {share.whatsapp_messenger && (
              <a
                href={share.whatsapp_messenger}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--wa"
              >
                📲 Enviar datos al mensajero
              </a>
            )}
            {share.whatsapp_customer && (
              <a
                href={share.whatsapp_customer}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--wa"
              >
                📦 Enviar seguimiento al cliente
              </a>
            )}
          </div>
        </div>

        {/* Links directos */}
        <div className="card">
          <div className="card__title">Links de seguimiento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LinkCopy label="Link del cliente" url={share.customer_token_url} onCopy={copyLink} />
            {share.messenger_token_url && (
              <LinkCopy label="Link del mensajero" url={share.messenger_token_url} onCopy={copyLink} />
            )}
          </div>
        </div>

        {/* Acciones */}
        {!isClosed && (
          <button className="btn btn--danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelando…' : 'Cancelar envío'}
          </button>
        )}

        {/* Calificación */}
        {delivery.rating && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card__title">Calificación del cliente</div>
            <div style={{ fontSize: 24 }}>{'⭐'.repeat(delivery.rating)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function LinkCopy({ label, url, onCopy }: { label: string; url: string; onCopy: (u: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => { onCopy(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      >
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
}
