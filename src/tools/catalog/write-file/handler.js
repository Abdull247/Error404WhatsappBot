import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const MIME_BY_EXT = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.md': 'text/markdown',
};

function safeJid(jid) {
  return String(jid || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || '').trim());
  if (!base || base === '.' || base === '..') {
    throw new Error('filename is required');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new Error(`invalid filename: ${base}`);
  }
  return base;
}

function writeOne({ filename, content }, options, context) {
  const name = sanitizeFilename(filename);
  const ext = path.extname(name).toLowerCase();
  const allowed = options.allowedExtensions || [];
  if (!allowed.includes(ext)) {
    throw new Error(`extension ${ext || '(none)'} is not allowed`);
  }

  const body = content == null ? '' : String(content);
  const maxBytes = options.maxBytes || 1048576;
  const size = Buffer.byteLength(body, 'utf8');
  if (size > maxBytes) {
    throw new Error(`file too large: ${size} bytes`);
  }

  const dir = path.join(env.TOOLS_OUTPUT_DIR, safeJid(context.jid));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, body, 'utf8');

  logger.info({ filePath, size }, 'wrote tool file');
  return {
    ok: true,
    filename: name,
    path: filePath,
    mimetype: MIME_BY_EXT[ext] || 'text/plain',
    size,
    attachment: true,
  };
}

export async function handler(args = {}, context = {}, options = {}) {
  const items = [];
  if (Array.isArray(args.files) && args.files.length) {
    items.push(...args.files);
  } else if (args.filename) {
    items.push({ filename: args.filename, content: args.content });
  }

  if (!items.length) {
    return { ok: false, error: 'Provide filename and content, or a files array.' };
  }

  const written = [];
  for (const item of items) {
    try {
      written.push(writeOne(item, options, context));
    } catch (error) {
      written.push({
        ok: false,
        filename: item?.filename || null,
        error: error.message,
      });
    }
  }

  return {
    ok: written.every((item) => item.ok),
    files: written,
  };
}
