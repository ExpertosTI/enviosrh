const TOOL_NAMES = new Set([
  'get_dashboard_stats',
  'list_deliveries',
  'search_delivery',
  'list_messengers',
  'get_zones',
  'get_assign_rules',
  'get_billing_summary',
  'my_deliveries',
]);

const MAX_MESSAGE_LEN = 4000;
const MAX_SEARCH_QUERY = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 20;

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Rate limit por usuario (ventana deslizante en memoria) */
export function checkAiRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= RATE_MAX_REQUESTS) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}

export function sanitizeUserMessage(raw: string): string {
  let text = raw.trim().slice(0, MAX_MESSAGE_LEN);
  // Neutralizar intentos básicos de inyección de prompt
  text = text.replace(/<\/?system>/gi, '');
  text = text.replace(/ignore\s+(all\s+)?(previous|prior)\s+instructions/gi, '[filtrado]');
  text = text.replace(/you\s+are\s+now\s+/gi, '[filtrado] ');
  return text;
}

export function validateGeminiApiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(key);
}

export function validateOpenAiApiKey(key: string): boolean {
  return /^sk-(proj-)?[A-Za-z0-9_-]{20,}$/.test(key);
}

export function assertValidApiKey(provider: 'gemini' | 'openai', key: string): void {
  if (!key) return;
  const valid = provider === 'gemini' ? validateGeminiApiKey(key) : validateOpenAiApiKey(key);
  if (!valid) throw new Error(`Formato de API key ${provider} inválido`);
}

export function assertAllowedToolName(name: string): void {
  if (!TOOL_NAMES.has(name)) {
    throw new Error(`Herramienta no autorizada: ${name}`);
  }
}

export function sanitizeToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  if (name === 'get_dashboard_stats') {
    const days = Number(args.days ?? 7);
    clean.days = Math.min(Math.max(1, Number.isFinite(days) ? days : 7), 90);
  }

  if (name === 'list_deliveries') {
    const limit = Number(args.limit ?? 10);
    clean.limit = Math.min(Math.max(1, Number.isFinite(limit) ? limit : 10), 25);
    const state = String(args.state ?? '').trim();
    if (['draft', 'assigned', 'in_transit', 'delivered', 'cancelled'].includes(state)) {
      clean.state = state;
    }
  }

  if (name === 'search_delivery') {
    clean.query = String(args.query ?? '').trim().slice(0, MAX_SEARCH_QUERY);
  }

  if (name === 'my_deliveries') {
    const state = String(args.state ?? '').trim();
    if (['assigned', 'in_transit', 'delivered', 'cancelled'].includes(state)) {
      clean.state = state;
    }
  }

  return clean;
}

/** Oculta posibles secretos antes de persistir respuestas de IA */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
}

export function safeAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Error de IA';
  // No filtrar detalles internos de red/DB al cliente
  if (/ECONNREFUSED|ETIMEDOUT|postgres|sql/i.test(msg)) {
    return 'Servicio de IA temporalmente no disponible';
  }
  if (/API key|apikey|401|403|invalid/i.test(msg)) {
    return 'API key inválida o sin permisos. Revisa Ajustes → IA.';
  }
  return msg.slice(0, 200);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}
