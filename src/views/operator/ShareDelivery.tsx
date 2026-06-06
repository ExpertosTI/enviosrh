import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState, ShareData, Messenger } from '../../types';
import { STATE_LABEL } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import {
  IconWhatsApp, IconCopy, IconCheck, IconUser, IconMotorbike, IconPackage, IconMap, IconStar,
} from '../../components/Icons';

const BADGE_BG: Record<DeliveryState, string> = {
  draft:      'bg-[#1a1a30] text-[#6b6b8a]',
  assigned:   'bg-[#0f2040] text-[#7caeff]',
  in_transit: 'bg-[#2a1800] text-[#f59e0b]',
  delivered:  'bg-[#0a2a18] text-[#22c55e]',
  cancelled:  'bg-[#2a0a0a] text-[#ef4444]',
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className={[
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer transition-all',
        copied
          ? 'bg-[#22c55e]/15 text-[#22c55e]'
          : 'bg-[#252540] text-[#6b6b8a] hover:text-[#e8e8f4] hover:bg-[#2f2f50]',
      ].join(' ')}
    >
      {copied ? <><IconCheck size={13} /> Copiado!</> : <><IconCopy size={13} /> {label}</>}
    </button>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-[#252540] flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide">{label}</div>
        <div className="text-sm text-[#e8e8f4] mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <IconStar key={s} size={16} color={s <= rating ? '#f59e0b' : '#252540'} />
      ))}
    </div>
  );
}

export function ShareDelivery() {
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [selectedMsn, setSelectedMsn] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, s, ms] = await Promise.all([
        api.get<Delivery>(`/deliveries/${id}`),
        api.get<ShareData>(`/deliveries/${id}/share`),
        api.get<Messenger[]>('/messengers'),
      ]);
      setDelivery(d);
      setShare(s);
      setMessengers(ms);
      setSelectedMsn(d.messenger_id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign() {
    if (!id) return;
    setAssigning(true); setError(''); setSuccess('');
    try {
      await api.patch(`/deliveries/${id}/assign`, { messenger_id: selectedMsn || null });
      setSuccess(selectedMsn ? 'Mensajero asignado' : 'Mensajero removido');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally { setAssigning(false); }
  }

  async function handleCancel() {
    if (!id) return;
    const note = prompt('Motivo de la cancelación (opcional):');
    if (note === null) return; // Cancelado por el usuario
    setCancelling(true); setError('');
    try {
      await api.patch(`/deliveries/${id}/cancel`, { note: note || undefined });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally { setCancelling(false); }
  }

  if (!delivery || !share) {
    return (
      <AppShell>
        {error ? (
          <div className="p-6"><div className="banner-error">{error}</div></div>
        ) : (
          <div className="spinner" />
        )}
      </AppShell>
    );
  }

  const waLink = share.whatsapp_customer;
  const portalUrl = share.customer_token_url;
  const isCancelled = delivery.state === 'cancelled';

  return (
    <AppShell>
      <PageHeader title="Detalle del envío" back="/operador" />

      <div className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-5 pb-10">
        {error && <div className="banner-error">{error}</div>}
        {success && <div className="banner-success">{success}</div>}

        {/* Estado + cliente */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#5b8af9]/15 flex items-center justify-center">
              <IconPackage size={20} color="#5b8af9" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#e8e8f4]">{delivery.customer_name ?? 'Cliente'}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE_BG[delivery.state as DeliveryState]}`}>
                  {STATE_LABEL[delivery.state as DeliveryState]}
                </span>
              </div>
              <div className="text-xs text-[#6b6b8a] mt-0.5">#{delivery.id.slice(0,8).toUpperCase()}</div>
            </div>
            {delivery.rating && (
              <div className="shrink-0">
                <Stars rating={delivery.rating} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <InfoRow icon={<IconUser size={15} color="#6b6b8a" />} label="Teléfono" value={delivery.customer_phone} />
            <InfoRow icon={<IconPackage size={15} color="#6b6b8a" />} label="Dirección" value={delivery.customer_address ?? delivery.address_override} />
            {delivery.customer_reference && (
              <InfoRow icon={<IconMap size={15} color="#6b6b8a" />} label="Referencia" value={delivery.customer_reference} />
            )}
            {delivery.notes && (
              <InfoRow icon={<IconPackage size={15} color="#6b6b8a" />} label="Notas" value={delivery.notes} />
            )}
            {Number(delivery.delivery_fee) > 0 && (
              <InfoRow icon={<IconPackage size={15} color="#6b6b8a" />} label="Costo envío" value={`$${Number(delivery.delivery_fee).toFixed(2)}`} />
            )}
          </div>
        </div>

        {/* Links de portal */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#252540]">
            <IconWhatsApp size={18} color="#25D366" />
            <span className="text-sm font-bold text-[#e8e8f4]">Compartir con cliente</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366]/15 text-[#25D366] text-sm font-semibold hover:bg-[#25D366]/25 transition-colors">
                <IconWhatsApp size={16} /> Enviar por WhatsApp
              </a>
            )}
            {portalUrl && <CopyButton text={portalUrl} label="Copiar link" />}
          </div>
          {portalUrl && (
            <div className="mt-3 p-3 bg-[#0b0b14] rounded-lg">
              <div className="text-[10px] text-[#6b6b8a] mb-1">Link de seguimiento</div>
              <div className="text-xs text-[#5b8af9] break-all">{portalUrl}</div>
            </div>
          )}
        </div>

        {/* Asignar mensajero */}
        {!isCancelled && (
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#252540]">
              <IconMotorbike size={18} color="#5b8af9" />
              <span className="text-sm font-bold text-[#e8e8f4]">Mensajero</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedMsn}
                onChange={(e) => setSelectedMsn(e.target.value)}
                aria-label="Seleccionar mensajero"
                className="flex-1 bg-[#13131f] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none focus:border-[#5b8af9] focus:ring-1 focus:ring-[#5b8af9]/30"
              >
                <option value="">— Sin asignar —</option>
                {messengers.filter((m) => m.active).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} – {m.phone}</option>
                ))}
              </select>
              <button
                onClick={handleAssign}
                disabled={assigning}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#5b8af9] text-white text-sm font-semibold hover:bg-[#3a68e0] disabled:opacity-40 transition-colors border-0 cursor-pointer shrink-0"
              >
                {assigning ? 'Guardando…' : <><IconCheck size={16} /> Asignar</>}
              </button>
            </div>
          </div>
        )}

        {/* Acciones peligrosas */}
        {!isCancelled && (
          <div className="flex justify-end">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-transparent border border-[#ef4444]/40 text-[#ef4444] text-sm font-semibold hover:bg-[#ef4444]/10 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {cancelling ? 'Cancelando…' : 'Cancelar envío'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
