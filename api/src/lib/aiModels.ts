/** Modelos permitidos — solo IDs estables vigentes en 2026 */

export interface ModelOption {
  id: string;
  label: string;
  tier: 'recommended' | 'fast' | 'pro' | 'legacy';
}

export const GEMINI_MODELS: ModelOption[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — flagship agentes (2026)', tier: 'recommended' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — equilibrio precio/rendimiento', tier: 'fast' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — ultra rápido', tier: 'fast' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — razonamiento avanzado', tier: 'pro' },
];

export const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini — recomendado (2026)', tier: 'recommended' },
  { id: 'gpt-4.1', label: 'GPT-4.1 — máxima calidad', tier: 'pro' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini — económico', tier: 'fast' },
  { id: 'gpt-4o', label: 'GPT-4o — multimodal', tier: 'pro' },
];

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

/** Modelos deprecados por Google → reemplazo automático */
const DEPRECATED_GEMINI: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash-8b': 'gemini-2.5-flash-lite',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-pro': 'gemini-2.5-flash',
};

const DEPRECATED_OPENAI: Record<string, string> = {
  'gpt-3.5-turbo': 'gpt-4.1-mini',
  'gpt-3.5-turbo-16k': 'gpt-4.1-mini',
};

const GEMINI_ALLOW = new Set(GEMINI_MODELS.map(m => m.id));
const OPENAI_ALLOW = new Set(OPENAI_MODELS.map(m => m.id));

export function normalizeGeminiModel(model: string | null | undefined): string {
  const m = (model ?? '').trim();
  if (DEPRECATED_GEMINI[m]) return DEPRECATED_GEMINI[m];
  if (GEMINI_ALLOW.has(m)) return m;
  return DEFAULT_GEMINI_MODEL;
}

export function normalizeOpenAiModel(model: string | null | undefined): string {
  const m = (model ?? '').trim();
  if (DEPRECATED_OPENAI[m]) return DEPRECATED_OPENAI[m];
  if (OPENAI_ALLOW.has(m)) return m;
  return DEFAULT_OPENAI_MODEL;
}

export function assertAllowedModel(provider: 'gemini' | 'openai', model: string): string {
  const normalized = provider === 'gemini'
    ? normalizeGeminiModel(model)
    : normalizeOpenAiModel(model);
  const allowed = provider === 'gemini' ? GEMINI_ALLOW : OPENAI_ALLOW;
  if (!allowed.has(normalized)) {
    throw new Error(`Modelo no permitido: ${model}`);
  }
  return normalized;
}

export function isDeprecatedModel(provider: 'gemini' | 'openai', model: string): boolean {
  if (provider === 'gemini') return Boolean(DEPRECATED_GEMINI[model]);
  return Boolean(DEPRECATED_OPENAI[model]);
}
