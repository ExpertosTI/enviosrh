-- Preferencias de alertas proactivas del agente IA

CREATE TABLE IF NOT EXISTS ai_alert_prefs (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proactive_enabled BOOLEAN NOT NULL DEFAULT true,
  new_orders        BOOLEAN NOT NULL DEFAULT true,
  assignments       BOOLEAN NOT NULL DEFAULT true,
  in_transit        BOOLEAN NOT NULL DEFAULT true,
  delivered         BOOLEAN NOT NULL DEFAULT true,
  cancelled         BOOLEAN NOT NULL DEFAULT true,
  new_messages      BOOLEAN NOT NULL DEFAULT true,
  delays            BOOLEAN NOT NULL DEFAULT true,
  ratings           BOOLEAN NOT NULL DEFAULT true,
  sound_enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_alert_prefs_tenant_idx ON ai_alert_prefs (tenant_id);
