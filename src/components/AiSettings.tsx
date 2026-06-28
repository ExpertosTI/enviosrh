import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface AiSettingsData {
  enabled: boolean;
  provider: 'gemini' | 'openai';
  gemini_model: string;
  openai_model: string;
  use_env_fallback: boolean;
  gemini_key_set: boolean;
  openai_key_set: boolean;
  gemini_key_masked: string;
  openai_key_masked: string;
}

export function AiSettings() {
  const [form, setForm] = useState({
    enabled: true,
    provider: 'gemini' as 'gemini' | 'openai',
    gemini_api_key: '',
    openai_api_key: '',
    gemini_model: 'gemini-2.0-flash',
    openai_model: 'gpt-4o-mini',
    use_env_fallback: true,
  });
  const [masked, setMasked] = useState({ gemini: '', openai: '', geminiSet: false, openaiSet: false });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<AiSettingsData>('/ai/settings').then((d) => {
      setForm(f => ({
        ...f,
        enabled: d.enabled,
        provider: d.provider,
        gemini_model: d.gemini_model,
        openai_model: d.openai_model,
        use_env_fallback: d.use_env_fallback,
      }));
      setMasked({
        gemini: d.gemini_key_masked,
        openai: d.openai_key_masked,
        geminiSet: d.gemini_key_set,
        openaiSet: d.openai_key_set,
      });
    }).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const payload: Record<string, unknown> = {
        enabled: form.enabled,
        provider: form.provider,
        gemini_model: form.gemini_model,
        openai_model: form.openai_model,
        use_env_fallback: form.use_env_fallback,
      };
      if (form.gemini_api_key.trim()) payload.gemini_api_key = form.gemini_api_key.trim();
      if (form.openai_api_key.trim()) payload.openai_api_key = form.openai_api_key.trim();

      const res = await api.put<{
        gemini_key_masked: string;
        openai_key_masked: string;
      }>('/ai/settings', payload);

      setMasked({
        gemini: res.gemini_key_masked,
        openai: res.openai_key_masked,
        geminiSet: Boolean(res.gemini_key_masked),
        openaiSet: Boolean(res.openai_key_masked),
      });
      setForm(f => ({ ...f, gemini_api_key: '', openai_api_key: '' }));
      setMsg('Configuración IA guardada');
    } catch {
      setMsg('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card p-4 flex flex-col gap-3 mb-4 border border-[#5b8af9]/20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="card-title mb-0 flex items-center gap-2">
            <span className="text-lg">✦</span> Asistente IA
          </div>
          <p className="text-[10px] text-[#6b6b8a] mt-1">
            Google Gemini (gratis) u OpenAI. Las claves se guardan cifradas.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#e8e8f4] shrink-0">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={e => setForm({ ...form, enabled: e.target.checked })}
          />
          Activo
        </label>
      </div>

      <label className="text-xs text-[#6b6b8a]">
        Proveedor principal
        <select
          className="input mt-1"
          value={form.provider}
          onChange={e => setForm({ ...form, provider: e.target.value as 'gemini' | 'openai' })}
        >
          <option value="gemini">Google Gemini (recomendado · tier gratuito)</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs text-[#6b6b8a]">
          API Key Google AI Studio
          {masked.geminiSet && (
            <span className="block text-[10px] text-[#22c55e] mt-0.5">Configurada: {masked.gemini}</span>
          )}
          <input
            type="password"
            className="input mt-1"
            placeholder="AIza…"
            value={form.gemini_api_key}
            onChange={e => setForm({ ...form, gemini_api_key: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="text-xs text-[#6b6b8a]">
          Modelo Gemini
          <select
            className="input mt-1"
            value={form.gemini_model}
            onChange={e => setForm({ ...form, gemini_model: e.target.value })}
          >
            <option value="gemini-2.0-flash">gemini-2.0-flash (rápido)</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
          </select>
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs text-[#6b6b8a]">
          API Key OpenAI
          {masked.openaiSet && (
            <span className="block text-[10px] text-[#22c55e] mt-0.5">Configurada: {masked.openai}</span>
          )}
          <input
            type="password"
            className="input mt-1"
            placeholder="sk-…"
            value={form.openai_api_key}
            onChange={e => setForm({ ...form, openai_api_key: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="text-xs text-[#6b6b8a]">
          Modelo OpenAI
          <select
            className="input mt-1"
            value={form.openai_model}
            onChange={e => setForm({ ...form, openai_model: e.target.value })}
          >
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#e8e8f4]">
        <input
          type="checkbox"
          checked={form.use_env_fallback}
          onChange={e => setForm({ ...form, use_env_fallback: e.target.checked })}
        />
        Usar API keys del servidor si no hay clave del tenant
      </label>

      <p className="text-[10px] text-[#6b6b8a] leading-relaxed">
        Obtén tu key gratis en{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-[#5b8af9]">
          Google AI Studio
        </a>
        . La IA puede consultar envíos, mensajeros, zonas y facturación en tiempo real.
      </p>

      {msg && <p className={`text-xs ${msg.includes('Error') ? 'text-red-400' : 'text-[#22c55e]'}`}>{msg}</p>}
      <button type="submit" disabled={saving} className="btn-primary text-xs w-full">
        {saving ? 'Guardando…' : 'Guardar configuración IA'}
      </button>
    </form>
  );
}
