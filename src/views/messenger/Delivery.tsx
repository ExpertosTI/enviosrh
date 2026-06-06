import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Delivery, DeliveryState } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconMap, IconMotorbike, IconCheck, IconNavigate, IconPackage } from '../../components/Icons';

function NavBtn({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[.97]"
      style={{ background: color + '20', color }}
    >
      {icon}{label}
    </a>
  );
}

export function MessengerDelivery() {
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Delivery>(`/deliveries/${id}`)
      .then(setDelivery)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id]);

  async function markInTransit() {
    if (!id) return;
    setLoading(true); setError('');
    try {
      await api.patch(`/deliveries/${id}/in-transit`);
      setDelivery((p) => p ? { ...p, state: 'in_transit' as DeliveryState } : p);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function markDelivered() {
    if (!id) return;
    setLoading(true); setError('');
    try {
      await api.patch(`/deliveries/${id}/deliver`, { note: note || undefined });
      setDelivery((p) => p ? { ...p, state: 'delivered' as DeliveryState } : p);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  if (!delivery) {
    return (
      <AppShell>
        {error ? <div className="p-6"><div className="banner-error">{error}</div></div> : <div className="spinner" />}
      </AppShell>
    );
  }

  const gpsCoords = delivery.location_link?.match(/[-\d.]+,[-\d.]+/)?.[0];
  const mapsUrl = delivery.location_link?.startsWith('http')
    ? delivery.location_link
    : gpsCoords ? `https://www.google.com/maps/search/?api=1&query=${gpsCoords}` : null;
  const wazeUrl = gpsCoords ? `https://waze.com/ul?ll=${gpsCoords}&navigate=yes` : null;

  const isAssigned  = delivery.state === 'assigned';
  const isInTransit = delivery.state === 'in_transit';
  const isDelivered = delivery.state === 'delivered';

  return (
    <AppShell>
      <PageHeader title="Detalle del envío" back="/mensajero" />

      <div className="p-4 md:p-6 max-w-lg mx-auto flex flex-col gap-5 pb-10">
        {error && <div className="banner-error">{error}</div>}

        {/* Card principal */}
        <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#5b8af9]/15 flex items-center justify-center">
              <IconPackage size={20} color="#5b8af9" />
            </div>
            <div>
              <div className="font-bold text-[#e8e8f4]">{delivery.customer_name ?? 'Cliente'}</div>
              {delivery.customer_phone && (
                <a href={`tel:${delivery.customer_phone}`} className="text-xs text-[#5b8af9] hover:underline">
                  {delivery.customer_phone}
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {(delivery.customer_address ?? delivery.address_override) && (
              <div className="p-3 bg-[#0b0b14] rounded-xl">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide mb-1">Dirección</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.customer_address ?? delivery.address_override}</div>
              </div>
            )}
            {delivery.customer_reference && (
              <div className="p-3 bg-[#0b0b14] rounded-xl">
                <div className="text-[10px] text-[#6b6b8a] uppercase tracking-wide mb-1">Referencia</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.customer_reference}</div>
              </div>
            )}
            {delivery.notes && (
              <div className="p-3 bg-[#2a1800]/40 rounded-xl border border-[#f59e0b]/20">
                <div className="text-[10px] text-[#f59e0b] uppercase tracking-wide mb-1">Notas del operador</div>
                <div className="text-sm text-[#e8e8f4]">{delivery.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Navegación */}
        {(mapsUrl || wazeUrl) && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6b6b8a] font-semibold uppercase tracking-wide px-1">Navegación</div>
            <div className="flex gap-2">
              {mapsUrl && <NavBtn href={mapsUrl} icon={<IconMap size={16} />} label="Google Maps" color="#4285F4" />}
              {wazeUrl && <NavBtn href={wazeUrl} icon={<IconNavigate size={16} />} label="Waze" color="#35CAED" />}
            </div>
          </div>
        )}

        {/* Acciones */}
        {isAssigned && (
          <button
            onClick={markInTransit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#f59e0b]/15 text-[#f59e0b] font-bold text-base hover:bg-[#f59e0b]/25 active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer"
          >
            <IconMotorbike size={20} />
            {loading ? 'Actualizando…' : 'Salir a entregar'}
          </button>
        )}

        {isInTransit && (
          <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-5 flex flex-col gap-4">
            <div className="text-sm font-bold text-[#e8e8f4]">Confirmar entrega</div>
            <textarea
              className="w-full bg-[#0b0b14] border border-[#252540] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/30 resize-none placeholder:text-[#6b6b8a]"
              placeholder="Nota de entrega (opcional)…"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              onClick={markDelivered}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#22c55e]/15 text-[#22c55e] font-bold text-base hover:bg-[#22c55e]/25 active:scale-[.98] transition-all disabled:opacity-40 border-0 cursor-pointer"
            >
              <IconCheck size={20} />
              {loading ? 'Marcando…' : 'Marcar como entregado'}
            </button>
          </div>
        )}

        {isDelivered && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="w-14 h-14 rounded-2xl bg-[#22c55e]/15 flex items-center justify-center">
              <IconCheck size={28} color="#22c55e" />
            </div>
            <div className="font-bold text-[#22c55e]">¡Entregado!</div>
            {delivery.delivery_note && (
              <div className="text-xs text-[#6b6b8a] text-center">{delivery.delivery_note}</div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
