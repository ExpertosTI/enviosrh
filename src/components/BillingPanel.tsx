import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { exportToCsv } from '../lib/export';

interface BillingSummary {
  period: { from: string; to: string };
  totals: { deliveries: number; fees: number; sales: number };
  messenger_commissions: { id: string; name: string; deliveries: number; fees: number; commission: number }[];
  commission_rate: number;
}

export function BillingPanel() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<BillingSummary | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api.get<BillingSummary>(`/billing/summary?from=${from}&to=${to}`).then(setData).catch(() => setData(null));
  }, [from, to]);

  async function closePeriod() {
    setClosing(true);
    try {
      await api.post('/billing/close', { from, to });
      api.get<BillingSummary>(`/billing/summary?from=${from}&to=${to}`).then(setData);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="card p-4 flex flex-col gap-3 mb-4">
      <div className="card-title mb-0">Facturación y comisiones</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className="input text-xs" value={from} onChange={e => setFrom(e.target.value)} aria-label="Desde" />
        <input type="date" className="input text-xs" value={to} onChange={e => setTo(e.target.value)} aria-label="Hasta" />
      </div>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-[#0b0b14]"><div className="text-lg font-black text-[#e8e8f4]">{data.totals.deliveries}</div><div className="text-[9px] text-[#6b6b8a]">Envíos</div></div>
            <div className="p-2 rounded-xl bg-[#0b0b14]"><div className="text-lg font-black text-[#22c55e]">RD${data.totals.fees.toFixed(0)}</div><div className="text-[9px] text-[#6b6b8a]">Tarifas</div></div>
            <div className="p-2 rounded-xl bg-[#0b0b14]"><div className="text-lg font-black text-[#5b8af9]">RD${data.totals.sales.toFixed(0)}</div><div className="text-[9px] text-[#6b6b8a]">Ventas</div></div>
          </div>
          <div className="text-[10px] text-[#6b6b8a]">Comisión mensajero: {(data.commission_rate * 100).toFixed(0)}%</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {data.messenger_commissions.filter(m => m.deliveries > 0).map(m => (
              <div key={m.id} className="flex justify-between text-xs py-1 border-b border-[#252540]/50">
                <span className="text-[#e8e8f4]">{m.name}</span>
                <span className="text-[#22c55e] font-bold">RD${m.commission.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportToCsv(`comisiones-${from}.csv`, data.messenger_commissions)} className="btn btn-ghost btn-sm text-xs flex-1">Exportar CSV</button>
            <button type="button" onClick={closePeriod} disabled={closing} className="btn-primary text-xs flex-1">{closing ? 'Cerrando…' : 'Cerrar período'}</button>
          </div>
        </>
      )}
    </div>
  );
}
