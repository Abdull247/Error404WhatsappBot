import { sql } from '../../client.js';

function asJson(value) {
  return JSON.stringify(value ?? {});
}

export async function upsertJobMemory({ jobId, key, value, importance = 1, metadata = {} }) {
  const rows = await sql`
    INSERT INTO persistence_job_memories (job_id, key, value, importance, metadata, updated_at)
    VALUES (${jobId}, ${key}, ${value}, ${importance}, ${asJson(metadata)}::jsonb, NOW())
    ON CONFLICT (job_id, key) DO UPDATE SET
      value = EXCLUDED.value,
      importance = EXCLUDED.importance,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listJobMemories(jobId, { limit = 80 } = {}) {
  return sql`
    SELECT * FROM persistence_job_memories
    WHERE job_id = ${jobId}
    ORDER BY importance DESC, updated_at DESC
    LIMIT ${limit}
  `;
}

export async function getJobMemory(jobId, key) {
  const rows = await sql`
    SELECT * FROM persistence_job_memories
    WHERE job_id = ${jobId} AND key = ${key}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function deleteJobMemory(jobId, key) {
  const rows = await sql`
    DELETE FROM persistence_job_memories
    WHERE job_id = ${jobId} AND key = ${key}
    RETURNING *
  `;
  return rows[0] ?? null;
}
