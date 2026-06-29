const BASE_TOOL_NAMES = [
  'get_dashboard_stats',
  'list_deliveries',
  'search_delivery',
  'list_messengers',
  'get_zones',
  'get_assign_rules',
  'get_billing_summary',
  'my_deliveries',
];

const EXTENDED_TOOL_NAMES = [
  'get_new_orders',
  'get_unassigned_orders',
  'get_delayed_deliveries',
  'get_delivery_detail',
  'get_customer_history',
  'suggest_best_messenger',
  'get_messenger_gps',
  'get_live_fleet_status',
  'get_unread_messages',
  'get_ratings_report',
  'get_today_agenda',
  'get_cancellation_report',
  'get_zone_stats',
  'get_messenger_leaderboard',
  'get_delivery_timeline',
  'get_active_alerts',
  'get_hourly_today',
  'get_stale_drafts',
  'get_products_top',
  'get_avg_delivery_times',
  'draft_whatsapp_message',
  'get_scheduled_deliveries',
];

const TOOL_NAMES = new Set([...BASE_TOOL_NAMES, ...EXTENDED_TOOL_NAMES]);

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
  text = text.replace(/<\/?system>/gi, '');
  text = text.replace(/ignore\s+(all\s+)?(previous|prior)\s+instructions/gi, '[filtrado]');
  text = text.replace(/you\s+are\s+now\s+/gi, '[filtrado] ');
  return text;
}

export function sanitizeApiKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
}

export function validateGeminiApiKey(key: string): boolean {
  const k = sanitizeApiKey(key);
  // Formato clásico AI Studio
  if (/^AIza[0-9A-Za-z_-]{10,}$/.test(k)) return true;
  // Formato nuevo Google AI Studio (2025+) — empieza con AQ.
  if (/^AQ\.[A-Za-z0-9_.-]{15,}$/.test(k)) return true;
  return false;
}

export function validateOpenAiApiKey(key: string): boolean {
  const k = sanitizeApiKey(key);
  return /^sk-(proj-)?[A-Za-z0-9_-]{10,}$/.test(k);
}

export function assertValidApiKey(provider: 'gemini' | 'openai', key: string): void {
  const k = sanitizeApiKey(key);
  if (!k) return;
  const valid = provider === 'gemini' ? validateGeminiApiKey(k) : validateOpenAiApiKey(k);
  if (!valid) {
    throw new Error(
      provider === 'gemini'
        ? 'Formato de API key inválido. Copia la key completa desde AI Studio (suele empezar con AQ.)'
        : 'Formato de API key OpenAI inválido. Debe empezar con sk-…',
    );
  }
}

export function assertAllowedToolName(name: string): void {
  if (!TOOL_NAMES.has(name)) {
    throw new Error(`Herramienta no autorizada: ${name}`);
  }
}

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const n = Number(val ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(min, n), max);
}

export function sanitizeToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  if (name === 'get_dashboard_stats') {
    clean.days = clampInt(args.days, 7, 1, 90);
  }

  if (name === 'list_deliveries') {
    clean.limit = clampInt(args.limit, 10, 1, 25);
    const state = String(args.state ?? '').trim();
    if (['draft', 'assigned', 'in_transit', 'delivered', 'cancelled'].includes(state)) {
      clean.state = state;
    }
  }

  if (name === 'search_delivery' || name === 'get_customer_history') {
    clean.query = String(args.query ?? '').trim().slice(0, MAX_SEARCH_QUERY);
  }

  if (name === 'my_deliveries') {
    const state = String(args.state ?? '').trim();
    if (['assigned', 'in_transit', 'delivered', 'cancelled'].includes(state)) {
      clean.state = state;
    }
  }

  if (name === 'get_new_orders') clean.hours = clampInt(args.hours, 4, 1, 48);
  if (name === 'get_unassigned_orders') clean.limit = clampInt(args.limit, 15, 1, 25);
  if (name === 'get_ratings_report') clean.days = clampInt(args.days, 30, 1, 90);
  if (name === 'get_cancellation_report') clean.days = clampInt(args.days, 7, 1, 60);
  if (name === 'get_zone_stats') clean.days = clampInt(args.days, 7, 1, 60);
  if (name === 'get_messenger_leaderboard') clean.days = clampInt(args.days, 7, 1, 60);
  if (name === 'get_stale_drafts') clean.minutes = clampInt(args.minutes, 15, 5, 240);
  if (name === 'get_products_top') clean.days = clampInt(args.days, 14, 1, 60);
  if (name === 'get_avg_delivery_times') clean.days = clampInt(args.days, 7, 1, 60);
  if (name === 'get_scheduled_deliveries') clean.days_ahead = clampInt(args.days_ahead, 3, 1, 14);

  if (name === 'get_delivery_detail' || name === 'get_delivery_timeline' || name === 'suggest_best_messenger' || name === 'draft_whatsapp_message') {
    const id = String(args.delivery_id ?? '').trim();
    if (isValidUuid(id)) clean.delivery_id = id;
  }

  if (name === 'get_messenger_gps') {
    const id = String(args.messenger_id ?? '').trim();
    if (isValidUuid(id)) clean.messenger_id = id;
  }

  if (name === 'draft_whatsapp_message') {
    const tone = String(args.tone ?? 'amigable').trim().toLowerCase();
    if (['formal', 'amigable', 'urgente'].includes(tone)) clean.tone = tone;
  }

  return clean;
}

/** Oculta posibles secretos antes de persistir respuestas de IA */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/AQ\.[A-Za-z0-9_.-]{15,}/g, '[REDACTED]')
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

export function safeAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'Error de IA');
  if (/ECONNREFUSED|ETIMEDOUT|postgres|sql|relation.*does not exist/i.test(msg)) {
    if (/relation.*does not exist/i.test(msg)) {
      return 'Base de datos desactualizada. Reinicia la API para aplicar migraciones.';
    }
    return 'Servicio de IA temporalmente no disponible';
  }
  if (/JWT_SECRET requerido/i.test(msg)) {
    return 'Error de servidor: JWT_SECRET no configurado para cifrar claves IA';
  }
  if (/Formato de API key/i.test(msg)) return msg;
  if (/API key|apikey|401|403/i.test(msg) && /invalid|permiso|permission/i.test(msg)) {
    return 'API key inválida o sin permisos. Revisa Ajustes → IA.';
  }
  return msg.slice(0, 240);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}
