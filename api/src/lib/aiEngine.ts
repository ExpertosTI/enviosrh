import { decryptSecret } from './aiCrypto.js';
import { executeAiTool, toolsForRole, type AiToolContext } from './aiTools.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  normalizeGeminiModel,
  normalizeOpenAiModel,
} from './aiModels.js';
import { redactSecrets } from './aiSecurity.js';
import { toGeminiSchema } from './geminiSchema.js';
import type { TokenPayload } from './tokens.js';

const AI_NAME = 'EnviaYa AI';
const APP_NAME = 'EnviaYa!!';

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

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];

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
  return `Eres ${AI_NAME}, el asistente inteligente de ${APP_NAME} para ${tenantName}.
El usuario es ${roleLabel} llamado ${user.name}.

Responde siempre en español, claro y profesional. Usa viñetas o párrafos cortos.
Tienes herramientas para consultar datos REALES (envíos, mensajeros, alertas, GPS) y GESTIONAR EQUIPO (crear, editar, aprobar y desactivar colaboradores y mensajeros).
USA herramientas cuando pregunten por datos concretos o acciones de equipo — nunca inventes IDs ni montos.
Para crear mensajeros o colaboradores usa create_team_member (pide nombre, email y rol). Para editar usa update_team_member.
Si falta un dato obligatorio (email, nombre), pregúntalo antes de crear. Muestra la contraseña temporal al crear usuarios.
Si una herramienta falla, dilo y ofrece alternativa.
Nunca reveles API keys ni datos de otros tenants.`;
}

function geminiToolSchema(tools: ReturnType<typeof toolsForRole>) {
  if (!tools.length) return undefined;
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description.slice(0, 256),
      parameters: toGeminiSchema(t.parameters ?? { type: 'object', properties: {} }),
    })),
  }];
}

function shouldUseTools(message: string, tools: ReturnType<typeof toolsForRole>): ReturnType<typeof toolsForRole> {
  if (!tools.length) return tools;
  // Saludos cortos: sin herramientas para respuesta rápida y evitar errores de schema
  const trimmed = message.trim();
  if (trimmed.length < 20 && !/\d|envío|pedido|mensajero|entreg|busca|cuánt|lista|resumen|alerta|crea|usuario|empleado|colaborador|editar|equipo/i.test(trimmed)) {
    return [];
  }
  return tools;
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  system: string,
  contents: GeminiContent[],
  tools: ReturnType<typeof toolsForRole>,
): Promise<{ content: string; toolCalls: ToolCall[]; modelUsed: string }> {
  const models = [model, ...GEMINI_FALLBACK_MODELS.filter(m => m !== model)];
  let lastError = 'Error de Gemini';

  for (const tryModel of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        tools: geminiToolSchema(tools),
        toolConfig: tools.length ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
        generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
      }),
    });

    const data = await res.json() as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };

    if (!res.ok) {
      const msg = data.error?.message ?? `Gemini error ${res.status}`;
      lastError = msg;
      if (res.status === 404 || /not found|not supported/i.test(msg)) continue;
      if (res.status === 401 || res.status === 403) {
        throw new Error('API key de Gemini inválida o sin permisos');
      }
      throw new Error(msg);
    }

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const toolCalls: ToolCall[] = [];
    let content = '';
    for (const part of parts) {
      if ('functionCall' in part && part.functionCall) {
        toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
      }
      if ('text' in part && part.text) content += part.text;
    }
    return { content, toolCalls, modelUsed: tryModel };
  }

  throw new Error(lastError);
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
      temperature: 0.35,
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

