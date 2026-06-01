-- ── Migración 002: Soportar rol "pending" ────────────────────
-- Permite que los nuevos registros queden en espera.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('operator', 'messenger', 'pending'));
