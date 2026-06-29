import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import sql from '../db/index.js';
import { auth } from '../middleware/auth.js';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/aiCrypto.js';
import { runAiChat, parseTenantAiRow } from '../lib/aiEngine.js';
import { subscribeTenantAi, type TenantAiEvent } from '../lib/aiTenantBus.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  GEMINI_MODELS,
  OPENAI_MODELS,
  assertAllowedModel,
  normalizeGeminiModel,
  normalizeOpenAiModel,
} from '../lib/aiModels.js';
import {
  assertValidApiKey,
  checkAiRateLimit,
  isValidUuid,
  redactSecrets,
  safeAiError,
  sanitizeApiKey,
  sanitizeUserMessage,
} from '../lib/aiSecurity.js';
import { verifyAiConnection } from '../lib/aiVerify.js';
import { toolsForRole } from '../lib/aiTools.js';

const ai = new Hono();

async function getTenantName(tenantId: string): Promise<string> {
  const [t] = await sql`SELECT name FROM tenants WHERE id = ${tenantId}`;
  return (t?.name as string) ?? 'EnvíosRH';
}

async function loadAiConfig(tenantId: string) {
  const [row] = await sql`
    SELECT enabled, provider, gemini_api_key, openai_api_key,
           gemini_model, openai_model, use_env_fallback, updated_at
    FROM tenant_ai_settings WHERE tenant_id = ${tenantId}
  `;
  return parseTenantAiRow(row as Record<string, unknown> | undefined);
}

// ── Capacidades ───────────────────────────────────────────────
ai.get('/capabilities', auth, (c) => {
  const user = c.get('user');
  const tools = toolsForRole(user.role);
  return c.json({
    tools: tools.map(t => ({ name: t.name, description: t.description })),
    providers: ['gemini', 'openai'],
    gemini_models: GEMINI_MODELS,
    openai_models: OPENAI_MODELS,
    default_models: {
      gemini: DEFAULT_GEMINI_MODEL,
      openai: DEFAULT_OPENAI_MODEL,
    },
    suggestions: user.role === 'operator'
      ? [
          '¿Hay pedidos nuevos sin asignar?',
          'Créame un mensajero llamado Juan Pérez',
          'Lista todos los colaboradores del equipo',
          '¿Cuáles envíos están demorados?',
          'Ranking de mensajeros esta semana',
          'Estado en vivo de la flota',
        ]
      : [
          '¿Cuáles son mis envíos activos?',
          '¿Tengo mensajes sin leer?',
          'Mi agenda de hoy',
          'Consejos para llegar más rápido',
        ],
    proactive: true,
    tools_count: tools.length,
  });
});

const DEFAULT_ALERT_PREFS = {
  proactive_enabled: true,
  new_orders: true,
  assignments: true,
  in_transit: true,
  delivered: true,
  cancelled: true,
  new_messages: true,
  delays: true,
  ratings: true,
  sound_enabled: true,
};

function eventAllowedByPrefs(event: TenantAiEvent, prefs: Record<string, boolean>): boolean {
  if (!prefs.proactive_enabled) return false;
  const map: Record<string, string> = {
    new_order: 'new_orders',
    assigned: 'assignments',
    in_transit: 'in_transit',
    delivered: 'delivered',
    cancelled: 'cancelled',
    new_message: 'new_messages',
    delay_warning: 'delays',
    unassigned: 'new_orders',
    rating: 'ratings',
    digest: 'proactive_enabled',
  };
  const key = map[event.type];
  if (!key) return true;
  return prefs[key] !== false;
}

