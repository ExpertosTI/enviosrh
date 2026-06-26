import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import { api } from '../../lib/api';
import { AppShell, PageHeader } from '../../components/AppShell';
import { useI18n } from '../../lib/i18n';

interface Zone {
  id: string;
  name: string;
  polygon: { coordinates: [number, number][] };
  delivery_fee: number;
  color: string;
  active: boolean;
}

export function ZonesManager() {
  const { t } = useI18n();
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('0');
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawLayerRef = useRef<L.Polygon | null>(null);
  const pointsRef = useRef<[number, number][]>([]);

  const load = useCallback(() => {
    api.get<Zone[]>('/zones').then(setZones).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([18.4861, -69.9312], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapRef.current);
    mapRef.current.on('click', (e: L.LeafletMouseEvent) => {
      pointsRef.current.push([e.latlng.lat, e.latlng.lng]);
      if (drawLayerRef.current) mapRef.current?.removeLayer(drawLayerRef.current);
      if (pointsRef.current.length >= 3) {
        drawLayerRef.current = L.polygon(pointsRef.current, { color: '#5b8af9' }).addTo(mapRef.current!);
      }
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  async function saveZone() {
    if (!name.trim() || pointsRef.current.length < 3) return;
    await api.post('/zones', {
      name: name.trim(),
      delivery_fee: Number(fee) || 0,
      polygon: { coordinates: pointsRef.current },
    });
    setName('');
    pointsRef.current = [];
    if (drawLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(drawLayerRef.current);
      drawLayerRef.current = null;
    }
    load();
  }

  return (
    <AppShell>
      <PageHeader title={t('nav.zones')} back="/operador/admin" />
      <div className="p-4 flex flex-col gap-4 max-w-2xl mx-auto">
        <div ref={containerRef} className="w-full h-64 rounded-xl border border-[#252540]" />
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Nombre de zona" value={name} onChange={e => setName(e.target.value)} />
          <input className="input w-24" placeholder="RD$" value={fee} onChange={e => setFee(e.target.value)} />
          <button onClick={saveZone} className="btn-primary btn-sm">Guardar</button>
        </div>
        <p className="text-[10px] text-[#6b6b8a]">Haz clic en el mapa para dibujar el polígono (mín. 3 puntos)</p>
        <div className="flex flex-col gap-2">
          {zones.map(z => (
            <div key={z.id} className="card flex justify-between items-center">
              <div>
                <div className="font-bold text-sm" style={{ color: z.color }}>{z.name}</div>
                <div className="text-xs text-[#6b6b8a]">RD$ {z.delivery_fee}</div>
              </div>
              <span className={`text-[10px] font-bold ${z.active ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {z.active ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
