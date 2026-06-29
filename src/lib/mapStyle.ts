import L from 'leaflet';

export const DEFAULT_MAP_CENTER: [number, number] = [18.4861, -69.9312];

export function uberTileUrl(dark = true): string {
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}

export function applyUberTileLayer(map: L.Map, dark = true): L.TileLayer {
  const layer = L.tileLayer(uberTileUrl(dark), {
    maxZoom: 20,
    attribution: '&copy; CARTO &copy; OSM',
  });
  layer.addTo(map);
  return layer;
}

function divIcon(html: string, size: number, anchor = size / 2): L.DivIcon {
  return L.divIcon({
    className: '',
    html,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

export function messengerMapIcon(name: string, active: boolean): L.DivIcon {
  const initial = (name.trim()[0] ?? 'M').toUpperCase();
  const pulse = active
    ? '<span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(91,138,249,0.5);animation:liveMapPulse 2s ease-out infinite"></span>'
    : '';
  return divIcon(
    `<div style="position:relative;width:40px;height:40px">
      ${pulse}
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#5b8af9,#4f46e5);border:3px solid #fff;box-shadow:0 4px 14px rgba(91,138,249,0.55);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff">${initial}</div>
    </div>`,
    40,
    20,
  );
}

export function deliveryMapIcon(state: 'pending' | 'arrived'): L.DivIcon {
  const bg = state === 'arrived' ? '#22c55e' : '#f59e0b';
  return divIcon(
    `<div style="width:22px;height:22px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>`,
    22,
    11,
  );
}

export function myLocationIcon(): L.DivIcon {
  return divIcon(
    `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 8px rgba(59,130,246,0.25)"></div>`,
    18,
    9,
  );
}

export function selectedPinIcon(): L.DivIcon {
  return divIcon(
    `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#ef4444;border:3px solid #fff;box-shadow:0 4px 12px rgba(239,68,68,0.5);transform:rotate(-45deg)"></div>`,
    32,
    16,
  );
}

export function companyHubIcon(label: string): L.DivIcon {
  return divIcon(
    `<div style="width:36px;height:36px;border-radius:10px;background:#13131f;border:2px solid #5b8af9;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4)" title="${label}">
      <svg width="18" height="18" fill="#5b8af9" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
    </div>`,
    36,
    18,
  );
}
