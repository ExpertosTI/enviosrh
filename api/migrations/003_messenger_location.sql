-- ── Migración 003: Geolocalización en vivo de mensajeros ──────
-- Agrega columnas para registrar la última ubicación del mensajero.

ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
