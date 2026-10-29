import { sql } from '../client.js';

export async function getChatSettings(jid) {
  const rows = await sql`SELECT * FROM chat_settings WHERE jid = ${jid} LIMIT 1`;
  return rows[0] ?? null;
}

export async function setChatPersonality(jid, personality) {
  const rows = await sql`
    INSERT INTO chat_settings (jid, personality, updated_at)
    VALUES (${jid}, ${personality}, NOW())
    ON CONFLICT (jid) DO UPDATE SET
      personality = EXCLUDED.personality,
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0];
}
