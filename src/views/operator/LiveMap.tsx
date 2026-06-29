import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import { api } from '../../lib/api';
import { captureMyLocation, coordsToMapsLink } from '../../lib/geolocation';
import {
  DEFAULT_MAP_CENTER,
  applyUberTileLayer,
  messengerMapIcon,
  deliveryMapIcon,
  myLocationIcon,
  selectedPinIcon,
  companyHubIcon,
} from '../../lib/mapStyle';
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

interface MapPayload {
  messengers: MessengerPin[];
  deliveries: ActiveDelivery[];
  tenant?: { name: string; latitude: number | null; longitude: number | null };
}

function parseCoords(link: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

type SheetTab = 'fleet' | 'orders' | 'pin';

export function OperatorLiveMap() {
  const [messengers, setMessengers] = useState<MessengerPin[]>([]);
  const [deliveries, setDeliveries] = useState<ActiveDelivery[]>([]);
  const [tenantHub, setTenantHub] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [sheetTab, setSheetTab] = useState<SheetTab>('fleet');
  const [selectedPin, setSelectedPin] = useState<{ lat: number; lng: number } | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [copied, setCopied] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const myMarkerRef = useRef<L.Marker | null>(null);
  const hubMarkerRef = useRef<L.Marker | null>(null);

  const load = useCallback(async () => {
    const data = await api.get<MapPayload>('/live/map');
    setMessengers(data.messengers);
    setDeliveries(data.deliveries);
    if (data.tenant?.latitude != null && data.tenant?.longitude != null) {
      setTenantHub({
        name: data.tenant.name,
        lat: data.tenant.latitude,
        lng: data.tenant.longitude,
      });
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const dark = document.documentElement.classList.contains('dark');
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(DEFAULT_MAP_CENTER, 12);
    applyUberTileLayer(map, dark);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setSelectedPin({ lat, lng });
      setSheetTab('pin');
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const focusOn = useCallback((lat: number, lng: number, zoom = 15) => {
    mapRef.current?.setView([lat, lng], zoom, { animate: true });
  }, []);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    const layers = group.getLayers();
    if (!layers.length) {
      if (tenantHub) map.setView([tenantHub.lat, tenantHub.lng], 13);
      return;
    }
    const bounds = L.latLngBounds(layers.map(l => (l as L.Marker).getLatLng()));
    if (selectedPin) bounds.extend([selectedPin.lat, selectedPin.lng]);
    if (myLocation) bounds.extend([myLocation.lat, myLocation.lng]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }, [tenantHub, selectedPin, myLocation]);

  useEffect(() => {
    const group = markersRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    if (tenantHub) {
      if (!hubMarkerRef.current) {
        hubMarkerRef.current = L.marker([tenantHub.lat, tenantHub.lng], { icon: companyHubIcon(tenantHub.name) });
      } else {
        hubMarkerRef.current.setLatLng([tenantHub.lat, tenantHub.lng]);
      }
      hubMarkerRef.current.bindPopup(`<b>${tenantHub.name}</b><br/>Base de despacho`).addTo(group);
    }

    for (const m of messengers) {
      if (m.latitude == null || m.longitude == null) continue;
      L.marker([m.latitude, m.longitude], {
        icon: messengerMapIcon(m.name, m.active_deliveries > 0),
      })
        .bindPopup(`<b>${m.name}</b><br/>${m.active_deliveries} envío(s) activo(s)`)
        .addTo(group);
    }

    for (const d of deliveries) {
      const c = parseCoords(d.location_link);
      if (!c) continue;
      L.marker(c, {
        icon: deliveryMapIcon(d.at_destination_at ? 'arrived' : 'pending'),
      })
        .bindPopup(`<b>${d.customer_name}</b><br/>${d.customer_address}<br/><i>${d.state}</i>`)
        .addTo(group);
    }

    if (myLocation) {
      if (!myMarkerRef.current) {
        myMarkerRef.current = L.marker([myLocation.lat, myLocation.lng], { icon: myLocationIcon(), zIndexOffset: 1000 });
      } else {
        myMarkerRef.current.setLatLng([myLocation.lat, myLocation.lng]);
      }
      myMarkerRef.current.bindPopup('Tu ubicación').addTo(group);
    }

    if (selectedPin) {
      if (!pinMarkerRef.current) {
        pinMarkerRef.current = L.marker([selectedPin.lat, selectedPin.lng], { icon: selectedPinIcon(), zIndexOffset: 900 });
      } else {
        pinMarkerRef.current.setLatLng([selectedPin.lat, selectedPin.lng]);
      }
      pinMarkerRef.current.addTo(group);
    }
  }, [messengers, deliveries, tenantHub, myLocation, selectedPin]);

  async function goToMyLocation() {
    setLocating(true);
    try {
      const { lat, lng } = await captureMyLocation();
      setMyLocation({ lat, lng });
      setSelectedPin({ lat, lng });
      setSheetTab('pin');
      focusOn(lat, lng, 16);
    } catch {
      /* ignore */
    } finally {
      setLocating(false);
    }
  }

  async function copyPinLink() {
    if (!selectedPin) return;
    await navigator.clipboard.writeText(coordsToMapsLink(selectedPin.lat, selectedPin.lng));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const gpsCount = messengers.filter(m => m.latitude != null).length;

  return (
    <AppShell>
      <div className="live-map-page">
        <PageHeader title="Mapa en vivo" back="/operador" />

        <div className="live-map-viewport">
          <div ref={containerRef} className="live-map-canvas" aria-label="Mapa en vivo" />

          <div className="live-map-topbar">
            <span className="live-map-pill live-map-pill--blue">{gpsCount} en GPS</span>
            <span className="live-map-pill live-map-pill--amber">{deliveries.length} envíos</span>
          </div>

          <div className="live-map-fabs">
            <button type="button" className="live-map-fab" onClick={goToMyLocation} disabled={locating} title="Mi ubicación">
              {locating ? '…' : '📍'}
            </button>
            <button type="button" className="live-map-fab" onClick={fitAll} title="Ver todo">
              ⊕
            </button>
          </div>

          <p className="live-map-hint">Toca el mapa para marcar un punto · Arrastra el zoom con dos dedos</p>

          <div className="live-map-sheet">
            <div className="live-map-sheet-handle" />
            <div className="live-map-sheet-tabs">
              {(['fleet', 'orders', 'pin'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`live-map-sheet-tab${sheetTab === tab ? ' is-active' : ''}`}
                  onClick={() => setSheetTab(tab)}
                >
                  {tab === 'fleet' ? 'Mensajeros' : tab === 'orders' ? 'Envíos' : 'Mi pin'}
                </button>
              ))}
            </div>

            <div className="live-map-sheet-body">
              {sheetTab === 'fleet' && (
                messengers.length === 0 ? (
                  <p className="live-map-empty">No hay mensajeros registrados</p>
                ) : (
                  messengers.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className="live-map-row"
                      onClick={() => {
                        if (m.latitude != null && m.longitude != null) focusOn(m.latitude, m.longitude);
                      }}
                      disabled={m.latitude == null}
                    >
                      <span className="live-map-row-avatar">{(m.name[0] ?? 'M').toUpperCase()}</span>
                      <span className="live-map-row-text">
                        <strong>{m.name}</strong>
                        <small>{m.latitude != null ? `${m.active_deliveries} activo(s)` : 'Sin GPS'}</small>
                      </span>
                      {m.latitude != null && <span className="live-map-row-go">→</span>}
                    </button>
                  ))
                )
              )}

              {sheetTab === 'orders' && (
                deliveries.length === 0 ? (
                  <p className="live-map-empty">No hay envíos activos</p>
                ) : (
                  deliveries.map(d => {
                    const c = parseCoords(d.location_link);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className="live-map-row"
                        onClick={() => c && focusOn(c[0], c[1])}
                        disabled={!c}
                      >
                        <span className={`live-map-row-dot${d.at_destination_at ? ' is-green' : ''}`} />
                        <span className="live-map-row-text">
                          <strong>{d.customer_name}</strong>
                          <small>{d.customer_address || d.state}</small>
                        </span>
                        {c && <span className="live-map-row-go">→</span>}
                      </button>
                    );
                  })
                )
              )}

              {sheetTab === 'pin' && (
                selectedPin ? (
                  <div className="live-map-pin-panel">
                    <p className="live-map-pin-title">Ubicación seleccionada</p>
                    <p className="live-map-pin-coords">
                      {selectedPin.lat.toFixed(6)}, {selectedPin.lng.toFixed(6)}
                    </p>
                    <div className="live-map-pin-actions">
                      <button type="button" className="live-map-pin-btn" onClick={copyPinLink}>
                        {copied ? '✓ Copiado' : 'Copiar enlace'}
                      </button>
                      <button type="button" className="live-map-pin-btn is-secondary" onClick={goToMyLocation}>
                        Usar mi GPS
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="live-map-empty">Toca el mapa o usa 📍 para marcar tu ubicación</p>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
