-- ── enviosrh — Campo Área/Zona para Direcciones ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS area_zone TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS area_zone TEXT;
