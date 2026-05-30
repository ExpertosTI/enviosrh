import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../../lib/api';

interface TrackingData {
  state: string;
  customer_name: string;
  messenger_name: string | null;
  delivery_fee: number;
  assigned_at: string | null;
  delivered_at: string | null;
  customer_confirmed: boolean;
  rated: boolean;
}

const STATE_EMOJI: Record<string, string> = {
  draft:      '📝',
  assigned:   '🛵',
  in_transit: '🚚',
  delivered:  '✅',
  cancelled:  '❌',
};
const STATE_ES: Record<string, string> = {
  draft:      'Preparando tu pedido',
  assigned:   'Mensajero asignado',
  in_transit: 'En camino a ti',
  delivered:  '¡Entregado!',
  cancelled:  'Cancelado',
};

export function CustomerTracking() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [ratingSent, setRatingSent] = useState(false);
  const [ratingError, setRatingError] = useState('');

  useEffect(() => {
    if (!token) return;
    publicApi
      .get<TrackingData>(`/p/c/${token}`)
      .then((d) => {
        setData(d);
        setConfirmDone(d.customer_confirmed);
        setRatingSent(d.rated);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No encontrado'));
  }, [token]);

  async function handleConfirm() {
    if (!token) return;
    setConfirming(true);
    try {
      await publicApi.post(`/p/c/${token}/confirm`);
      setConfirmDone(true);
      setData((d) => d ? { ...d, customer_confirmed: true } : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setConfirming(false);
    }
  }

  async function handleRate() {
    if (!token || rating === 0) return;
    setRatingError('');
    try {
      await publicApi.post(`/p/c/${token}/rate`, { rating, note: ratingNote || undefined });
      setRatingSent(true);
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : 'Error al enviar calificación');
    }
  }

  if (error) {
    return (
      <div className="portal">
        <div className="portal__logo">EnvíosRH</div>
        <div className="banner banner--error" style={{ width: '100%' }}>{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="spinner">Cargando seguimiento…</div>;
  }

  return (
    <div className="portal">
      <div className="portal__logo">EnvíosRH</div>

      <div className="status-icon">{STATE_EMOJI[data.state] ?? '📦'}</div>

      <div className="status-card">
        <div className="status-card__title">{STATE_ES[data.state] ?? data.state}</div>
        <div className="status-card__sub">Hola, {data.customer_name}</div>
        {data.messenger_name && (
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-2)' }}>
            Mensajero: <strong>{data.messenger_name}</strong>
          </div>
        )}
        {data.delivery_fee > 0 && (
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            Costo: ${data.delivery_fee.toFixed(2)}
          </div>
        )}
      </div>

      {/* Progreso visual */}
      <Steps state={data.state} />

      {/* Confirmar recepción */}
      {data.state === 'delivered' && !confirmDone && (
        <div style={{ width: '100%' }}>
          <button className="btn btn--success" onClick={handleConfirm} disabled={confirming}>
            {confirming ? 'Confirmando…' : '✓ Confirmar que recibí mi pedido'}
          </button>
        </div>
      )}

      {confirmDone && (
        <div className="banner banner--success" style={{ width: '100%', textAlign: 'center' }}>
          ✓ Recepción confirmada. ¡Gracias!
        </div>
      )}

      {/* Calificar */}
      {confirmDone && !ratingSent && (
        <div className="card" style={{ width: '100%' }}>
          <div className="card__title">¿Cómo fue tu experiencia?</div>
          <div className="stars">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className={`star${rating >= s ? ' star--active' : ''}`}
                onClick={() => setRating(s)}
              >
                ⭐
              </span>
            ))}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <textarea
              placeholder="Comentario (opcional)"
              value={ratingNote}
              onChange={(e) => setRatingNote(e.target.value)}
            />
          </div>
          {ratingError && <div className="banner banner--error" style={{ marginTop: 8 }}>{ratingError}</div>}
          <button
            className="btn btn--primary"
            style={{ marginTop: 12 }}
            disabled={rating === 0}
            onClick={handleRate}
          >
            Enviar calificación
          </button>
        </div>
      )}

      {ratingSent && (
        <div className="banner banner--success" style={{ width: '100%', textAlign: 'center' }}>
          ⭐ ¡Gracias por calificar!
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { key: 'assigned',   label: 'Asignado' },
  { key: 'in_transit', label: 'En ruta' },
  { key: 'delivered',  label: 'Entregado' },
];
const STEP_ORDER = ['draft', 'assigned', 'in_transit', 'delivered'];

function Steps({ state }: { state: string }) {
  const current = STEP_ORDER.indexOf(state);
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0 }}>
      {STEPS.map((s, i) => {
        const idx = STEP_ORDER.indexOf(s.key);
        const done = current >= idx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? 'var(--success)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, transition: 'background .3s',
              }}>
                {done ? '✓' : ''}
              </div>
              <div style={{ fontSize: 11, color: done ? 'var(--success)' : 'var(--text-2)', marginTop: 4 }}>
                {s.label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ height: 2, flex: 1, background: current > idx ? 'var(--success)' : 'var(--border)', transition: 'background .3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
