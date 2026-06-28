-- ── Asistente IA por tenant ───────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_ai_settings (
  tenant_id         UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  provider          TEXT NOT NULL DEFAULT 'gemini'
    CHECK (provider IN ('gemini', 'openai')),
  gemini_api_key    TEXT,
  openai_api_key    TEXT,
  gemini_model      TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  openai_model      TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  use_env_fallback  BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON ai_messages (conversation_id, created_at ASC);
