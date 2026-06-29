import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { captureMyLocation } from '../../lib/geolocation';
import { getSession } from '../../lib/auth';
import type { Messenger, Tenant } from '../../types';
import { AppShell, PageHeader } from '../../components/AppShell';
import { IconMotorbike, IconPackage, IconUser, IconMap } from '../../components/Icons';
import L from 'leaflet';

// Fallback si la empresa aún no tiene GPS configurado
const DEFAULT_ORIGIN_LAT = 18.5201702;
const DEFAULT_ORIGIN_LNG = -70.0261773;

interface Form {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  customer_reference: string;
  location_link: string;
  delivery_fee: string;
  notes: string;
  messenger_id: string;
  total_amount: string;
  products: string;
  scheduled_date: string;
  scheduled_time: string;
  area_zone: string;
}

const EMPTY: Form = {
  customer_name: '', customer_phone: '', customer_email: '', customer_address: '',
  customer_reference: '', location_link: '', delivery_fee: '',
  notes: '', messenger_id: '', total_amount: '', products: '',
  scheduled_date: '', scheduled_time: '', area_zone: '',
};

/** Extrae lat/lng de la mayor cantidad de formatos de URL/texto posible */
function extractCoordsFromText(text: string): [number, number] | null {
  const clean = text.trim();

  // Formato: lat,lng puro
  const plainCoords = clean.match(/^([-\d.]+)\s*,\s*([-\d.]+)$/);
  if (plainCoords) {
    const lat = parseFloat(plainCoords[1]);
    const lng = parseFloat(plainCoords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }

  // @lat,lng (Google Maps)
  const atPattern = clean.match(/@([-\d.]+),([-\d.]+)/);
  if (atPattern) return [parseFloat(atPattern[1]), parseFloat(atPattern[2])];

  // ?q=lat,lng o &q=lat,lng
  const qPattern = clean.match(/[?&]q=([-\d.]+),([-\d.]+)/);
  if (qPattern) return [parseFloat(qPattern[1]), parseFloat(qPattern[2])];

  // ll=lat,lng
  const llPattern = clean.match(/ll=([-\d.]+),([-\d.]+)/);
  if (llPattern) return [parseFloat(llPattern[1]), parseFloat(llPattern[2])];

  // /place/.../@lat,lng
  const placePattern = clean.match(/place\/[^/]+\/@([-\d.]+),([-\d.]+)/);
  if (placePattern) return [parseFloat(placePattern[1]), parseFloat(placePattern[2])];

  // search/?api=1&query=lat,lng
  const searchQuery = clean.match(/query=([-\d.]+),([-\d.]+)/);
  if (searchQuery) return [parseFloat(searchQuery[1]), parseFloat(searchQuery[2])];

  // Waze: https://waze.com/ul?ll=lat%2Clng
  const wazePattern = clean.match(/ll=([-\d.]+)%2C([-\d.]+)/i);
  if (wazePattern) return [parseFloat(wazePattern[1]), parseFloat(wazePattern[2])];

  // Cualquier par de números flotantes separados por coma en la URL
  const anyCoords = clean.match(/([-]?\d{1,3}\.\d{4,})[,\s]+([-]?\d{1,3}\.\d{4,})/);
  if (anyCoords) {
    const lat = parseFloat(anyCoords[1]);
    const lng = parseFloat(anyCoords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }

  return null;
}

/** Calcula distancia en km entre dos puntos (Haversine) */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function Field({ label, hint, className, icon, children }: {
  label: string; hint?: string; className?: string;
  icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a] flex items-center gap-1.5">
        {icon && <span className="text-[#5b8af9]">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[#6b6b8a] flex items-center gap-1">{hint}</p>}
    </div>
  );
}

function SectionHead({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-[#252540]">
      <div className="w-8 h-8 rounded-xl bg-[#5b8af9]/15 flex items-center justify-center shrink-0 border border-[#5b8af9]/20">
        {icon}
      </div>
      <span className="text-sm font-bold text-[#e8e8f4] flex-1">{title}</span>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#5b8af9]/15 text-[#5b8af9] border border-[#5b8af9]/20">
          {badge}
        </span>
      )}
    </div>
  );
}

const PhoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5 19.79 19.79 0 01.22 2.82 2 2 0 012.2 1h3a2 2 0 012 1.72c.12.96.36 1.9.7 2.81a2 2 0 01-.45 2.11l-1.27 1.27a16 16 0 006.29 6.29l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0122 16.92z"/>
  </svg>
);
const UserNameIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const EmailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const AddressIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
);
const RefIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const MoneyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
);
const BoxIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
  </svg>
);
const SaveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>
  </svg>
);
const RulerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 6H3a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2V8a2 2 0 00-2-2z"/><line x1="9" y1="6" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="18"/>
  </svg>
);

