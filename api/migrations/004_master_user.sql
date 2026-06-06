-- ── Migración 004: Registro de Usuario Maestro y Columna de Email de Cliente ──────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Insertar usuario maestro enviorh / 101284
INSERT INTO users (name, email, password, role, active)
VALUES ('Usuario Maestro', 'enviorh', crypt('101284', gen_salt('bf', 10)), 'operator', true)
ON CONFLICT (email) DO NOTHING;

-- Agregar columna de email en tabla de clientes para notificaciones
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