// ── Stream proactivo (SSE) ───────────────────────────────────
ai.get('/stream', auth, async (c) => {
  const user = c.get('user');

  return streamSSE(c, async (stream) => {
    const [prefsRow] = await sql`
      SELECT * FROM ai_alert_prefs WHERE user_id = ${user.sub}
    `;
    let prefs = { ...DEFAULT_ALERT_PREFS, ...(prefsRow ?? {}) };

    const handler = (event: TenantAiEvent) => {
      if (!eventAllowedByPrefs(event, prefs as Record<string, boolean>)) return;
      stream.writeSSE({ event: 'alert', data: JSON.stringify(event) });
    };

    const unsub = subscribeTenantAi(user.tenant_id, user.role, user.sub, handler);
    const ping = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: '{}' });
    }, 20000);

    stream.onAbort(() => {
      clearInterval(ping);
      unsub();
    });

    await new Promise(() => {});
  });
});

// ── Preferencias de alertas ──────────────────────────────────
ai.get('/alert-prefs', auth, async (c) => {
  const user = c.get('user');
  try {
    const [row] = await sql`SELECT * FROM ai_alert_prefs WHERE user_id = ${user.sub}`;
    return c.json({ ...DEFAULT_ALERT_PREFS, ...(row ?? {}) });
  } catch {
    return c.json(DEFAULT_ALERT_PREFS);
  }
});

ai.put('/alert-prefs', auth, async (c) => {
  const user = c.get('user');
  try {
  const body = await c.req.json<Partial<typeof DEFAULT_ALERT_PREFS>>();

  const [row] = await sql`
    INSERT INTO ai_alert_prefs (
      user_id, tenant_id, proactive_enabled, new_orders, assignments,
      in_transit, delivered, cancelled, new_messages, delays, ratings, sound_enabled, updated_at
    ) VALUES (
      ${user.sub}, ${user.tenant_id},
      ${body.proactive_enabled ?? true},
      ${body.new_orders ?? true},
      ${body.assignments ?? true},
      ${body.in_transit ?? true},
      ${body.delivered ?? true},
      ${body.cancelled ?? true},
      ${body.new_messages ?? true},
      ${body.delays ?? true},
      ${body.ratings ?? true},
      ${body.sound_enabled ?? true},
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      proactive_enabled = COALESCE(${body.proactive_enabled ?? null}, ai_alert_prefs.proactive_enabled),
      new_orders = COALESCE(${body.new_orders ?? null}, ai_alert_prefs.new_orders),
      assignments = COALESCE(${body.assignments ?? null}, ai_alert_prefs.assignments),
      in_transit = COALESCE(${body.in_transit ?? null}, ai_alert_prefs.in_transit),
      delivered = COALESCE(${body.delivered ?? null}, ai_alert_prefs.delivered),
      cancelled = COALESCE(${body.cancelled ?? null}, ai_alert_prefs.cancelled),
      new_messages = COALESCE(${body.new_messages ?? null}, ai_alert_prefs.new_messages),
      delays = COALESCE(${body.delays ?? null}, ai_alert_prefs.delays),
      ratings = COALESCE(${body.ratings ?? null}, ai_alert_prefs.ratings),
      sound_enabled = COALESCE(${body.sound_enabled ?? null}, ai_alert_prefs.sound_enabled),
      updated_at = now()
    RETURNING *
  `;
  return c.json(row);
  } catch {
    return c.json(DEFAULT_ALERT_PREFS);
  }
});

