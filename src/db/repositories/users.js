import { sql } from '../client.js';

export async function upsertUser(jid, pushName = null) {
  const rows = await sql`
    INSERT INTO users (jid, push_name, last_seen_at, updated_at)
    VALUES (${jid}, ${pushName}, NOW(), NOW())
    ON CONFLICT (jid) DO UPDATE SET
      push_name = COALESCE(EXCLUDED.push_name, users.push_name),
      last_seen_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0];
}

export async function getUser(jid) {
  const rows = await sql`SELECT * FROM users WHERE jid = ${jid} LIMIT 1`;
  return rows[0] ?? null;
}
