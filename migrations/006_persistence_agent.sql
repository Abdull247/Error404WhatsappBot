CREATE TABLE IF NOT EXISTS persistence_jobs (
  id TEXT PRIMARY KEY,
  owner_jid TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  chat_type TEXT NOT NULL DEFAULT 'dm',
  push_name TEXT,
  source_message_id TEXT,
  task TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress TEXT,
  result TEXT,
  error TEXT,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_runtime_seconds INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  lease_until TIMESTAMPTZ,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  notify_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS persistence_jobs_chat_created_idx
  ON persistence_jobs (chat_jid, created_at DESC);

CREATE INDEX IF NOT EXISTS persistence_jobs_owner_created_idx
  ON persistence_jobs (owner_jid, created_at DESC);

CREATE INDEX IF NOT EXISTS persistence_jobs_status_created_idx
  ON persistence_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS persistence_jobs_lease_idx
  ON persistence_jobs (status, lease_until);

CREATE TABLE IF NOT EXISTS persistence_job_steps (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  content TEXT,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_job_steps_job_idx
  ON persistence_job_steps (job_id, step_index ASC, id ASC);

CREATE TABLE IF NOT EXISTS persistence_job_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_job_logs_job_idx
  ON persistence_job_logs (job_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS persistence_job_memories (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  importance SMALLINT NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 10),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, key)
);

CREATE INDEX IF NOT EXISTS persistence_job_memories_job_idx
  ON persistence_job_memories (job_id, importance DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS persistence_job_files (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mimetype TEXT,
  size BIGINT,
  storage TEXT NOT NULL DEFAULT 'inline',
  r2_key TEXT,
  url TEXT,
  local_path TEXT,
  sandbox_path TEXT,
  kind TEXT NOT NULL DEFAULT 'attachment',
  readable BOOLEAN NOT NULL DEFAULT FALSE,
  is_image BOOLEAN NOT NULL DEFAULT FALSE,
  text_preview TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_job_files_job_idx
  ON persistence_job_files (job_id, created_at ASC);

CREATE TABLE IF NOT EXISTS persistence_job_notifications (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS persistence_job_notifications_status_idx
  ON persistence_job_notifications (status, created_at ASC);