// ── Probar conexión (sin guardar) ────────────────────────────
ai.post('/test', auth, async (c) => {
  try {
  const user = c.get('user');
  if (user.role !== 'operator') return c.json({ error: 'Solo operadores' }, 403);

  const body = await c.req.json<{
    provider?: 'gemini' | 'openai';
    gemini_api_key?: string;
    openai_api_key?: string;
    gemini_model?: string;
    openai_model?: string;
    use_env_fallback?: boolean;
  }>();

  const provider = body.provider ?? 'gemini';
  const config = await loadAiConfig(user.tenant_id);

  let apiKey = '';
  if (provider === 'gemini') {
    const typed = body.gemini_api_key?.trim() ? sanitizeApiKey(body.gemini_api_key) : '';
    apiKey = typed
      || config.gemini_api_key
      || ((body.use_env_fallback ?? config.use_env_fallback) ? process.env.GEMINI_API_KEY ?? '' : '');
  } else {
    const typed = body.openai_api_key?.trim() ? sanitizeApiKey(body.openai_api_key) : '';
    apiKey = typed
      || config.openai_api_key
      || ((body.use_env_fallback ?? config.use_env_fallback) ? process.env.OPENAI_API_KEY ?? '' : '');
  }

  if (!apiKey) {
    const hint = provider === 'gemini'
      ? (body.use_env_fallback !== false
        ? 'Pega tu key AQ.… arriba o agrega GEMINI_API_KEY=AQ.… al .env del servidor y redeploy.'
        : 'Pega tu key AQ.… de AI Studio arriba.')
      : 'Configura tu API key de OpenAI.';
    return c.json({ ok: false, message: hint, error: hint }, 400);
  }

  const model = provider === 'gemini'
    ? normalizeGeminiModel(body.gemini_model ?? config.gemini_model)
    : normalizeOpenAiModel(body.openai_model ?? config.openai_model);

  const result = await verifyAiConnection(provider, apiKey, model);
  if (!result.ok) {
    return c.json({ ...result, error: result.message }, 400);
  }
  return c.json(result);
  } catch (err) {
    console.error('[ai/test]', err);
    return c.json({ ok: false, message: safeAiError(err) }, 500);
  }
});

// ── Settings (solo operador) ─────────────────────────────────
ai.get('/settings', auth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'operator') return c.json({ error: 'Solo operadores' }, 403);

  const [row] = await sql`
    SELECT enabled, provider, gemini_api_key, openai_api_key,
           gemini_model, openai_model, use_env_fallback, updated_at
    FROM tenant_ai_settings WHERE tenant_id = ${user.tenant_id}
  `;

  const hasEnvGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasEnvOpenai = Boolean(process.env.OPENAI_API_KEY);

  if (!row) {
    return c.json({
      enabled: true,
      provider: process.env.AI_DEFAULT_PROVIDER ?? 'gemini',
      gemini_model: normalizeGeminiModel(process.env.GEMINI_MODEL),
      openai_model: normalizeOpenAiModel(process.env.OPENAI_MODEL),
      use_env_fallback: true,
      gemini_key_set: hasEnvGemini,
      openai_key_set: hasEnvOpenai,
      env_gemini_configured: hasEnvGemini,
      env_openai_configured: hasEnvOpenai,
      gemini_key_masked: hasEnvGemini ? maskSecret(process.env.GEMINI_API_KEY) : '',
      openai_key_masked: hasEnvOpenai ? maskSecret(process.env.OPENAI_API_KEY) : '',
      updated_at: null,
    });
  }

  return c.json({
    enabled: row.enabled,
    provider: row.provider,
    gemini_model: normalizeGeminiModel(row.gemini_model as string),
    openai_model: normalizeOpenAiModel(row.openai_model as string),
    use_env_fallback: row.use_env_fallback,
    gemini_key_set: Boolean(row.gemini_api_key) || hasEnvGemini,
    openai_key_set: Boolean(row.openai_api_key) || hasEnvOpenai,
    env_gemini_configured: hasEnvGemini,
    env_openai_configured: hasEnvOpenai,
    gemini_key_masked: maskSecret(row.gemini_api_key as string) || (hasEnvGemini ? maskSecret(process.env.GEMINI_API_KEY) : ''),
    openai_key_masked: maskSecret(row.openai_api_key as string) || (hasEnvOpenai ? maskSecret(process.env.OPENAI_API_KEY) : ''),
    updated_at: row.updated_at,
  });
});

