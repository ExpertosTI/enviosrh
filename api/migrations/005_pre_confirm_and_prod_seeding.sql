-- ── Migración 005: Pre-confirmación del cliente y limpieza de producción ──

-- Agregar columnas de pre-confirmación en deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pre_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pre_confirmed_at TIMESTAMPTZ;

