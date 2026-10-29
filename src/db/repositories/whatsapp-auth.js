import { sql } from '../client.js';

export async function getAuthRow(id) {
  const rows = await sql`SELECT data FROM whatsapp_auth WHERE id = ${id} LIMIT 1`;
  return rows[0]?.data ?? null;
}

export async function listAuthRows(ids) {
  if (!ids.length) return [];
  return sql`
    SELECT id, data
    FROM whatsapp_auth
    WHERE id = ANY(${ids})
  `;
}

export async function upsertAuthRow(id, data) {
  await sql`
    INSERT INTO whatsapp_auth (id, data, updated_at)
    VALUES (${id}, ${data}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

export async function deleteAuthRow(id) {
  await sql`DELETE FROM whatsapp_auth WHERE id = ${id}`;
}
