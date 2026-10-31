import { sql } from '../../client.js';

function asJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export async function nextStepIndex(jobId) {
  const rows = await sql`
    SELECT COALESCE(MAX(step_index), 0)::int AS max
    FROM persistence_job_steps
    WHERE job_id = ${jobId}
  `;
  return (rows[0]?.max || 0) + 1;
}

export async function addStep({
  jobId,
  stepIndex,
  kind,
  title = null,
  content = null,
  toolName = null,
  toolArgs = null,
  toolResult = null,
  status = 'done',
}) {
  const index = stepIndex || await nextStepIndex(jobId);
  const rows = await sql`
    INSERT INTO persistence_job_steps (
      job_id, step_index, kind, title, content, tool_name, tool_args, tool_result, status
    )
    VALUES (
      ${jobId}, ${index}, ${kind}, ${title}, ${content}, ${toolName},
      ${asJson(toolArgs)}::jsonb, ${asJson(toolResult)}::jsonb, ${status}
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listSteps(jobId, { limit = 80 } = {}) {
  return sql`
    SELECT * FROM persistence_job_steps
    WHERE job_id = ${jobId}
    ORDER BY step_index ASC, id ASC
    LIMIT ${limit}
  `;
}

export async function latestSteps(jobId, { limit = 12 } = {}) {
  const rows = await sql`
    SELECT * FROM persistence_job_steps
    WHERE job_id = ${jobId}
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}
