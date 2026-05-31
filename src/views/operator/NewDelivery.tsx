import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Messenger } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconMotorbike, IconPackage, IconUser, IconMap } from '../../components/Icons';

interface Form {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_reference: string;
  location_link: string;
  delivery_fee: string;
  notes: string;
  messenger_id: string;
}

const EMPTY: Form = {
  customer_name: '', customer_phone: '', customer_address: '',
  customer_reference: '', location_link: '', delivery_fee: '',
  notes: '', messenger_id: '',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a]">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#6b6b8a]">{hint}</p>}
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#252540]">
      <div className="w-7 h-7 rounded-lg bg-[#5b8af9]/15 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="text-sm font-bold text-[#e8e8f4]">{title}</span>
    </div>
  );
}

export function NewDelivery() {
  const nav = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Messenger[]>('/messengers').then(setMessengers).catch(() => {});
  }, []);

  function set(k: keyof Form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_phone) { setError('El teléfono del cliente es requerido'); return; }
    setError(''); setSaving(true);
    try {
      const body = {
        customer: {
          name: form.customer_name || undefined,
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

  const inputCls = 'w-full bg-[#13131f] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none transition-all placeholder:text-[#6b6b8a] focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30';

  return (
    <AppShell>
      <PageHeader title="Nuevo envío" back="/operador" />

      <form onSubmit={handleSubmit} className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-5 pb-10">
        {error && <div className="banner-error">{error}</div>}

        {/* Cliente */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <SectionHead icon={<IconUser size={16} color="#5b8af9" />} title="Datos del cliente" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre">
              <input className={inputCls} value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Nombre completo" autoComplete="off" />
            </Field>
            <Field label="Teléfono *">
              <input className={inputCls} type="tel" value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="809-000-0000" required autoComplete="off" />
            </Field>
            <Field label="Dirección" >
              <input className={inputCls} value={form.customer_address} onChange={(e) => set('customer_address', e.target.value)} placeholder="Calle, número, sector" />
            </Field>
            <Field label="Referencia">
              <input className={inputCls} value={form.customer_reference} onChange={(e) => set('customer_reference', e.target.value)} placeholder="Punto de referencia" />
            </Field>
          </div>
        </div>

        {/* Envío */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <SectionHead icon={<IconPackage size={16} color="#5b8af9" />} title="Detalles del envío" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Link de ubicación" hint="Pega un link de Google Maps o WhatsApp">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a]">
                  <IconMap size={16} />
                </span>
                <input className={inputCls + ' !pl-9'} type="url" value={form.location_link} onChange={(e) => set('location_link', e.target.value)} placeholder="https://maps.app.goo.gl/…" />
              </div>
            </Field>
            <Field label="Costo de envío ($)">
              <input className={inputCls} type="number" min="0" step="0.01" value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Notas internas" >
              <textarea className={inputCls + ' resize-none min-h-[80px] md:col-span-2'} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Instrucciones especiales…" rows={3} />
            </Field>
          </div>
        </div>

        {/* Mensajero */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <SectionHead icon={<IconMotorbike size={16} color="#5b8af9" />} title="Asignar mensajero" />
          {messengers.length === 0 ? (
            <p className="text-sm text-[#6b6b8a]">No hay mensajeros disponibles</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Opción "sin asignar" */}
              <label className={[
                'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                form.messenger_id === ''
                  ? 'border-[#5b8af9] bg-[#5b8af9]/10'
                  : 'border-[#252540] hover:border-[#5b8af9]/40',
              ].join(' ')}>
                <input type="radio" className="hidden" value="" checked={form.messenger_id === ''} onChange={() => set('messenger_id', '')} />
                <div className="w-8 h-8 rounded-full bg-[#252540] flex items-center justify-center shrink-0">
                  <IconMotorbike size={16} color="#6b6b8a" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[#e8e8f4]">Sin asignar</div>
                  <div className="text-[10px] text-[#6b6b8a]">Asignar luego</div>
                </div>
              </label>
              {messengers.filter((m) => m.active).map((m) => (
                <label key={m.id} className={[
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                  form.messenger_id === m.id
                    ? 'border-[#5b8af9] bg-[#5b8af9]/10'
                    : 'border-[#252540] hover:border-[#5b8af9]/40',
                ].join(' ')}>
                  <input type="radio" className="hidden" value={m.id} checked={form.messenger_id === m.id} onChange={() => set('messenger_id', m.id)} />
                  <div className="w-8 h-8 rounded-full bg-[#5b8af9]/20 flex items-center justify-center shrink-0 font-bold text-[#5b8af9] text-xs">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#e8e8f4] truncate">{m.name}</div>
                    <div className="text-[10px] text-[#6b6b8a] truncate">{m.phone}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#5b8af9] text-white font-semibold text-sm hover:bg-[#3a68e0] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Creando envío…
            </>
          ) : (
            <><IconPackage size={18} /> Crear envío</>
          )}
        </button>
      </form>
    </AppShell>
  );
}
