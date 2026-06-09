-- ── enviosrh — Mensajes de Chat ──
CREATE TABLE IF NOT EXISTS delivery_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID        NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  sender      TEXT        NOT NULL CHECK (sender IN ('messenger', 'customer')),
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_messages_delivery_idx ON delivery_messages (delivery_id);
CREATE INDEX IF NOT EXISTS delivery_messages_created_at_idx ON delivery_messages (created_at ASC);
