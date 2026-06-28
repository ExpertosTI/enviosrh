import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth } from '../middleware/auth.js';
import { encryptSecret, maskSecret } from '../lib/aiCrypto.js';
import { runAiChat, parseTenantAiRow } from '../lib/aiEngine.js';
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
  sanitizeUserMessage,
} from '../lib/aiSecurity.js';
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
          '¿Cuántos envíos pendientes hay hoy?',
          'Resumen de la semana',
          'Lista los mensajeros activos',
          'Busca envíos en tránsito',
          '¿Cuánto llevamos facturado este mes?',
        ]
      : [
          '¿Cuáles son mis envíos activos?',
          '¿Cómo confirmo una entrega?',
          'Consejos para llegar más rápido',
        ],
  });
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
    gemini_key_masked: maskSecret(row.gemini_api_key as string) || (hasEnvGemini ? maskSecret(process.env.GEMINI_API_KEY) : ''),
    openai_key_masked: maskSecret(row.openai_api_key as string) || (hasEnvOpenai ? maskSecret(process.env.OPENAI_API_KEY) : ''),
    updated_at: row.updated_at,
  });
});

ai.put('/settings', auth, async (c) => {
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
    if (body.gemini_api_key?.trim()) assertValidApiKey('gemini', body.gemini_api_key.trim());
    if (body.openai_api_key?.trim()) assertValidApiKey('openai', body.openai_api_key.trim());
  } catch (err) {
    return c.json({ error: safeAiError(err) }, 400);
  }

  const [existing] = await sql`
    SELECT gemini_api_key, openai_api_key, gemini_model, openai_model
    FROM tenant_ai_settings WHERE tenant_id = ${user.tenant_id}
  `;

  let geminiKey = existing?.gemini_api_key as string | null;
  let openaiKey = existing?.openai_api_key as string | null;

  if (body.clear_gemini_key) geminiKey = null;
  else if (body.gemini_api_key?.trim()) geminiKey = encryptSecret(body.gemini_api_key.trim());

  if (body.clear_openai_key) openaiKey = null;
  else if (body.openai_api_key?.trim()) openaiKey = encryptSecret(body.openai_api_key.trim());

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
    return c.json({ error: safeAiError(err) }, 502);
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
