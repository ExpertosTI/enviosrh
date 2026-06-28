import { decryptSecret } from './aiCrypto.js';
import { executeAiTool, toolsForRole, type AiToolContext } from './aiTools.js';
import type { TokenPayload } from './tokens.js';

export interface TenantAiConfig {
  enabled: boolean;
  provider: 'gemini' | 'openai';
  gemini_api_key: string;
  openai_api_key: string;
  gemini_model: string;
  openai_model: string;
  use_env_fallback: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

function resolveApiKey(config: TenantAiConfig, provider: 'gemini' | 'openai'): string {
  const tenantKey = provider === 'gemini' ? config.gemini_api_key : config.openai_api_key;
  if (tenantKey) return tenantKey;
  if (!config.use_env_fallback) return '';
  return provider === 'gemini'
    ? (process.env.GEMINI_API_KEY ?? '')
    : (process.env.OPENAI_API_KEY ?? '');
}

function buildSystemPrompt(user: TokenPayload, tenantName: string): string {
  const roleLabel = user.role === 'operator' ? 'operador logístico' : 'mensajero';
  return `Eres Renace AI, el asistente inteligente de EnvíosRH para ${tenantName}.
El usuario es ${roleLabel} llamado ${user.name}.

Responde siempre en español, de forma clara, profesional y concisa.
Tienes acceso a herramientas para consultar datos REALES del sistema (envíos, mensajeros, zonas, facturación).
USA las herramientas cuando el usuario pregunte por datos, estadísticas, envíos o mensajeros.
Nunca inventes IDs, montos ni estados — consulta primero.
Puedes: resumir el día, buscar envíos, listar pendientes, analizar mensajeros, explicar cómo usar la app, redactar mensajes al cliente, sugerir asignaciones.
Si no tienes datos suficientes, dilo honestamente.`;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof toolsForRole>,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const openaiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const openaiTools = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: openaiMessages,
      tools: openaiTools.length ? openaiTools : undefined,
      tool_choice: openaiTools.length ? 'auto' : undefined,
      temperature: 0.4,
      max_tokens: 2048,
    }),
  });

  const data = await res.json() as {
    error?: { message?: string };
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
  };

  if (!res.ok) throw new Error(data.error?.message ?? `OpenAI error ${res.status}`);

  const msg = data.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
  }));

  return { content: msg?.content ?? '', toolCalls };
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof toolsForRole>,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const geminiTools = tools.length ? [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }] : undefined;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      tools: geminiTools,
      toolConfig: geminiTools ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });

  const data = await res.json() as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name: string; args?: Record<string, unknown> };
        }>;
      };
    }>;
  };

  if (!res.ok) throw new Error(data.error?.message ?? `Gemini error ${res.status}`);

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const toolCalls: ToolCall[] = [];
  let content = '';

  for (const part of parts) {
    if (part.functionCall) {
      toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
    }
    if (part.text) content += part.text;
  }

  return { content, toolCalls };
}

export async function runAiChat(opts: {
  config: TenantAiConfig;
  user: TokenPayload;
  tenantName: string;
  messages: ChatMessage[];
}): Promise<string> {
  const { config, user, tenantName, messages } = opts;
  if (!config.enabled) throw new Error('El asistente IA está desactivado');

  const provider = config.provider;
  const apiKey = resolveApiKey(config, provider);
  if (!apiKey) {
    throw new Error(
      provider === 'gemini'
        ? 'Configura tu API key de Google Gemini en Ajustes → IA'
        : 'Configura tu API key de OpenAI en Ajustes → IA',
    );
  }

  const tools = toolsForRole(user.role);
  const toolCtx: AiToolContext = { user, tenantId: user.tenant_id };
  const model = provider === 'gemini' ? config.gemini_model : config.openai_model;

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(user, tenantName) },
    ...messages.filter(m => m.role !== 'system'),
  ];

  for (let i = 0; i < 5; i++) {
    const result = provider === 'openai'
      ? await callOpenAI(apiKey, model, chatMessages, tools)
      : await callGemini(apiKey, model, chatMessages, tools);

    if (!result.toolCalls.length) {
      return result.content.trim() || 'Listo. ¿En qué más puedo ayudarte?';
    }

    for (const call of result.toolCalls) {
      const toolResult = await executeAiTool(call.name, call.args, toolCtx);
      const resultText = JSON.stringify(toolResult);
      chatMessages.push({
        role: 'user',
        content: `[Datos del sistema — ${call.name}]: ${resultText}`,
      });
    }
  }

  return 'He consultado los datos. ¿Puedes reformular tu pregunta?';
}

export function parseTenantAiRow(row: Record<string, unknown> | undefined): TenantAiConfig {
  if (!row) {
    return {
      enabled: true,
      provider: (process.env.AI_DEFAULT_PROVIDER as 'gemini' | 'openai') ?? 'gemini',
      gemini_api_key: '',
      openai_api_key: '',
      gemini_model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
      openai_model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      use_env_fallback: true,
    };
  }
  return {
    enabled: Boolean(row.enabled),
    provider: (row.provider as 'gemini' | 'openai') ?? 'gemini',
    gemini_api_key: decryptSecret(row.gemini_api_key as string),
    openai_api_key: decryptSecret(row.openai_api_key as string),
    gemini_model: (row.gemini_model as string) ?? 'gemini-2.0-flash',
    openai_model: (row.openai_model as string) ?? 'gpt-4o-mini',
    use_env_fallback: row.use_env_fallback !== false,
  };
}
