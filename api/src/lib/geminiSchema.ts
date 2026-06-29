/** Convierte JSON Schema (OpenAPI) a formato Schema de Gemini API */

const TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
};

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'OBJECT', properties: {} };
  }

  const s = schema as Record<string, unknown>;
  const rawType = String(s.type ?? 'object').toUpperCase();
  const normalized = TYPE_MAP[rawType.toLowerCase()] ?? (TYPE_MAP[rawType] ? rawType : 'OBJECT');

  const out: Record<string, unknown> = { type: normalized };

  if (typeof s.description === 'string') out.description = s.description;
  if (typeof s.format === 'string') out.format = s.format;

  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(s.properties as Record<string, unknown>)) {
      props[key] = toGeminiSchema(val);
    }
    out.properties = props;
  } else if (normalized === 'OBJECT') {
    out.properties = {};
  }

  if (Array.isArray(s.required) && s.required.length > 0) {
    out.required = s.required;
  }

  if (s.items) {
    out.items = toGeminiSchema(s.items);
  }

  if (s.enum) out.enum = s.enum;

  return out;
}
