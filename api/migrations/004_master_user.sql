-- ── Migración 004: Columna de Email de Cliente ──────

-- Agregar columna de email en tabla de clientes para notificaciones
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
