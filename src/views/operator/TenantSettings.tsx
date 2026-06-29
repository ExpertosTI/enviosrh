import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { applyTenantTheme } from '../../lib/theme';
import { getSession, saveSession } from '../../lib/auth';
import { captureMyLocation } from '../../lib/geolocation';
import type { Tenant } from '../../types';
import { IconPackage } from '../../components/Icons';

export function TenantSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [form, setForm] = useState<Omit<Tenant, 'id' | 'slug' | 'created_at' | 'updated_at'> & { custom_domain?: string }>({
    name: '',
    logo_url: null,
    primary_color: '#5b8af9',
    secondary_color: '#4f46e5',
    accent_color: '#f59e0b',
    theme_mode: 'light',
    contact_email: '',
    contact_phone: '',
    address: '',
    latitude: null,
    longitude: null,
    custom_domain: '',
    favicon_url: null,
  });

  useEffect(() => {
    api.get<Tenant>('/tenant')
      .then((data) => {
        setForm({
          name: data.name,
          logo_url: data.logo_url,
          primary_color: data.primary_color ?? '#5b8af9',
          secondary_color: data.secondary_color ?? '#4f46e5',
          accent_color: data.accent_color ?? '#f59e0b',
          theme_mode: data.theme_mode ?? 'light',
          contact_email: data.contact_email ?? '',
          contact_phone: data.contact_phone ?? '',
          address: data.address ?? '',
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          custom_domain: data.custom_domain ?? '',
          favicon_url: data.favicon_url ?? null,
        });
        setLogoPreview(data.logo_url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar la configuración'))
      .finally(() => setLoading(false));
  }, []);

  // Manejar subida y conversión de logo a Base64
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setError('El archivo de imagen no debe superar los 500KB para optimizar la base de datos.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setForm((prev) => ({ ...prev, logo_url: base64String }));
      setLogoPreview(base64String);
    };
    reader.readAsDataURL(file);
  };

  async function useMyLocation() {
    setLocating(true);
    setError('');
    try {
      const { lat, lng } = await captureMyLocation();
      setForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
      setSuccess('Ubicación GPS capturada. Guarda para aplicar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener la ubicación');
    } finally {
      setLocating(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updated = await api.patch<Tenant>('/tenant', form);
      setSuccess('Configuración de marca guardada con éxito.');
      
      // Aplicar tema en tiempo real en la sesión local
      applyTenantTheme(updated);

      // Actualizar sesión guardada en localStorage
      const user = getSession();
      if (user) {
        user.tenant = updated;
        const rawToken = localStorage.getItem('enviosrh_token') || '';
        saveSession(rawToken, user);
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <svg className="w-8 h-8 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <span className="text-xs text-muted mt-2">Cargando datos corporativos…</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Formulario de Configuración */}
      <form onSubmit={handleSubmit} className="lg:col-span-7 flex flex-col gap-5 bg-[#13131f] border border-[#252540] rounded-2xl p-5 md:p-6">
        <div>
          <h2 className="text-base font-bold text-[#e8e8f4]">Perfil de la Empresa</h2>
          <p className="text-xs text-[#6b6b8a] mt-1">Configura la información básica y de contacto de tu negocio.</p>
        </div>

        {error && (
          <div className="banner-error">
            {error}
          </div>
        )}

        {success && (
          <div className="banner-success">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre Comercial</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input bg-[#0b0b14] border-[#252540] text-[#e8e8f4]"
              placeholder="Ej. Express Logistic"
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Teléfono de Soporte</label>
            <input
              type="tel"
              value={form.contact_phone || ''}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className="input bg-[#0b0b14] border-[#252540] text-[#e8e8f4]"
              placeholder="Ej. 809-555-0100"
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Dominio personalizado</label>
            <input
              type="text"
              value={form.custom_domain || ''}
              onChange={(e) => setForm({ ...form, custom_domain: e.target.value })}
              className="input bg-[#0b0b14] border-[#252540] text-[#e8e8f4]"
              placeholder="envios.tuempresa.com"
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email de Contacto</label>
            <input
              type="email"
              value={form.contact_email || ''}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="input bg-[#0b0b14] border-[#252540] text-[#e8e8f4]"
              placeholder="contacto@empresa.com"
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5" data-tour="tenant-location">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Ubicación de despacho (GPS)</label>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={saving || locating}
                className="btn btn-secondary text-xs"
              >
                {locating ? 'Obteniendo GPS…' : '📍 Usar mi ubicación'}
              </button>
              {form.latitude != null && form.longitude != null && (
                <span className="text-[10px] text-[#22c55e] font-mono">
                  {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted">Punto de salida para rutas y distancias al crear envíos.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Dirección Principal</label>
            <input
              type="text"
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input bg-[#0b0b14] border-[#252540] text-[#e8e8f4]"
              placeholder="Av. 27 de Febrero, Santo Domingo"
              disabled={saving}
            />
          </div>
        </div>

        <hr className="border-[#252540]" />

        <div>
          <h2 className="text-base font-bold text-[#e8e8f4]">Diseño y Branding</h2>
          <p className="text-xs text-[#6b6b8a] mt-1">Sube tu logo, define tus colores y selecciona tu tema visual premium.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-5 items-center bg-[#0b0b14] p-4 rounded-xl border border-[#252540]/60">
          {/* Logo Upload */}
          <div className="w-20 h-20 rounded-xl bg-[#13131f] border border-[#252540] flex items-center justify-center relative overflow-hidden shrink-0">
            {logoPreview ? (
              <img src={logoPreview} alt="Preview" className="w-full h-full object-contain" />
            ) : (
              <IconPackage size={32} className="text-[#3a3a58]" />
            )}
          </div>
          <div className="flex-1 w-full">
            <div className="text-xs font-semibold text-[#e8e8f4]">Logotipo Corporativo</div>
            <div className="text-[10px] text-muted mt-0.5">Soporta PNG, JPG. Máximo 500KB.</div>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
              id="logo-upload-input"
              disabled={saving}
            />
            <label
              htmlFor="logo-upload-input"
              className="btn btn-ghost btn-sm mt-2.5 inline-block cursor-pointer"
            >
              Seleccionar Imagen
            </label>
            {logoPreview && (
              <button
                type="button"
                onClick={() => { setForm({ ...form, logo_url: null }); setLogoPreview(null); }}
                className="btn btn-danger btn-sm ml-2"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Color Primario (Tema)</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="w-11 h-11 border-0 bg-transparent rounded cursor-pointer shrink-0"
                disabled={saving}
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="input uppercase bg-[#0b0b14] border-[#252540] text-[#e8e8f4] font-mono"
                placeholder="#5B8AF9"
                maxLength={7}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Color de Acento</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                className="w-11 h-11 border-0 bg-transparent rounded cursor-pointer shrink-0"
                disabled={saving}
              />
              <input
                type="text"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                className="input uppercase bg-[#0b0b14] border-[#252540] text-[#e8e8f4] font-mono"
                placeholder="#F59E0B"
                maxLength={7}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tema Visual Predefinido</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'light', label: 'Claro Premium' },
              { key: 'dark', label: 'Modo Oscuro' },
              { key: 'glass', label: 'Glassmorphism' }
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setForm({ ...form, theme_mode: t.key })}
                className={`py-2 px-3 rounded-xl border font-semibold text-xs text-center cursor-pointer transition-all ${
                  form.theme_mode === t.key
                    ? 'border-primary bg-primary/10 text-[#e8e8f4]'
                    : 'border-[#252540] bg-[#0b0b14] text-[#6b6b8a] hover:text-[#e8e8f4]'
                }`}
                disabled={saving}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary mt-2 w-full shadow-lg"
        >
          {saving ? 'Guardando Cambios…' : 'Guardar y Aplicar Marca'}
        </button>
      </form>

      {/* Vista Previa en Tiempo Real */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">Vista Previa (Seguimiento Cliente)</div>
        
        {/* Sandbox del Portal Cliente */}
        <div
          className={`border border-[#252540] rounded-3xl p-5 shadow-2xl transition-all duration-300 w-full aspect-[9/16] max-w-[340px] mx-auto overflow-hidden flex flex-col ${
            form.theme_mode === 'light' ? 'bg-slate-50 text-slate-800 border-slate-200' : 'bg-[#080710] text-[#e8e8f4]'
          }`}
          style={{
            backgroundImage: form.theme_mode === 'glass' ? `radial-gradient(circle at 10% 20%, ${form.primary_color}1a 0%, transparent 40%)` : undefined
          }}
        >
          {/* Header Sandbox */}
          <div className={`flex items-center justify-between border-b pb-3 mb-4 ${form.theme_mode === 'light' ? 'border-slate-200 bg-white' : 'border-[#252540] bg-[#13131f]/90'} -mx-5 px-5 -mt-5 pt-4 backdrop-blur`}>
            <div className="flex items-center gap-2">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="w-5 h-5 object-contain rounded" />
              ) : (
                <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
                  <IconPackage size={12} className="text-primary" />
                </div>
              )}
              <span className="font-extrabold text-[11px] tracking-tight">{form.name || 'Mi empresa'}</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" />
          </div>

          {/* Sandbox body */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-0.5">
            {/* Status Card */}
            <div className={`rounded-2xl p-3 border ${
              form.theme_mode === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#13131f]/60 border-[#252540]/60'
            }`}>
              <div className="text-[8px] text-muted uppercase tracking-wider font-bold">Estado del Envío</div>
              <div className="flex justify-between items-center mt-1">
                <span className="font-extrabold text-xs">🛵 En camino</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[8px] font-bold"
                  style={{
                    backgroundColor: `${form.primary_color}22`,
                    color: form.primary_color
                  }}
                >
                  Seguimiento en Vivo
                </span>
              </div>
            </div>

            {/* Map Simulator */}
            <div className={`h-28 rounded-2xl relative overflow-hidden border ${
              form.theme_mode === 'light' ? 'bg-slate-200 border-slate-300' : 'bg-[#11111e] border-[#252540]'
            }`}>
              <div className="absolute inset-0 flex items-center justify-center opacity-30 text-[10px] font-bold tracking-widest uppercase text-muted">
                Simulación del Mapa
              </div>
              {/* Fake pins */}
              <div className="absolute top-1/4 left-1/3 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow animate-bounce" />
              <div
                className="absolute bottom-1/3 right-1/4 w-4 h-4 rounded-full border-2 border-white shadow flex items-center justify-center"
                style={{ backgroundColor: form.primary_color }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>

            {/* Delivery Details */}
            <div className={`rounded-2xl p-4 border flex-1 flex flex-col gap-3 ${
              form.theme_mode === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#13131f]/60 border-[#252540]/60'
            }`}>
              <div>
                <div className="text-[8px] text-muted uppercase tracking-wider font-bold">Dirección</div>
                <div className="text-xs font-semibold mt-0.5">Calle Limón #15, Gazcue</div>
              </div>

              <div>
                <div className="text-[8px] text-muted uppercase tracking-wider font-bold">Repartidor</div>
                <div className="text-xs font-semibold mt-0.5">Julio César</div>
              </div>

              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-white font-extrabold text-[11px] uppercase tracking-wider transition-all border-0 mt-auto shadow-md"
                style={{
                  backgroundColor: form.primary_color,
                }}
              >
                Confirmar Recepción
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
