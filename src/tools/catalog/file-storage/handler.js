import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../config/env.js';
import { isGroupJid } from '../../../whatsapp/filters.js';
import {
  createStoredFile,
  deleteStoredFile,
  findStoredFileByName,
  getStoredFile,
  listStoredFiles,
} from '../../../db/repositories/files.js';
import { logger } from '../../../utils/logger.js';
import {
  deleteR2Object,
  makeObjectKey,
  r2Configured,
  resolveFileUrl,
  uploadR2Object,
} from '../../../storage/r2.js';

const MIME_BY_EXT = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
};

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || '').trim());
  if (!base || base === '.' || base === '..') throw new Error('filename is required');
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) throw new Error(`invalid filename: ${base}`);
  return base;
}

function requireR2() {
  if (!r2Configured()) {
    return 'R2 storage is not configured (set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT)';
  }
  return null;
}

function mimeFromName(filename) {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function readUploadBuffer(args) {
  if (args.content != null) {
    return Buffer.from(String(args.content), 'utf8');
  }
  if (args.base64) {
    return Buffer.from(String(args.base64), 'base64');
  }
  if (args.path) {
    const raw = String(args.path);
    const abs = path.isAbsolute(raw) ? raw : path.join(env.TOOLS_OUTPUT_DIR, raw);
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${raw}`);
    return fs.readFileSync(abs);
  }
  throw new Error('provide content, base64, or path to upload');
}

function summarize(record, url) {
  return {
    id: record.id,
    filename: record.filename,
    mimetype: record.mimetype,
    size: Number(record.size) || null,
    source: record.source,
    createdAt: record.created_at,
    url,
  };
}

export async function handler(args = {}, context = {}) {
  const action = String(args.action || '').trim().toLowerCase();
  const missing = requireR2();
  if (missing) return { ok: false, error: missing };

  const jid = context.jid;
  if (!jid) return { ok: false, error: 'no WhatsApp chat context' };
  const chatType = isGroupJid(jid) ? 'group' : 'dm';

  try {
    if (action === 'upload') {
      const filename = sanitizeFilename(args.filename);
      const buffer = await readUploadBuffer(args);
      const key = makeObjectKey(jid, filename);
      const mimetype = args.mimetype || mimeFromName(filename);
      const uploaded = await uploadR2Object({ key, body: buffer, contentType: mimetype });
      const record = await createStoredFile({
        id: crypto.randomUUID(),
        jid,
        chatType,
        filename,
        key,
        url: uploaded.url,
        mimetype,
        size: buffer.length,
        source: 'upload',
        metadata: {},
      });
      const url = await resolveFileUrl(record);
      logger.info({ jid, filename, bytes: buffer.length }, 'stored file for chat');
      return { ok: true, action, ...summarize(record, url) };
    }

    if (action === 'list') {
      const records = await listStoredFiles(jid);
      const files = [];
      for (const record of records) {
        try {
          files.push(summarize(record, await resolveFileUrl(record)));
        } catch (error) {
          files.push(summarize(record, null));
        }
      }
      return { ok: true, action, count: files.length, files };
    }

    if (action === 'get') {
      const record = args.id
        ? await getStoredFile(String(args.id), jid)
        : args.filename
          ? await findStoredFileByName(jid, sanitizeFilename(args.filename))
          : null;
      if (!record) {
        return { ok: false, action, error: 'file not found in this chat' };
      }
      const url = await resolveFileUrl(record);
      return { ok: true, action, ...summarize(record, url) };
    }

    if (action === 'delete') {
      const record = args.id
        ? await getStoredFile(String(args.id), jid)
        : args.filename
          ? await findStoredFileByName(jid, sanitizeFilename(args.filename))
          : null;
      if (!record) {
        return { ok: false, action, error: 'file not found in this chat' };
      }
      await deleteStoredFile(record.id, jid);
      await deleteR2Object(record.key).catch((error) => {
        logger.warn({ err: error, key: record.key }, 'failed to delete R2 object');
      });
      logger.info({ jid, id: record.id }, 'deleted stored file');
      return { ok: true, action, deleted: { id: record.id, filename: record.filename } };
    }

    return { ok: false, error: 'action must be upload, get, list, or delete' };
  } catch (error) {
    logger.error({ err: error, action, jid }, 'file_storage action failed');
    return { ok: false, error: error.message };
  }
}
