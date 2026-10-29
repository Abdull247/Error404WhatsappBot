import { BufferJSON, initAuthCreds, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { env, ensureSessionDir } from '../config/env.js';
import {
  deleteAuthRow,
  getAuthRow,
  listAuthRows,
  upsertAuthRow,
} from '../db/repositories/whatsapp-auth.js';
import { logger } from '../utils/logger.js';

function serialize(value) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(raw) {
  if (!raw) return null;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try {
    return JSON.parse(text, BufferJSON.reviver);
  } catch (error) {
    logger.warn({ err: error }, 'failed to parse WhatsApp auth row');
    return null;
  }
}

async function usePostgresAuthState() {
  const creds = deserialize(await getAuthRow('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const rows = await listAuthRows(ids.map((id) => `${type}-${id}`));
          const byId = new Map(rows.map((row) => [row.id, deserialize(row.data)]));
          const data = {};
          for (const id of ids) {
            const value = byId.get(`${type}-${id}`);
            if (value) data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data || {})) {
            for (const id of Object.keys(data[category] || {})) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value
                ? upsertAuthRow(key, serialize(value))
                : deleteAuthRow(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await upsertAuthRow('creds', serialize(creds));
    },
  };
}

export async function createAuthState() {
  if (env.WHATSAPP_AUTH_STORE === 'postgres') {
    logger.info('using Neon Postgres for WhatsApp session');
    return usePostgresAuthState();
  }

  ensureSessionDir();
  logger.info({ dir: env.WHATSAPP_SESSION_DIR }, 'using local files for WhatsApp session');
  return useMultiFileAuthState(env.WHATSAPP_SESSION_DIR);
}