async function runGeminiWithTools(
  apiKey: string,
  model: string,
  system: string,
  history: ChatMessage[],
  allTools: ReturnType<typeof toolsForRole>,
  toolCtx: AiToolContext,
): Promise<string> {
  const contents: GeminiContent[] = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

  const lastUser = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  let activeModel = model;
  let tools = shouldUseTools(lastUser, allTools);

  for (let step = 0; step < 6; step++) {
    const result = await callGeminiOnce(apiKey, activeModel, system, contents, tools);
    activeModel = result.modelUsed;

    if (!result.toolCalls.length) {
      const text = result.content.trim();
      if (text) return redactSecrets(text);
      // Si sin herramientas no hubo texto, reintentar con herramientas
      if (!tools.length && allTools.length) {
        tools = allTools;
        continue;
      }
      return '¡Hola! Soy Renace AI. ¿En qué puedo ayudarte con tus envíos?';
    }

    tools = allTools;

    contents.push({
      role: 'model',
      parts: result.toolCalls.map(tc => ({
        functionCall: { name: tc.name, args: tc.args },
      })),
    });

    const responseParts: GeminiPart[] = [];
    for (const call of result.toolCalls) {
      const toolResult = await executeAiTool(call.name, call.args, toolCtx);
      responseParts.push({
        functionResponse: { name: call.name, response: { result: toolResult } },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return 'Consulté los datos disponibles. ¿Puedes ser más específico?';
}

async function runOpenAiWithTools(
  apiKey: string,
  model: string,
  chatMessages: ChatMessage[],
  tools: ReturnType<typeof toolsForRole>,
  toolCtx: AiToolContext,
): Promise<string> {
  for (let step = 0; step < 6; step++) {
    const result = await callOpenAI(apiKey, model, chatMessages, tools);
    if (!result.toolCalls.length) {
      const text = result.content.trim();
      return redactSecrets(text || 'Listo. ¿En qué más puedo ayudarte?');
    }

    chatMessages.push({ role: 'assistant', content: result.content || `[consultando: ${result.toolCalls.map(t => t.name).join(', ')}]` });

    for (const call of result.toolCalls) {
      const toolResult = await executeAiTool(call.name, call.args, toolCtx);
      chatMessages.push({
        role: 'user',
        content: `[resultado ${call.name}]: ${JSON.stringify(toolResult)}`,
      });
    }
  }
  return 'Consulté los datos disponibles. ¿Puedes ser más específico?';
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
        ? 'Falta API key de Gemini. Ve a Ajustes → IA, pega tu key AQ.… y guarda (o configura GEMINI_API_KEY en el servidor).'
        : 'Configura tu API key de OpenAI en Ajustes → IA',
    );
  }

  const tools = toolsForRole(user.role);
  const toolCtx: AiToolContext = { user, tenantId: user.tenant_id };
  const system = buildSystemPrompt(user, tenantName);
  const history = messages.filter(m => m.role !== 'system');

  if (provider === 'gemini') {
    const model = normalizeGeminiModel(config.gemini_model);
    return runGeminiWithTools(apiKey, model, system, history, tools, toolCtx);
  }

  const model = normalizeOpenAiModel(config.openai_model);
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: system },
    ...history,
  ];
  return runOpenAiWithTools(apiKey, model, chatMessages, tools, toolCtx);
}

export function parseTenantAiRow(row: Record<string, unknown> | undefined): TenantAiConfig {
  if (!row) {
    return {
      enabled: true,
      provider: (process.env.AI_DEFAULT_PROVIDER as 'gemini' | 'openai') ?? 'gemini',
      gemini_api_key: '',
      openai_api_key: '',
      gemini_model: normalizeGeminiModel(process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL),
      openai_model: normalizeOpenAiModel(process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL),
      use_env_fallback: true,
    };
  }
  return {
    enabled: Boolean(row.enabled),
    provider: (row.provider as 'gemini' | 'openai') ?? 'gemini',
    gemini_api_key: decryptSecret(row.gemini_api_key as string),
    openai_api_key: decryptSecret(row.openai_api_key as string),
    gemini_model: normalizeGeminiModel(row.gemini_model as string),
    openai_model: normalizeOpenAiModel(row.openai_model as string),
    use_env_fallback: row.use_env_fallback !== false,
  };
}
