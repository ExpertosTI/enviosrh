-- Migrar modelos Gemini/OpenAI deprecados a IDs estables 2026

UPDATE tenant_ai_settings SET gemini_model = 'gemini-2.5-flash'
WHERE gemini_model IN (
  'gemini-2.0-flash', 'gemini-2.0-flash-lite',
  'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-pro'
);

UPDATE tenant_ai_settings SET gemini_model = 'gemini-2.5-pro'
WHERE gemini_model = 'gemini-1.5-pro';

UPDATE tenant_ai_settings SET openai_model = 'gpt-4.1-mini'
WHERE openai_model IN ('gpt-3.5-turbo', 'gpt-3.5-turbo-16k');

ALTER TABLE tenant_ai_settings
  ALTER COLUMN gemini_model SET DEFAULT 'gemini-2.5-flash';

ALTER TABLE tenant_ai_settings
  ALTER COLUMN openai_model SET DEFAULT 'gpt-4.1-mini';
