-- ── enviosrh — Detalles de la orden (monto total y productos) ──
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS products TEXT;
