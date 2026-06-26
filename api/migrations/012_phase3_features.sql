-- ── Fase 3: push, reglas, billing, geofence, white-label ──

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions (endpoint);

CREATE TABLE IF NOT EXISTS assign_rules (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  strategy        TEXT NOT NULL DEFAULT 'nearest'
    CHECK (strategy IN ('nearest', 'least_load', 'zone', 'round_robin')),
  zone_priority   BOOLEAN NOT NULL DEFAULT false,
  max_active_load INT NOT NULL DEFAULT 5,
  schedule_start  TIME,
  schedule_end    TIME,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS at_destination_at TIMESTAMPTZ;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS favicon_url TEXT;

CREATE TABLE IF NOT EXISTS billing_periods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_deliveries    INT NOT NULL DEFAULT 0,
  total_fees          NUMERIC(12,2) NOT NULL DEFAULT 0,
  messenger_commissions JSONB NOT NULL DEFAULT '[]',
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_periods_tenant_idx ON billing_periods (tenant_id, period_start DESC);

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  role        TEXT NOT NULL CHECK (role IN ('customer', 'messenger', 'operator')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_token_idx ON device_push_tokens (token);
