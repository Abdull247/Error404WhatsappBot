import { sql } from '../../client.js';

export async function enqueueNotification({ jobId, event, payload = null }) {
  const rows = await sql`
    INSERT INTO persistence_job_notifications (job_id, event, status, payload)
    VALUES (${jobId}, ${event}, 'pending', ${payload})
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listPendingNotifications({ limit = 10 } = {}) {
  return sql`
    SELECT * FROM persistence_job_notifications
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

export async function markNotificationSent(id) {
  const rows = await sql`
    UPDATE persistence_job_notifications SET
      status = 'sent',
      sent_at = NOW(),
      attempts = attempts + 1
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function markNotificationFailed(id, error) {
  const rows = await sql`
    UPDATE persistence_job_notifications SET
      status = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END,
      error = ${error},
      attempts = attempts + 1
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}
