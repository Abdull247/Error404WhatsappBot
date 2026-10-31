import { sql } from '../../client.js';

function asJson(value) {
  return JSON.stringify(value ?? {});
}

export async function insertJobFile(file) {
  const rows = await sql`
    INSERT INTO persistence_job_files (
      id, job_id, filename, mimetype, size, storage, r2_key, url, local_path,
      sandbox_path, kind, readable, is_image, text_preview, metadata
    )
    VALUES (
      ${file.id}, ${file.jobId}, ${file.filename}, ${file.mimetype || null},
      ${file.size || null}, ${file.storage || 'inline'}, ${file.r2Key || null},
      ${file.url || null}, ${file.localPath || null}, ${file.sandboxPath || null},
      ${file.kind || 'attachment'}, ${Boolean(file.readable)}, ${Boolean(file.isImage)},
      ${file.textPreview || null}, ${asJson(file.metadata)}::jsonb
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listJobFiles(jobId) {
  return sql`
    SELECT * FROM persistence_job_files
    WHERE job_id = ${jobId}
    ORDER BY created_at ASC
  `;
}

export async function getJobFile(jobId, idOrName) {
  const rows = await sql`
    SELECT * FROM persistence_job_files
    WHERE job_id = ${jobId}
      AND (id = ${idOrName} OR filename = ${idOrName})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateJobFile(id, patch = {}) {
  const rows = await sql`
    SELECT * FROM persistence_job_files WHERE id = ${id} LIMIT 1
  `;
  const current = rows[0];
  if (!current) return null;
  const sandboxPath = patch.sandboxPath === undefined ? current.sandbox_path : patch.sandboxPath;
  const localPath = patch.localPath === undefined ? current.local_path : patch.localPath;
  const textPreview = patch.textPreview === undefined ? current.text_preview : patch.textPreview;
  const metadata = patch.metadata === undefined ? current.metadata : patch.metadata;
  const updated = await sql`
    UPDATE persistence_job_files SET
      sandbox_path = ${sandboxPath},
      local_path = ${localPath},
      text_preview = ${textPreview},
      metadata = ${asJson(metadata)}::jsonb
    WHERE id = ${id}
    RETURNING *
  `;
  return updated[0] ?? null;
}
