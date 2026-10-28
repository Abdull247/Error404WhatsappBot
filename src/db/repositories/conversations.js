import { sql } from '../client.js';

export async function addMessage({ jid, role, content, metadata = {} }) {
  const rows = await sql`
    INSERT INTO conversations (jid, role, content, metadata)
    VALUES (${jid}, ${role}, ${content}, ${JSON.stringify(metadata)}::jsonb)
    RETURNING *
  `;
  return rows[0];
}

export async function getRecentMessages(jid, limit = 20) {
  const rows = await sql`
    SELECT id, jid, role, content, metadata, created_at
    FROM conversations
    WHERE jid = ${jid}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}
