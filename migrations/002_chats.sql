CREATE TABLE IF NOT EXISTS chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  type TEXT NOT NULL CHECK (type IN ('dm', 'group', 'unknown')),
  last_message TEXT,
  last_sender TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chats_last_message_at_idx
  ON chats (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS chats_type_last_message_at_idx
  ON chats (type, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS chats_name_idx
  ON chats (name);
