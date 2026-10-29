CREATE TABLE IF NOT EXISTS chat_settings (
  jid TEXT PRIMARY KEY,
  personality TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
