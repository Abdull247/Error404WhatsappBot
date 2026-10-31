import { sql } from '../../client.js';

function asJson(value) {
  return JSON.stringify(value ?? {});
}

export async function addLog({ jobId, level = 'info', message, data = {} }) {
  const rows = await sql`
    INSERT INTO persistence_job_logs (job_id, level, message, data)
    VALUES (${jobId}, ${level}, ${message}, ${asJson(data)}::jsonb)
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listLogs(jobId, { limit = 40 } = {}) {
  const rows = await sql`
    SELECT * FROM persistence_job_logs
    WHERE job_id = ${jobId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}
