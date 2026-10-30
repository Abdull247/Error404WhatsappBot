CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  jid TEXT NOT NULL,
  chat_type TEXT NOT NULL DEFAULT 'dm',
  filename TEXT NOT NULL,
  key TEXT NOT NULL,
  url TEXT,
  mimetype TEXT,
  size BIGINT,
  source TEXT NOT NULL DEFAULT 'upload',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stored_files_jid_created_idx
  ON stored_files (jid, created_at DESC);

CREATE INDEX IF NOT EXISTS stored_files_jid_filename_idx
  ON stored_files (jid, filename);
