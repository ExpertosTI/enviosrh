import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth } from '../middleware/auth.js';
import { encryptSecret, maskSecret } from '../lib/aiCrypto.js';
import { runAiChat, parseTenantAiRow } from '../lib/aiEngine.js';
import { AI_TOOL_DEFINITIONS, toolsForRole } from '../lib/aiTools.js';

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
    default_models: {
      gemini: 'gemini-2.0-flash',
      openai: 'gpt-4o-mini',
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
      gemini_model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
      openai_model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
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
    gemini_model: row.gemini_model,
    openai_model: row.openai_model,
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

  const [existing] = await sql`
    SELECT gemini_api_key, openai_api_key FROM tenant_ai_settings WHERE tenant_id = ${user.tenant_id}
  `;

  let geminiKey = existing?.gemini_api_key as string | null;
  let openaiKey = existing?.openai_api_key as string | null;

  if (body.clear_gemini_key) geminiKey = null;
  else if (body.gemini_api_key?.trim()) geminiKey = encryptSecret(body.gemini_api_key.trim());

  if (body.clear_openai_key) openaiKey = null;
  else if (body.openai_api_key?.trim()) openaiKey = encryptSecret(body.openai_api_key.trim());

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
      ${body.gemini_model ?? 'gemini-2.0-flash'},
      ${body.openai_model ?? 'gpt-4o-mini'},
      ${body.use_env_fallback ?? true},
      now()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      enabled = COALESCE(${body.enabled ?? null}, tenant_ai_settings.enabled),
      provider = COALESCE(${body.provider ?? null}, tenant_ai_settings.provider),
      gemini_api_key = ${geminiKey},
      openai_api_key = ${openaiKey},
      gemini_model = COALESCE(${body.gemini_model ?? null}, tenant_ai_settings.gemini_model),
      openai_model = COALESCE(${body.openai_model ?? null}, tenant_ai_settings.openai_model),
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
    WHERE user_id = ${user.sub}
    ORDER BY updated_at DESC LIMIT 20
  `;
  return c.json(rows);
});

ai.get('/conversations/:id/messages', auth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const [conv] = await sql`
    SELECT id FROM ai_conversations WHERE id = ${id} AND user_id = ${user.sub}
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
  await sql`DELETE FROM ai_conversations WHERE id = ${id} AND user_id = ${user.sub}`;
  return c.json({ ok: true });
});

// ── Chat ─────────────────────────────────────────────────────
ai.post('/chat', auth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ message: string; conversation_id?: string }>();
  const text = body.message?.trim();
  if (!text || text.length > 4000) return c.json({ error: 'Mensaje inválido' }, 400);

  const config = await loadAiConfig(user.tenant_id);
  if (!config.enabled) return c.json({ error: 'IA desactivada' }, 403);

  let conversationId = body.conversation_id;
  if (conversationId) {
    const [conv] = await sql`
      SELECT id FROM ai_conversations WHERE id = ${conversationId} AND user_id = ${user.sub}
    `;
    if (!conv) return c.json({ error: 'Conversación no encontrada' }, 404);
  } else {
    const title = text.slice(0, 60);
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
    ORDER BY created_at ASC LIMIT 30
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
    const msg = err instanceof Error ? err.message : 'Error de IA';
    return c.json({ error: msg }, 502);
  }

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
