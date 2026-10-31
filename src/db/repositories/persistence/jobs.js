import { sql } from '../../client.js';

function asJson(value) {
  return JSON.stringify(value ?? {});
}

export async function insertJob(job) {
  const rows = await sql`
    INSERT INTO persistence_jobs (
      id, owner_jid, chat_jid, chat_type, push_name, source_message_id,
      task, context, status, progress, metadata, max_runtime_seconds, attempt
    )
    VALUES (
      ${job.id}, ${job.ownerJid}, ${job.chatJid}, ${job.chatType || 'dm'},
      ${job.pushName || null}, ${job.sourceMessageId || null},
      ${job.task}, ${job.context || null}, ${job.status || 'queued'},
      ${job.progress || null}, ${asJson(job.metadata)}::jsonb,
      ${job.maxRuntimeSeconds}, ${job.attempt || 0}
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function getJob(id) {
  const rows = await sql`
    SELECT * FROM persistence_jobs
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getJobForChat(id, chatJid) {
  const rows = await sql`
    SELECT * FROM persistence_jobs
    WHERE id = ${id} AND chat_jid = ${chatJid}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listJobsForChat(chatJid, { limit = 10 } = {}) {
  return sql`
    SELECT * FROM persistence_jobs
    WHERE chat_jid = ${chatJid}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function countActiveJobs() {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM persistence_jobs
    WHERE status IN ('queued', 'starting', 'running', 'waiting')
  `;
  return rows[0]?.count || 0;
}

export async function countRunningJobs() {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM persistence_jobs
    WHERE status IN ('starting', 'running', 'waiting')
  `;
  return rows[0]?.count || 0;
}

export async function listRunningJobs({ limit = 20 } = {}) {
  return sql`
    SELECT * FROM persistence_jobs
    WHERE status IN ('starting', 'running', 'waiting')
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

export async function updateJob(id, patch = {}) {
  const current = await getJob(id);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const progress = patch.progress === undefined ? current.progress : patch.progress;
  const result = patch.result === undefined ? current.result : patch.result;
  const error = patch.error === undefined ? current.error : patch.error;
  const checkpoint = patch.checkpoint === undefined ? current.checkpoint : patch.checkpoint;
  const metadata = patch.metadata === undefined ? current.metadata : patch.metadata;
  const workerId = patch.workerId === undefined ? current.worker_id : patch.workerId;
  const attempt = patch.attempt === undefined ? current.attempt : patch.attempt;
  const cancelRequested = patch.cancelRequested === undefined ? current.cancel_requested : patch.cancelRequested;
  const notifyStatus = patch.notifyStatus === undefined ? current.notify_status : patch.notifyStatus;
  const startedAt = patch.startedAt === undefined ? current.started_at : patch.startedAt;
  const completedAt = patch.completedAt === undefined ? current.completed_at : patch.completedAt;
  const leaseUntil = patch.leaseUntil === undefined ? current.lease_until : patch.leaseUntil;

  const rows = await sql`
    UPDATE persistence_jobs SET
      status = ${status},
      progress = ${progress},
      result = ${result},
      error = ${error},
      checkpoint = ${asJson(checkpoint)}::jsonb,
      metadata = ${asJson(metadata)}::jsonb,
      worker_id = ${workerId},
      attempt = ${attempt},
      cancel_requested = ${Boolean(cancelRequested)},
      notify_status = ${notifyStatus},
      started_at = ${startedAt},
      completed_at = ${completedAt},
      lease_until = ${leaseUntil},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function claimNextJob(workerId, leaseSeconds, maxConcurrent) {
  const active = await sql`
    SELECT COUNT(*)::int AS count
    FROM persistence_jobs
    WHERE status IN ('starting', 'running', 'waiting')
      AND (lease_until IS NULL OR lease_until > NOW())
  `;
  if ((active[0]?.count || 0) >= maxConcurrent) return null;

  const candidates = await sql`
    SELECT id, status
    FROM persistence_jobs
    WHERE cancel_requested = false
      AND (
        status = 'queued'
        OR (
          status IN ('starting', 'running', 'waiting')
          AND (lease_until IS NULL OR lease_until < NOW())
        )
      )
    ORDER BY
      CASE WHEN status = 'queued' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 5
  `;

  for (const row of candidates) {
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const nextStatus = row.status === 'queued' ? 'starting' : row.status;
    const claimed = await sql`
      UPDATE persistence_jobs SET
        status = ${nextStatus},
        worker_id = ${workerId},
        lease_until = ${leaseUntil},
        attempt = attempt + 1,
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
      WHERE id = ${row.id}
        AND cancel_requested = false
        AND (
          status = 'queued'
          OR (
            status IN ('starting', 'running', 'waiting')
            AND (lease_until IS NULL OR lease_until < NOW())
          )
        )
      RETURNING *
    `;
    if (claimed[0]) return claimed[0];
  }
  return null;
}

export async function heartbeatJob(id, workerId, leaseSeconds) {
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const rows = await sql`
    UPDATE persistence_jobs SET
      lease_until = ${leaseUntil},
      updated_at = NOW()
    WHERE id = ${id}
      AND worker_id = ${workerId}
      AND status IN ('starting', 'running', 'waiting')
    RETURNING id, status, cancel_requested, max_runtime_seconds, started_at
  `;
  return rows[0] ?? null;
}

export async function requestCancel(id, chatJid) {
  const rows = await sql`
    UPDATE persistence_jobs SET
      cancel_requested = true,
      updated_at = NOW()
    WHERE id = ${id}
      AND chat_jid = ${chatJid}
      AND status IN ('queued', 'starting', 'running', 'waiting')
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function stats() {
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count
    FROM persistence_jobs
    GROUP BY status
  `;
  const byStatus = {};
  for (const row of rows) byStatus[row.status] = row.count;
  return byStatus;
}