export function NewDelivery() {
  const nav = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaved, setCustomerSaved] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [capturingGps, setCapturingGps] = useState(false);
  const [originLabel, setOriginLabel] = useState('Tu empresa');

  const originRef = useRef({ lat: DEFAULT_ORIGIN_LAT, lng: DEFAULT_ORIGIN_LNG });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const companyMarkerRef = useRef<L.Marker | null>(null);

  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerMessage, setCustomerMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  useEffect(() => {
    api.get<Messenger[]>('/messengers').then(setMessengers).catch(() => {});
    const sessionTenant = getSession()?.tenant;
    if (sessionTenant?.latitude != null && sessionTenant?.longitude != null) {
      originRef.current = { lat: sessionTenant.latitude, lng: sessionTenant.longitude };
      setOriginLabel(sessionTenant.name || 'Tu empresa');
    }
    api.get<Tenant>('/tenant').then((t) => {
      if (t.latitude != null && t.longitude != null) {
        originRef.current = { lat: t.latitude, lng: t.longitude };
        companyMarkerRef.current?.setLatLng([t.latitude, t.longitude]);
        mapRef.current?.setView([t.latitude, t.longitude], 12);
      }
      setOriginLabel(t.name || 'Tu empresa');
      companyMarkerRef.current?.setTooltipContent(`📍 ${t.name || 'Despacho'}`);
    }).catch(() => {});
  }, []);

  // Buscar cliente por teléfono
  useEffect(() => {
    const cleanPhone = form.customer_phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const timeout = setTimeout(() => {
        setSearchingCustomer(true);
        setCustomerMessage(null);
        setCustomerSaved(false);
        api.get<{ found: boolean; customer?: any }>(`/deliveries/customer-by-phone/${cleanPhone}`)
          .then((res) => {
            if (res.found && res.customer) {
              setForm((prev) => ({
                ...prev,
                customer_name: res.customer.name || '',
                customer_email: res.customer.email || '',
                customer_address: res.customer.address || '',
                customer_reference: res.customer.reference || '',
                area_zone: res.customer.area_zone || '',
              }));
              setCustomerMessage({ type: 'success', text: `✨ Cliente encontrado: ${res.customer.name}` });
              setCustomerSaved(true);
            } else {
              setCustomerMessage({ type: 'info', text: 'ℹ️ Cliente nuevo — completa los datos y guárdalos.' });
            }
          })
          .catch(() => {})
          .finally(() => setSearchingCustomer(false));
      }, 500);
      return () => clearTimeout(timeout);
    } else {
      setCustomerMessage(null);
      setCustomerSaved(false);
    }
  }, [form.customer_phone]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([originRef.current.lat, originRef.current.lng], 12);

    const isDark = document.documentElement.classList.contains('dark');
    tileLayerRef.current = L.tileLayer(
      isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(mapRef.current);

    // Marcador de empresa
    const companyIcon = L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#5b8af9;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(91,138,249,0.5)">
               <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
             </div>`,
      iconSize: [32, 32], iconAnchor: [16, 16]
    });
    companyMarkerRef.current = L.marker([originRef.current.lat, originRef.current.lng], { icon: companyIcon })
      .addTo(mapRef.current)
      .bindTooltip(`📍 ${originLabel}`, { permanent: false, direction: 'top' });

    mapRef.current.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setForm((f) => ({
        ...f,
        location_link: `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
      }));
    });

    setTimeout(() => { mapRef.current?.invalidateSize(); }, 250);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Cambiar tile al alternar tema
  useEffect(() => {
    const handle = () => {
      if (!tileLayerRef.current) return;
      const isDark = document.documentElement.classList.contains('dark');
      tileLayerRef.current.setUrl(
        isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      );
    };
    window.addEventListener('themechange', handle);
    return () => window.removeEventListener('themechange', handle);
  }, []);

  // Resolver URL y actualizar marcador
  const handleLocationChange = useCallback(async (rawUrl: string) => {
    setForm((f) => ({ ...f, location_link: rawUrl }));
    setResolveError('');
    if (!rawUrl.trim()) { setDistanceKm(null); return; }

    // Intentar extraer coords directamente (formatos normales)
    const directCoords = extractCoordsFromText(rawUrl);
    if (directCoords) {
      updateMapMarker(directCoords[0], directCoords[1]);
      return;
    }

    // Si es una URL corta de Google Maps, resolver en el servidor
    const isShortUrl = /maps\.app\.goo\.gl|goo\.gl\/maps|bit\.ly|tinyurl/i.test(rawUrl);
    if (isShortUrl) {
      setResolving(true);
      try {
        const res = await api.get<{ ok: boolean; lat?: number; lng?: number; resolved_url?: string; message?: string }>(
          `/deliveries/resolve-maps-url?url=${encodeURIComponent(rawUrl)}`
        );
        if (res.ok && res.lat !== undefined && res.lng !== undefined) {
          updateMapMarker(res.lat, res.lng);
          setForm((f) => ({ ...f, location_link: res.resolved_url || rawUrl }));
        } else if (res.resolved_url) {
          // Intentar parsear la URL resuelta
          const resolved = extractCoordsFromText(res.resolved_url);
          if (resolved) {
            updateMapMarker(resolved[0], resolved[1]);
            setForm((f) => ({ ...f, location_link: res.resolved_url! }));
          } else {
            setResolveError('URL resuelta pero no se encontraron coordenadas. Pega las coordenadas directamente.');
          }
        } else {
          setResolveError('No se pudo resolver automáticamente. Haz clic en el mapa o pega: lat,lng');
        }
      } catch {
        setResolveError('Error al resolver la URL. Intenta con coordenadas directas.');
      } finally {
        setResolving(false);
      }
    }
  }, []);

  function updateMapMarker(lat: number, lng: number) {
    if (!mapRef.current) return;

    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,0.2);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(239,68,68,0.4)">
               <div style="width:10px;height:10px;border-radius:50%;background:#ef4444"></div>
             </div>`,
      iconSize: [28, 28], iconAnchor: [14, 14]
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }

    // Calcular distancia
    const { lat: oLat, lng: oLng } = originRef.current;
    const km = haversineKm(oLat, oLng, lat, lng);
    setDistanceKm(km);

    // Trazar ruta OSRM
    const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${lng},${lat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.code === 'Ok' && data.routes?.[0]) {
          const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
          if (!mapRef.current) return;
          if (!routePolylineRef.current) {
            routePolylineRef.current = L.polyline(coords, { color: '#5b8af9', weight: 4, opacity: 0.8, dashArray: '6, 10' }).addTo(mapRef.current);
          } else {
            routePolylineRef.current.setLatLngs(coords);
          }
          // Ajustar distancia por ruta real
          const routeKm = data.routes[0].distance / 1000;
          setDistanceKm(routeKm);
        }
        const bounds = L.latLngBounds([[oLat, oLng], [lat, lng]]);
        mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
      })
      .catch(() => {
        mapRef.current?.setView([lat, lng], 14);
      });
  }

  function set(k: keyof Form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function useMyLocationForDelivery() {
    setCapturingGps(true);
    setResolveError('');
    try {
      const { lat, lng, link } = await captureMyLocation();
      await handleLocationChange(link);
      mapRef.current?.setView([lat, lng], 16);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'No se pudo obtener GPS');
    } finally {
      setCapturingGps(false);
    }
  }

  async function handleSaveCustomer() {
    if (!form.customer_phone) return;
    setSavingCustomer(true);
    try {
      await api.post('/deliveries/save-customer', {
        name: form.customer_name || undefined,
        phone: form.customer_phone,
        email: form.customer_email || undefined,
        address: form.customer_address || undefined,
        reference: form.customer_reference || undefined,
        area_zone: form.area_zone || undefined,
      });
      setCustomerSaved(true);
      setCustomerMessage({ type: 'success', text: '✅ Cliente guardado correctamente.' });
    } catch {
      setCustomerMessage({ type: 'info', text: '⚠️ No se pudo guardar el cliente.' });
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_phone) { setError('El teléfono del cliente es requerido'); return; }
    setError(''); setSaving(true);
    try {
      const scheduledAt = form.scheduled_date
        ? new Date(`${form.scheduled_date}T${form.scheduled_time || '08:00'}:00`).toISOString()
        : undefined;
      const body = {
        customer: {
          name: form.customer_name || undefined,
          phone: form.customer_phone,
          email: form.customer_email || undefined,
          address: form.customer_address || undefined,
          reference: form.customer_reference || undefined,
          area_zone: form.area_zone || undefined,
        },
        location_link: form.location_link || undefined,
        delivery_fee: form.delivery_fee ? Number(form.delivery_fee) : 0,
        notes: form.notes || undefined,
        messenger_id: form.messenger_id || undefined,
        total_amount: form.total_amount ? Number(form.total_amount) : 0,
        products: form.products || undefined,
        scheduled_at: scheduledAt ?? null,
        area_zone: form.area_zone || undefined,
      };
      const { id } = await api.post<{ id: string }>('/deliveries', body);
      if (!form.messenger_id) {
        try { await api.post(`/deliveries/${id}/auto-assign`, {}); } catch { /* sin mensajeros GPS */ }
      }
      nav(`/operador/envio/${id}/compartir`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'input';

  return (
    <AppShell>
      <PageHeader title="Nuevo envío" back="/operador" />

      <form onSubmit={handleSubmit} className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-5 pb-14">
        {error && <div className="banner-error">{error}</div>}

        {/* ── Sección Cliente ───────────────────────────────────── */}
        <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 shadow-lg">
          <SectionHead
            icon={<IconUser size={17} color="#5b8af9" />}
            title="Datos del cliente"
            badge="Paso 1"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* TELÉFONO PRIMERO */}
            <Field label="Teléfono *" icon={<PhoneIcon />}>
              <div className="relative">
                <input
                  className={inputCls}
                  type="tel"
                  value={form.customer_phone}
                  onChange={(e) => set('customer_phone', e.target.value)}
                  placeholder="809-000-0000"
                  required
                  autoComplete="off"
                />
                {searchingCustomer && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5b8af9] opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-[#5b8af9]/50" />
                  </span>
                )}
              </div>
              {customerMessage && (
                <p className={`text-[11px] font-semibold flex items-center gap-1 ${customerMessage.type === 'success' ? 'text-green-400' : 'text-[#a75bf9]'}`}>
                  {customerMessage.text}
                </p>
              )}
            </Field>

            {/* NOMBRE */}
            <Field label="Nombre completo" icon={<UserNameIcon />}>
              <input
                className={inputCls}
                value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)}
                placeholder="Nombre del cliente"
                autoComplete="off"
              />
            </Field>

            <Field label="Correo electrónico" icon={<EmailIcon />} hint="📧 Para notificaciones de seguimiento">
              <input className={inputCls} type="email" value={form.customer_email}
                onChange={(e) => set('customer_email', e.target.value)} placeholder="correo@cliente.com" autoComplete="off" />
            </Field>

            <Field label="Dirección" icon={<AddressIcon />}>
              <input className={inputCls} value={form.customer_address}
                onChange={(e) => set('customer_address', e.target.value)} placeholder="Calle, número, sector" />
            </Field>

            <Field label="Área / Zona" icon={<AddressIcon />}>
              <input className={inputCls} value={form.area_zone}
                onChange={(e) => set('area_zone', e.target.value)} placeholder="Ej: Bella Vista, Naco, etc." />
            </Field>

            <Field label="Referencia" icon={<RefIcon />} className="md:col-span-2">
              <input className={inputCls} value={form.customer_reference}
                onChange={(e) => set('customer_reference', e.target.value)} placeholder="Punto de referencia (torre, color de puerta, vecino...)" />
            </Field>
          </div>

          {/* Botón Guardar Cliente */}
          {form.customer_phone.replace(/\D/g, '').length >= 10 && !customerSaved && (
            <button
              type="button"
              onClick={handleSaveCustomer}
              disabled={savingCustomer}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 text-xs font-bold hover:bg-[#22c55e]/25 transition-all cursor-pointer disabled:opacity-40"
            >
              {savingCustomer ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                </svg>
              ) : <SaveIcon />}
              Guardar cliente en base de datos
            </button>
          )}
          {customerSaved && (
            <div className="mt-4 flex items-center gap-2 text-xs text-green-400 font-semibold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20,6 9,17 4,12" />
              </svg>
              Cliente registrado en el sistema
            </div>
          )}
        </div>

        {/* ── Sección Envío ──────────────────────────────────────── */}
        <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 shadow-lg">
          <SectionHead icon={<IconPackage size={17} color="#5b8af9" />} title="Detalles del envío" badge="Paso 2" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Mapa */}
            <div className="md:col-span-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a] flex items-center gap-1.5">
                  <span className="text-[#5b8af9]"><IconMap size={14} /></span>
                  Ubicar entrega
                  <span className="font-normal normal-case text-[#3a3a58]">— Clic en mapa o GPS</span>
                </label>
                <button
                  type="button"
                  onClick={useMyLocationForDelivery}
                  disabled={capturingGps}
                  className="btn-secondary text-[10px] px-3 py-1.5"
                >
                  {capturingGps ? 'GPS…' : '📍 Mi ubicación'}
                </button>
              </div>
              <div ref={mapContainerRef} className="w-full h-[240px] rounded-xl bg-[#0b0b14] overflow-hidden border border-[#252540] z-10" />

              {/* Indicador de distancia */}
              {distanceKm !== null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#5b8af9]/10 border border-[#5b8af9]/20 text-xs font-bold text-[#5b8af9]">
                  <RulerIcon />
                  Desde {originLabel}: <span className="text-white">{distanceKm.toFixed(1)} km</span>
                  <span className="text-[#6b6b8a] font-normal">· {(distanceKm / 40 * 60).toFixed(0)} min estimados</span>
                </div>
              )}
            </div>

            {/* Link de ubicación — detecta todos los formatos */}
            <Field label="Link de ubicación" icon={<IconMap size={14} />}
              hint={resolving ? '🔄 Resolviendo URL corta...' : '📌 Acepta Google Maps, Waze, goo.gl, coordenadas (lat,lng), pins del mapa'}
              className="md:col-span-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a]">
                  <IconMap size={16} />
                </span>
                <input
                  className={inputCls + ' !pl-9 ' + (resolving ? 'opacity-60' : '')}
                  value={form.location_link}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  placeholder="https://maps.app.goo.gl/… o lat,lng o https://goo.gl/maps/…"
                  disabled={resolving}
                />
                {resolving && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 animate-spin text-[#5b8af9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                    </svg>
                  </span>
                )}
              </div>
              {resolveError && (
                <p className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">⚠️ {resolveError}</p>
              )}
            </Field>

            <Field label="Costo de envío (RD$)" icon={<MoneyIcon />}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a] text-xs font-bold">RD$</span>
                <input className={inputCls + ' !pl-10'} type="number" min="0" step="0.01"
                  value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} placeholder="0.00" />
              </div>
            </Field>

            <Field label="Monto total del pedido (RD$)" icon={<MoneyIcon />}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a] text-xs font-bold">RD$</span>
                <input className={inputCls + ' !pl-10'} type="number" min="0" step="0.01"
                  value={form.total_amount} onChange={(e) => set('total_amount', e.target.value)} placeholder="0.00" />
              </div>
            </Field>

            <Field label="Productos del pedido" icon={<BoxIcon />} className="md:col-span-2">
              <input className={inputCls} value={form.products}
                onChange={(e) => set('products', e.target.value)}
                placeholder="Ej: 2x Zapatos Nike Talla 42, 1x Gorra Puma..." />
            </Field>

            <Field label="Notas internas" icon={<NoteIcon />} className="md:col-span-2">
              <textarea className={inputCls + ' resize-none min-h-[80px]'} value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Instrucciones especiales, acceso al edificio, preferencias de entrega…" rows={3} />
            </Field>

            {/* Entrega Programada */}
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#6b6b8a] flex items-center gap-1.5">
                <span className="text-[#5b8af9]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </span>
                Entrega programada <span className="text-[#3a3a58] normal-case font-normal">(opcional)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </span>
                  <input type="date" className={inputCls + ' !pl-10 cursor-pointer'}
                    value={form.scheduled_date} min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => set('scheduled_date', e.target.value)} />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b8a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                  <input type="time" className={inputCls + ' !pl-10 cursor-pointer'}
                    value={form.scheduled_time} disabled={!form.scheduled_date}
                    onChange={(e) => set('scheduled_time', e.target.value)} />
                </div>
              </div>
              {form.scheduled_date && (
                <p className="text-[11px] text-[#a75bf9] font-semibold">
                  🗓️ Programado: {new Date(`${form.scheduled_date}T${form.scheduled_time || '08:00'}:00`).toLocaleString('es-DO', { dateStyle: 'full', timeStyle: 'short' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Sección Mensajero ─────────────────────────────────── */}
        <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 shadow-lg">
          <SectionHead icon={<IconMotorbike size={17} color="#5b8af9" />} title="Asignar mensajero" badge="Paso 3" />
          {messengers.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#0d0d1a] border border-[#252540] text-sm text-[#6b6b8a]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              No hay mensajeros activos. Registra uno primero.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={[
                'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                form.messenger_id === ''
                  ? 'border-[#5b8af9] bg-[#5b8af9]/10 shadow-sm shadow-[#5b8af9]/10'
                  : 'border-[#252540] hover:border-[#5b8af9]/40 hover:bg-[#1a1a30]',
              ].join(' ')}>
                <input type="radio" className="hidden" name="mid" value="" checked={form.messenger_id === ''} onChange={() => set('messenger_id', '')} />
                <div className="w-9 h-9 rounded-full bg-[#252540] flex items-center justify-center shrink-0">
                  <IconMotorbike size={16} color="#6b6b8a" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#e8e8f4]">Sin asignar</div>
                  <div className="text-[10px] text-[#6b6b8a]">Asignar después</div>
                </div>
                {form.messenger_id === '' && (
                  <div className="ml-auto w-4 h-4 rounded-full bg-[#5b8af9] flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                  </div>
                )}
              </label>

              {messengers.filter((m) => m.active).map((m) => (
                <label key={m.id} className={[
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                  form.messenger_id === m.id
                    ? 'border-[#5b8af9] bg-[#5b8af9]/10 shadow-sm shadow-[#5b8af9]/10'
                    : 'border-[#252540] hover:border-[#5b8af9]/40 hover:bg-[#1a1a30]',
                ].join(' ')}>
                  <input type="radio" className="hidden" name="mid" value={m.id} checked={form.messenger_id === m.id} onChange={() => set('messenger_id', m.id)} />
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#5b8af9]/30 to-[#a75bf9]/20 flex items-center justify-center shrink-0 font-extrabold text-[#5b8af9] text-sm border border-[#5b8af9]/20">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#e8e8f4] truncate">{m.name}</div>
                    <div className="text-[10px] text-[#6b6b8a] truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      {m.phone || 'Activo'}
                    </div>
                  </div>
                  {form.messenger_id === m.id && (
                    <div className="w-4 h-4 rounded-full bg-[#5b8af9] flex items-center justify-center shrink-0">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                    </div>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ── Botón crear ──────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-[#5b8af9] to-[#7c5bf9] text-white font-extrabold text-sm hover:from-[#3a68e0] hover:to-[#6040e0] active:scale-[.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer shadow-xl shadow-[#5b8af9]/30"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Creando envío…
            </>
          ) : (
            <>
              <IconPackage size={18} color="#ffffff" />
              Crear envío y continuar
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </>
          )}
        </button>
      </form>
    </AppShell>
  );
}
