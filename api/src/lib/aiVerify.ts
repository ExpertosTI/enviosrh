import { normalizeGeminiModel, normalizeOpenAiModel } from './aiModels.js';

export interface AiVerifyResult {
  ok: boolean;
  provider: 'gemini' | 'openai';
  model_used: string;
  message: string;
  latency_ms: number;
}

const GEMINI_PROBE_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];

async function probeGemini(apiKey: string, preferredModel: string): Promise<AiVerifyResult> {
  const start = Date.now();
  const models = [normalizeGeminiModel(preferredModel), ...GEMINI_PROBE_MODELS.filter(m => m !== preferredModel)];

  let lastError = 'No se pudo conectar con Gemini';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responde solo: OK' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      }),
    });

    const data = await res.json() as { error?: { message?: string; status?: string } };

    if (res.ok) {
      return {
        ok: true,
        provider: 'gemini',
        model_used: model,
        message: model === preferredModel
          ? `Conexión exitosa con ${model}`
          : `Conexión OK. El modelo ${preferredModel} no está disponible; se usará ${model}`,
        latency_ms: Date.now() - start,
      };
    }

    const msg = data.error?.message ?? `Error ${res.status}`;
    if (res.status === 401 || res.status === 403 || /API key|permission|invalid/i.test(msg)) {
      return {
        ok: false,
        provider: 'gemini',
        model_used: model,
        message: 'API key de Gemini inválida o sin permisos. Genera una nueva en aistudio.google.com/apikey',
        latency_ms: Date.now() - start,
      };
    }
    if (res.status === 404 || /not found|not supported/i.test(msg)) {
      lastError = `Modelo ${model} no disponible`;
      continue;
    }
    lastError = msg;
  }

  return {
    ok: false,
    provider: 'gemini',
    model_used: preferredModel,
    message: lastError,
    latency_ms: Date.now() - start,
  };
}

async function probeOpenAi(apiKey: string, preferredModel: string): Promise<AiVerifyResult> {
  const start = Date.now();
  const model = normalizeOpenAiModel(preferredModel);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Responde solo: OK' }],
      max_tokens: 8,
      temperature: 0,
    }),
  });

  const data = await res.json() as { error?: { message?: string } };

  if (res.ok) {
    return {
      ok: true,
      provider: 'openai',
      model_used: model,
      message: `Conexión exitosa con ${model}`,
      latency_ms: Date.now() - start,
    };
  }

  const msg = data.error?.message ?? `Error ${res.status}`;
  if (res.status === 401 || /invalid.*key|incorrect api key/i.test(msg)) {
    return {
      ok: false,
      provider: 'openai',
      model_used: model,
      message: 'API key de OpenAI inválida. Revisa platform.openai.com/api-keys',
      latency_ms: Date.now() - start,
    };
  }

  return {
    ok: false,
    provider: 'openai',
    model_used: model,
    message: msg.slice(0, 200),
    latency_ms: Date.now() - start,
  };
}

export async function verifyAiConnection(
  provider: 'gemini' | 'openai',
  apiKey: string,
  model: string,
): Promise<AiVerifyResult> {
  const key = apiKey.trim();
  if (!key) {
    return {
      ok: false,
      provider,
      model_used: model,
      message: 'No hay API key configurada',
      latency_ms: 0,
    };
  }
  return provider === 'gemini' ? probeGemini(key, model) : probeOpenAi(key, model);
}
