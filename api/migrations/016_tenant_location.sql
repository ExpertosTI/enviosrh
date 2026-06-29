-- Ubicación GPS de la empresa (origen de despacho)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
