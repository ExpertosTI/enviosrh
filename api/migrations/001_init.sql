-- ── enviosrh — Esquema inicial ───────────────────────────────
-- Logística pura: sin montos de orden, sin facturación.
-- El único valor monetario es el costo del envío (puede ser 0).

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USUARIOS (operadores y mensajeros) ───────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT        UNIQUE,
  password    TEXT        NOT NULL,  -- bcrypt hash
  role        TEXT        NOT NULL CHECK (role IN ('operator', 'messenger')),
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── CLIENTES ────────────────────────────────────────────────
-- Creados al vuelo al registrar un envío; se reutilizan por teléfono.
CREATE TABLE IF NOT EXISTS customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  address     TEXT,
  reference   TEXT,          -- referencia del lugar ("frente al parque")
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);

-- ─── ENVÍOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencia al cliente
  customer_id       UUID        NOT NULL REFERENCES customers(id),

  -- Datos de ubicación / ruta
  location_link     TEXT,        -- link de WhatsApp / Google Maps pegado por operador
  address_override  TEXT,        -- si quiere cambiar la dirección en este envío

  -- Costo del envío (solo logística; 0 = gratis)
  delivery_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Estado del flujo
  state             TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','assigned','in_transit','delivered','cancelled')),

  -- Asignación
  messenger_id      UUID        REFERENCES users(id),
  assigned_at       TIMESTAMPTZ,

  -- Confirmación
  delivered_at      TIMESTAMPTZ,
  messenger_note    TEXT,

  -- Confirmación del cliente
  customer_confirmed  BOOLEAN   NOT NULL DEFAULT false,
  customer_confirmed_at TIMESTAMPTZ,

  -- Calificación del cliente (1–5)
  rating            SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  rating_note       TEXT,

  -- Tokens de acceso público (firmados, no predecibles)
  customer_token    TEXT        UNIQUE DEFAULT encode(gen_random_bytes(20), 'hex'),
  messenger_token   TEXT        UNIQUE DEFAULT encode(gen_random_bytes(20), 'hex'),

  -- Referencia externa para integración futura (Citrus, etc.)
  external_ref      TEXT,        -- ID o número de pedido en el sistema externo
  external_source   TEXT,        -- ej: 'citrus', 'manual'

  -- Auditoría
  operator_id       UUID        REFERENCES users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_state_idx       ON deliveries (state);
CREATE INDEX IF NOT EXISTS deliveries_messenger_idx   ON deliveries (messenger_id);
CREATE INDEX IF NOT EXISTS deliveries_created_at_idx  ON deliveries (created_at DESC);
CREATE INDEX IF NOT EXISTS deliveries_customer_token  ON deliveries (customer_token);
CREATE INDEX IF NOT EXISTS deliveries_messenger_token ON deliveries (messenger_token);

-- ─── EVENTOS / TRAZABILIDAD ───────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id   UUID        NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  state         TEXT        NOT NULL,
  actor_id      UUID,        -- user que generó el evento (null = sistema / cliente)
  actor_role    TEXT,        -- 'operator' | 'messenger' | 'customer' | 'system'
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_events_delivery_idx ON delivery_events (delivery_id);

-- ─── TRIGGER: updated_at automático ──────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── USUARIO ADMIN POR DEFECTO (cambiar contraseña al desplegar)
-- Contraseña: "cambiar123" — bcrypt hash generado con 10 rounds
INSERT INTO users (name, email, phone, password, role)
VALUES (
  'Administrador',
  'admin@enviosrh.local',
  NULL,
  '$2b$10$YzQ3N2E4YjFjMzQ5ZDVlO.WcLkM9fJ8kXpA6r1sQ0vT2mNuY7bHVO',
  'operator'
) ON CONFLICT (email) DO NOTHING;
