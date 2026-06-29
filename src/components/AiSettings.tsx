import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AI_NAME } from '../lib/brand';

interface ModelOption {
  id: string;
  label: string;
  tier: string;
}

interface AiSettingsData {
  enabled: boolean;
  provider: 'gemini' | 'openai';
  gemini_model: string;
  openai_model: string;
  use_env_fallback: boolean;
  gemini_key_set: boolean;
  openai_key_set: boolean;
  env_gemini_configured?: boolean;
  env_openai_configured?: boolean;
  gemini_key_masked: string;
  openai_key_masked: string;
}

interface VerifyResult {
  ok: boolean;
  message: string;
  model_used?: string;
  latency_ms?: number;
}

export function AiSettings() {
  const [geminiModels, setGeminiModels] = useState<ModelOption[]>([]);
  const [openaiModels, setOpenaiModels] = useState<ModelOption[]>([]);
  const [form, setForm] = useState({
    enabled: true,
    provider: 'gemini' as 'gemini' | 'openai',
    gemini_api_key: '',
    openai_api_key: '',
    gemini_model: 'gemini-2.5-flash',
    openai_model: 'gpt-4.1-mini',
    use_env_fallback: true,
  });
  const [masked, setMasked] = useState({ gemini: '', openai: '', geminiSet: false, openaiSet: false });
  const [envStatus, setEnvStatus] = useState({ gemini: false, openai: false });
  const [editGeminiKey, setEditGeminiKey] = useState(false);
  const [editOpenaiKey, setEditOpenaiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    api.get<{
      gemini_models: ModelOption[];
      openai_models: ModelOption[];
    }>('/ai/capabilities').then((c) => {
      setGeminiModels(c.gemini_models);
      setOpenaiModels(c.openai_models);
    }).catch(() => {});

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
      setEnvStatus({
        gemini: Boolean(d.env_gemini_configured),
        openai: Boolean(d.env_openai_configured),
      });
    }).catch(() => {});
  }, []);

  async function testConnection() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await api.post<VerifyResult>('/ai/test', {
        provider: form.provider,
        gemini_api_key: (editGeminiKey || form.gemini_api_key.trim()) ? form.gemini_api_key : undefined,
        openai_api_key: (editOpenaiKey || form.openai_api_key.trim()) ? form.openai_api_key : undefined,
        gemini_model: form.gemini_model,
        openai_model: form.openai_model,
        use_env_fallback: form.use_env_fallback,
      });
      setMsg({
        type: res.ok ? 'ok' : 'err',
        text: res.message + (res.latency_ms ? ` (${res.latency_ms}ms)` : ''),
      });
      if (res.ok && res.model_used && form.provider === 'gemini' && res.model_used !== form.gemini_model) {
        setForm(f => ({ ...f, gemini_model: res.model_used! }));
      }
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error de conexión' });
    } finally {
      setTesting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: form.enabled,
        provider: form.provider,
        gemini_model: form.gemini_model,
        openai_model: form.openai_model,
        use_env_fallback: form.use_env_fallback,
      };
      if (editGeminiKey && form.gemini_api_key.trim()) {
        payload.gemini_api_key = form.gemini_api_key.trim();
      } else if (form.gemini_api_key.trim()) {
        payload.gemini_api_key = form.gemini_api_key.trim();
      }
      if (editOpenaiKey && form.openai_api_key.trim()) {
        payload.openai_api_key = form.openai_api_key.trim();
      }

      const res = await api.put<{
        gemini_key_masked: string;
        openai_key_masked: string;
        gemini_model: string;
        openai_model: string;
      }>('/ai/settings', payload);

      setMasked({
        gemini: res.gemini_key_masked,
        openai: res.openai_key_masked,
        geminiSet: Boolean(res.gemini_key_masked),
        openaiSet: Boolean(res.openai_key_masked),
      });
      setForm(f => ({
        ...f,
        gemini_api_key: '',
        openai_api_key: '',
        gemini_model: res.gemini_model,
        openai_model: res.openai_model,
      }));
      setEditGeminiKey(false);
      setEditOpenaiKey(false);
      setMsg({ type: 'ok', text: 'Configuración guardada correctamente' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar' });
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
            {AI_NAME} · consultas operativas en tiempo real
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
          <option value="gemini">Google Gemini (AI Studio)</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      {form.provider === 'gemini' && form.use_env_fallback && !envStatus.gemini && !masked.geminiSet && (
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
          Configura tu API key de Google AI Studio abajo o contacta al administrador del servidor.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="text-xs text-[#6b6b8a]">
          API Key Google AI Studio
          {masked.geminiSet && !editGeminiKey ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="input flex-1 text-[#22c55e] text-[11px]">{masked.gemini || '••••••••'}</span>
              <button type="button" className="btn-secondary text-[10px] px-2 py-1" onClick={() => setEditGeminiKey(true)}>
                Cambiar
              </button>
            </div>
          ) : (
            <input
              type="password"
              className="input mt-1"
              placeholder="Pega tu key de AI Studio (AQ.…)"
              value={form.gemini_api_key}
              onChange={e => setForm({ ...form, gemini_api_key: e.target.value })}
              autoComplete="off"
            />
          )}
        </div>
        <label className="text-xs text-[#6b6b8a]">
          Modelo Gemini
          <select
            className="input mt-1"
            value={form.gemini_model}
            onChange={e => setForm({ ...form, gemini_model: e.target.value })}
          >
            {geminiModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}{m.tier === 'recommended' ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="text-xs text-[#6b6b8a]">
          API Key OpenAI
          {masked.openaiSet && !editOpenaiKey ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="input flex-1 text-[#22c55e] text-[11px]">{masked.openai || '••••••••'}</span>
              <button type="button" className="btn-secondary text-[10px] px-2 py-1" onClick={() => setEditOpenaiKey(true)}>
                Cambiar
              </button>
            </div>
          ) : (
            <input
              type="password"
              className="input mt-1"
              placeholder="sk-… (opcional)"
              value={form.openai_api_key}
              onChange={e => setForm({ ...form, openai_api_key: e.target.value })}
              autoComplete="off"
            />
          )}
        </div>
        <label className="text-xs text-[#6b6b8a]">
          Modelo OpenAI
          <select
            className="input mt-1"
            value={form.openai_model}
            onChange={e => setForm({ ...form, openai_model: e.target.value })}
          >
            {openaiModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}{m.tier === 'recommended' ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#e8e8f4]">
        <input
          type="checkbox"
          checked={form.use_env_fallback}
          onChange={e => setForm({ ...form, use_env_fallback: e.target.checked })}
        />
        Usar API keys del servidor si no hay clave propia
      </label>

      {msg && (
        <p className={`text-xs leading-relaxed ${
          msg.type === 'ok' ? 'text-[#22c55e]' : msg.type === 'err' ? 'text-red-400' : 'text-[#93c5fd]'
        }`}>
          {msg.text}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={testing || saving}
          onClick={testConnection}
          className="btn-secondary text-xs flex-1"
        >
          {testing ? 'Probando…' : '⚡ Probar conexión'}
        </button>
        <button type="submit" disabled={saving || testing} className="btn-primary text-xs flex-1">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