ai.put('/settings', auth, async (c) => {
  try {
  const user = c.get('user');
  if (user.role !== 'operator') return c.json({ error: 'Solo operadores' }, 403);

  const body = await c.req.json<{
    enabled?: boolean;
    provider?: 'gemini' | 'openai';
    gemini_api_key?: string;
    openai_api_key?: string;
    gemini_model?: string;
    openai_model?: string;
    use_env_fallback?: boolean;
    clear_gemini_key?: boolean;
    clear_openai_key?: boolean;
  }>();

  let geminiModel = DEFAULT_GEMINI_MODEL;
  let openaiModel = DEFAULT_OPENAI_MODEL;
  try {
    if (body.gemini_model) geminiModel = assertAllowedModel('gemini', body.gemini_model);
    if (body.openai_model) openaiModel = assertAllowedModel('openai', body.openai_model);
    if (body.gemini_api_key?.trim()) assertValidApiKey('gemini', body.gemini_api_key);
    if (body.openai_api_key?.trim()) assertValidApiKey('openai', body.openai_api_key);
  } catch (err) {
    return c.json({ error: safeAiError(err) }, 400);
  }

  const newGeminiPlain = body.gemini_api_key?.trim() ? sanitizeApiKey(body.gemini_api_key) : '';
  const newOpenaiPlain = body.openai_api_key?.trim() ? sanitizeApiKey(body.openai_api_key) : '';

  const [existing] = await sql`
    SELECT gemini_api_key, openai_api_key, gemini_model, openai_model
    FROM tenant_ai_settings WHERE tenant_id = ${user.tenant_id}
  `;

  let geminiKey = existing?.gemini_api_key as string | null;
  let openaiKey = existing?.openai_api_key as string | null;

  if (body.clear_gemini_key) geminiKey = null;
  else if (newGeminiPlain) {
    try {
      geminiKey = encryptSecret(newGeminiPlain);
    } catch (err) {
      return c.json({ error: safeAiError(err) }, 400);
    }
  } else {
    geminiKey = (existing?.gemini_api_key as string | null) ?? null;
  }

  if (body.clear_openai_key) openaiKey = null;
  else if (newOpenaiPlain) {
    try {
      openaiKey = encryptSecret(newOpenaiPlain);
    } catch (err) {
      return c.json({ error: safeAiError(err) }, 400);
    }
  } else {
    openaiKey = (existing?.openai_api_key as string | null) ?? null;
  }

  // Verificación solo con botón «Probar conexión» — guardar es instantáneo
  if (!body.gemini_model && existing?.gemini_model) {
    geminiModel = normalizeGeminiModel(existing.gemini_model as string);
  }
  if (!body.openai_model && existing?.openai_model) {
    openaiModel = normalizeOpenAiModel(existing.openai_model as string);
  }

  const [row] = await sql`
    INSERT INTO tenant_ai_settings (
      tenant_id, enabled, provider, gemini_api_key, openai_api_key,
      gemini_model, openai_model, use_env_fallback, updated_at
    ) VALUES (
      ${user.tenant_id},
      ${body.enabled ?? true},
      ${body.provider ?? 'gemini'},
      ${geminiKey},
      ${openaiKey},
      ${geminiModel},
      ${openaiModel},
      ${body.use_env_fallback ?? true},
      now()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      enabled = COALESCE(${body.enabled ?? null}, tenant_ai_settings.enabled),
      provider = COALESCE(${body.provider ?? null}, tenant_ai_settings.provider),
      gemini_api_key = ${geminiKey},
      openai_api_key = ${openaiKey},
      gemini_model = ${geminiModel},
      openai_model = ${openaiModel},
      use_env_fallback = COALESCE(${body.use_env_fallback ?? null}, tenant_ai_settings.use_env_fallback),
      updated_at = now()
    RETURNING enabled, provider, gemini_model, openai_model, use_env_fallback, updated_at,
              gemini_api_key, openai_api_key
  `;

  return c.json({
    ok: true,
    enabled: row.enabled,
    provider: row.provider,
    gemini_model: row.gemini_model,
    openai_model: row.openai_model,
    use_env_fallback: row.use_env_fallback,
    gemini_key_masked: maskSecret(row.gemini_api_key as string),
    openai_key_masked: maskSecret(row.openai_api_key as string),
    updated_at: row.updated_at,
  });
  } catch (err) {
    console.error('[ai/settings]', err);
    return c.json({ error: safeAiError(err) }, 500);
  }
});

