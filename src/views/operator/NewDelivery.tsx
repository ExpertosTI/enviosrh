import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Messenger } from '../../types';

interface NewDeliveryForm {
  // Cliente
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_reference: string;
  // Envío
  location_link: string;
  delivery_fee: string;
  notes: string;
  messenger_id: string;
}

const EMPTY: NewDeliveryForm = {
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  customer_reference: '',
  location_link: '',
  delivery_fee: '',
  notes: '',
  messenger_id: '',
};

export function NewDelivery() {
  const nav = useNavigate();
  const [form, setForm] = useState<NewDeliveryForm>(EMPTY);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Messenger[]>('/messengers').then(setMessengers).catch(() => {});
  }, []);

  function set(k: keyof NewDeliveryForm, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_phone) { setError('Teléfono del cliente es requerido'); return; }
    setError('');
    setSaving(true);
    try {
      const body = {
        customer: {
          name: form.customer_name,
          phone: form.customer_phone,
          address: form.customer_address || undefined,
          reference: form.customer_reference || undefined,
        },
        location_link: form.location_link || undefined,
        delivery_fee: form.delivery_fee ? Number(form.delivery_fee) : 0,
        notes: form.notes || undefined,
        messenger_id: form.messenger_id || undefined,
      };
      const { id } = await api.post<{ id: string }>('/deliveries', body);
      nav(`/operador/envio/${id}/compartir`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <div className="shell__header">
        <button className="back-btn" onClick={() => nav('/operador')}>‹</button>
        Nuevo envío
      </div>

      <form className="shell__scroll" onSubmit={handleSubmit}>
        {error && <div className="banner banner--error">{error}</div>}

        <div className="card">
          <div className="card__title">Cliente</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Nombre</label>
              <input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} required />
            </div>
            <div className="field">
              <label>Teléfono *</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => set('customer_phone', e.target.value)}
                placeholder="10 dígitos"
                required
              />
            </div>
            <div className="field">
              <label>Dirección</label>
              <input value={form.customer_address} onChange={(e) => set('customer_address', e.target.value)} />
            </div>
            <div className="field">
              <label>Referencia</label>
              <input value={form.customer_reference} onChange={(e) => set('customer_reference', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__title">Envío</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Link de ubicación (Google Maps / WhatsApp)</label>
              <input
                type="url"
                value={form.location_link}
                onChange={(e) => set('location_link', e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>
            <div className="field">
              <label>Costo de envío ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.delivery_fee}
                onChange={(e) => set('delivery_fee', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label>Notas internas</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__title">Mensajero</div>
          <div className="field">
            <label>Asignar mensajero (opcional)</label>
            <select value={form.messenger_id} onChange={(e) => set('messenger_id', e.target.value)}>
              <option value="">— Sin asignar (borrador) —</option>
              {messengers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Crear envío'}
        </button>
      </form>
    </div>
  );
}
