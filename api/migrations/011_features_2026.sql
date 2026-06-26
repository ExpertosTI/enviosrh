-- ── Mejoras 2026: chat avanzado, ubicación, zonas, push ──

-- Confirmación de lectura en mensajes
ALTER TABLE delivery_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Ubicación en vivo del cliente durante entrega
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS customer_latitude  NUMERIC(10,7);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS customer_longitude NUMERIC(10,7);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS customer_location_updated_at TIMESTAMPTZ;

-- Historial de ubicación del mensajero por envío
CREATE TABLE IF NOT EXISTS delivery_location_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  messenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_location_history_delivery_idx
  ON delivery_location_history (delivery_id, recorded_at DESC);

-- Zonas de cobertura con tarifa
CREATE TABLE IF NOT EXISTS coverage_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  polygon     JSONB NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#5b8af9',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coverage_zones_tenant_idx ON coverage_zones (tenant_id);

-- Suscripciones push (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('customer', 'messenger', 'operator')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_delivery_idx ON push_subscriptions (delivery_id);

-- Permitir sender 'operator' en chat
ALTER TABLE delivery_messages DROP CONSTRAINT IF EXISTS delivery_messages_sender_check;
ALTER TABLE delivery_messages ADD CONSTRAINT delivery_messages_sender_check
  CHECK (sender IN ('messenger', 'customer', 'operator'));
