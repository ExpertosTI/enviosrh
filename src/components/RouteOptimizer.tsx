import { useState } from 'react';
import { api } from '../lib/api';
import type { Delivery } from '../types';
import { useGps } from '../lib/GpsContext';
import { useI18n } from '../lib/i18n';

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function RouteOptimizer({ deliveries }: { deliveries: Delivery[] }) {
  const { coords } = useGps();
  const { t } = useI18n();
  const [result, setResult] = useState<{ distance_km?: string; duration_min?: number; stops: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const active = deliveries.filter(d => ['assigned', 'in_transit'].includes(d.state));

  async function optimize() {
    if (!coords || active.length < 2) return;
    setLoading(true);
    try {
      const stops = active.map(d => parseCoords(d.location_link)).filter(Boolean) as [number, number][];
      const res = await api.post<{
        distance_km?: string; duration_min?: number; ordered_stops: [number, number][];
      }>('/route/optimize', { origin: coords, stops });
      setResult({ distance_km: res.distance_km, duration_min: res.duration_min, stops: res.ordered_stops?.length ?? stops.length });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (active.length < 2) return null;

  return (
    <div className="bg-[#16162a] border border-[#252540] rounded-[14px] p-4 flex flex-col gap-2">
      <div className="text-xs font-bold text-[#6b6b8a] uppercase">{t('route.optimize')}</div>
      <p className="text-[11px] text-[#6b6b8a]">{active.length} paradas pendientes</p>
      <button
        onClick={optimize}
        disabled={loading || !coords}
        className="py-2.5 rounded-xl bg-[#5b8af9]/15 text-[#5b8af9] font-bold text-xs border-0 cursor-pointer disabled:opacity-40"
      >
        {loading ? 'Calculando…' : t('route.optimize')}
      </button>
      {result && (
        <div className="text-xs text-[#22c55e] font-semibold">
          {result.duration_min} min · {result.distance_km} km · {result.stops} paradas
        </div>
      )}
    </div>
  );
}