// ── Conversaciones ───────────────────────────────────────────
ai.get('/conversations', auth, async (c) => {
  const user = c.get('user');
  const rows = await sql`
    SELECT id, title, created_at, updated_at
    FROM ai_conversations
    WHERE user_id = ${user.sub} AND tenant_id = ${user.tenant_id}
    ORDER BY updated_at DESC LIMIT 20
  `;
  return c.json(rows);
});

ai.get('/conversations/:id/messages', auth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  const [conv] = await sql`
    SELECT id FROM ai_conversations
    WHERE id = ${id} AND user_id = ${user.sub} AND tenant_id = ${user.tenant_id}
  `;
  if (!conv) return c.json({ error: 'No encontrado' }, 404);

  const messages = await sql`
    SELECT role, content, created_at FROM ai_messages
    WHERE conversation_id = ${id} AND role != 'system'
    ORDER BY created_at ASC
  `;
  return c.json(messages);
});

ai.delete('/conversations/:id', auth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!isValidUuid(id)) return c.json({ error: 'ID inválido' }, 400);

  await sql`
    DELETE FROM ai_conversations
    WHERE id = ${id} AND user_id = ${user.sub} AND tenant_id = ${user.tenant_id}
  `;
  return c.json({ ok: true });
});

// ── Chat ─────────────────────────────────────────────────────
ai.post('/chat', auth, async (c) => {
  const user = c.get('user');

  const rate = checkAiRateLimit(user.sub);
  if (!rate.ok) {
    return c.json({ error: `Demasiadas solicitudes. Espera ${rate.retryAfterSec}s.` }, 429);
  }

  const body = await c.req.json<{ message: string; conversation_id?: string }>();
  const text = sanitizeUserMessage(body.message ?? '');
  if (!text) return c.json({ error: 'Mensaje inválido' }, 400);

  if (body.conversation_id && !isValidUuid(body.conversation_id)) {
    return c.json({ error: 'Conversación inválida' }, 400);
  }

  const config = await loadAiConfig(user.tenant_id);
  if (!config.enabled) return c.json({ error: 'IA desactivada' }, 403);

  let conversationId = body.conversation_id;
  if (conversationId) {
    const [conv] = await sql`
      SELECT id FROM ai_conversations
      WHERE id = ${conversationId} AND user_id = ${user.sub} AND tenant_id = ${user.tenant_id}
    `;
    if (!conv) return c.json({ error: 'Conversación no encontrada' }, 404);
  } else {
    const title = redactSecrets(text.slice(0, 60));
    const [conv] = await sql`
      INSERT INTO ai_conversations (tenant_id, user_id, title)
      VALUES (${user.tenant_id}, ${user.sub}, ${title})
      RETURNING id
    `;
    conversationId = conv.id as string;
  }

  await sql`
    INSERT INTO ai_messages (conversation_id, role, content)
    VALUES (${conversationId}, 'user', ${text})
  `;

  const history = await sql`
    SELECT role, content FROM ai_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC LIMIT 24
  `;

  const tenantName = await getTenantName(user.tenant_id);

  let reply: string;
  try {
    reply = await runAiChat({
      config,
      user,
      tenantName,
      messages: history.map(h => ({
        role: h.role as 'user' | 'assistant' | 'system',
        content: h.content as string,
      })),
    });
  } catch (err) {
    console.error('[AI Chat]', err);
    const msg = safeAiError(err);
    return c.json({ error: msg }, msg.includes('desactivad') || msg.includes('Configura') ? 400 : 502);
  }

  reply = redactSecrets(reply);

  await sql`
    INSERT INTO ai_messages (conversation_id, role, content)
    VALUES (${conversationId}, 'assistant', ${reply})
  `;
  await sql`UPDATE ai_conversations SET updated_at = now() WHERE id = ${conversationId}`;

  return c.json({
    conversation_id: conversationId,
    reply,
    tools_available: toolsForRole(user.role).map(t => t.name),
  });
});

export default ai;
