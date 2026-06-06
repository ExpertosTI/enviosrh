-- ── Migración 006: Esquema Multi-Tenant y Branding ──

-- 1. Crear tabla de inquilinos
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT          NOT NULL,
  slug            TEXT          UNIQUE NOT NULL,
  logo_url        TEXT,         -- Guarda el logotipo en Base64 o URL
  primary_color   TEXT          NOT NULL DEFAULT '#5b8af9',
  secondary_color TEXT          NOT NULL DEFAULT '#4f46e5',
  accent_color    TEXT          NOT NULL DEFAULT '#f59e0b',
  theme_mode      TEXT          NOT NULL DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark', 'glass')),
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 2. Insertar inquilino por defecto
INSERT INTO tenants (id, name, slug, primary_color, secondary_color, accent_color, theme_mode)
VALUES ('d0000000-0000-0000-0000-000000000000', 'EnvíosRH', 'enviosrh', '#5b8af9', '#4f46e5', '#f59e0b', 'light')
ON CONFLICT (slug) DO NOTHING;

-- 3. Modificar usuarios
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
UPDATE users SET tenant_id = 'd0000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Modificar clientes
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE customers SET tenant_id = 'd0000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;

-- Cambiar índice único de teléfono a único por inquilino
DROP INDEX IF EXISTS customers_phone_idx;
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_idx ON customers (tenant_id, phone);

-- 5. Modificar envíos
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE deliveries SET tenant_id = 'd0000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
ALTER TABLE deliveries ALTER COLUMN tenant_id SET NOT NULL;
