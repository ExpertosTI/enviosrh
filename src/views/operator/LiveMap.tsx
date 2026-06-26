import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import { api } from '../../lib/api';
import { AppShell, PageHeader } from '../../components/AppShell';

interface MessengerPin {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  active_deliveries: number;
  status: string | null;
}

interface ActiveDelivery {
  id: string;
  state: string;
  location_link: string | null;
  messenger_id: string | null;
  customer_name: string;
  customer_address: string;
  at_destination_at: string | null;
}

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function OperatorLiveMap() {
  const [messengers, setMessengers] = useState<MessengerPin[]>([]);
  const [deliveries, setDeliveries] = useState<ActiveDelivery[]>([]);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const load = useCallback(async () => {
    const data = await api.get<{ messengers: MessengerPin[]; deliveries: ActiveDelivery[] }>('/live/map');
    setMessengers(data.messengers);
    setDeliveries(data.deliveries);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([18.4861, -69.9312], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const group = markersRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    for (const m of messengers) {
      if (m.latitude == null || m.longitude == null) continue;
      const pos: L.LatLngExpression = [m.latitude, m.longitude];
      bounds.push(pos);
      L.marker(pos, {
        title: m.name,
      }).bindPopup(`<b>${m.name}</b><br/>${m.active_deliveries} envío(s) activo(s)`).addTo(group);
    }

    for (const d of deliveries) {
      const c = parseCoords(d.location_link);
      if (!c) continue;
      bounds.push(c);
      const color = d.at_destination_at ? '#22c55e' : '#f59e0b';
      L.circleMarker(c, { radius: 8, color, fillColor: color, fillOpacity: 0.8 })
        .bindPopup(`<b>${d.customer_name}</b><br/>${d.customer_address}<br/><i>${d.state}</i>`)
        .addTo(group);
    }

    if (bounds.length) map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
  }, [messengers, deliveries]);

  return (
    <AppShell>
      <PageHeader title="Mapa en vivo" back="/operador" />
      <div id="main-content" className="p-4 flex flex-col gap-3">
        <div className="flex gap-3 text-xs">
          <span className="px-2 py-1 rounded-lg bg-[#5b8af9]/15 text-[#5b8af9] font-bold">{messengers.filter(m => m.latitude).length} mensajeros GPS</span>
          <span className="px-2 py-1 rounded-lg bg-[#f59e0b]/15 text-[#f59e0b] font-bold">{deliveries.length} envíos activos</span>
        </div>
        <div ref={containerRef} className="h-[calc(100vh-200px)] rounded-2xl border border-[#252540] overflow-hidden" aria-label="Mapa de mensajeros y entregas activas" />
      </div>
    </AppShell>
  );
}
