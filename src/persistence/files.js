import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createFileId } from './ids.js';
import { clip } from './format.js';
import { insertJobFile, listJobFiles, getJobFile, updateJobFile } from '../db/repositories/persistence/files.js';
import { makeObjectKey, r2Configured, uploadR2Object, presignR2Url } from '../storage/r2.js';
import { unwrapMessageContent } from '../whatsapp/filters.js';
import { logger } from '../utils/logger.js';

const TEXT_EXT = new Set([
  '.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.yaml', '.yml', '.html', '.css', '.js',
  '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.c', '.h',
  '.cpp', '.sql', '.sh', '.env', '.toml', '.ini', '.log', '.conf',
]);

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-sh|x-yaml|toml))/i;
const IMAGE_MIME = /^image\//i;
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_INLINE_IMAGE = 2 * 1024 * 1024;

function attachmentFromMessage(message) {
  const content = unwrapMessageContent(message);
  return content.documentMessage || content.imageMessage || content.videoMessage || null;
}

function filenameOf(attachment) {
  const mime = String(attachment.mimetype || 'application/octet-stream').split(';')[0].trim();
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '');
  return String(
    attachment.fileName
    || attachment.title
    || `${mime.split('/')[0] || 'file'}-${Date.now()}.${ext || 'bin'}`,
  );
}

export function isImageFile(mimetype, filename = '') {
  return IMAGE_MIME.test(mimetype || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename);
}

export function isReadableFile(mimetype, filename = '') {
  if (TEXT_MIME.test(mimetype || '')) return true;
  return TEXT_EXT.has(path.extname(filename || '').toLowerCase());
}

function previewFromBuffer(buffer, mimetype, filename) {
  if (!isReadableFile(mimetype, filename)) return null;
  const slice = buffer.length > MAX_TEXT_BYTES ? buffer.subarray(0, MAX_TEXT_BYTES) : buffer;
  return clip(slice.toString('utf8'), 180000);
}

export async function captureMessageAttachments({ sock, message, jobId, jid }) {
  const attachment = attachmentFromMessage(message);
  if (!attachment) return [];

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { logger, reuploadRequest: sock?.updateMediaMessage },
    );
  } catch (error) {
    logger.warn({ err: error, jobId }, 'failed to download persistence attachment');
    return [];
  }
  if (!buffer?.length) return [];

  const filename = filenameOf(attachment);
  const mimetype = String(attachment.mimetype || 'application/octet-stream').split(';')[0].trim();
  const readable = isReadableFile(mimetype, filename);
  const image = isImageFile(mimetype, filename);
  let r2Key = null;
  let url = null;
  let storage = 'inline';
  const metadata = {};

  if (r2Configured()) {
    try {
      const key = makeObjectKey(`persistence/${jobId}`, filename);
      const uploaded = await uploadR2Object({ key, body: buffer, contentType: mimetype });
      r2Key = uploaded.key;
      url = uploaded.url;
      storage = 'r2';
    } catch (error) {
      logger.warn({ err: error, jobId, filename }, 'failed to upload persistence attachment to R2');
    }
  }

  if (image && storage !== 'r2' && buffer.length <= MAX_INLINE_IMAGE) {
    metadata.base64 = Buffer.from(buffer).toString('base64');
    storage = 'inline';
  }

  const record = await insertJobFile({
    id: createFileId(),
    jobId,
    filename,
    mimetype,
    size: buffer.length,
    storage,
    r2Key,
    url,
    kind: 'attachment',
    readable,
    isImage: image,
    textPreview: previewFromBuffer(buffer, mimetype, filename),
    metadata,
  });
  return record ? [{ ...record, buffer }] : [];
}

export async function loadJobFiles(jobId) {
  return listJobFiles(jobId);
}

async function bufferFromRecord(record) {
  if (record.metadata?.base64) {
    return Buffer.from(record.metadata.base64, 'base64');
  }
  if (record.r2_key && r2Configured()) {
    const url = record.url || await presignR2Url(record.r2_key);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to download stored file (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (record.text_preview) {
    return Buffer.from(record.text_preview, 'utf8');
  }
  return null;
}

export async function readJobAttachment(jobId, idOrName, { includeImageBytes = false } = {}) {
  const record = await getJobFile(jobId, idOrName);
  if (!record) return { ok: false, error: `attachment not found: ${idOrName}` };

  if (record.readable && record.text_preview) {
    return {
      ok: true,
      id: record.id,
      filename: record.filename,
      mimetype: record.mimetype,
      kind: 'text',
      path: record.sandbox_path || null,
      content: record.text_preview,
    };
  }

  if (record.is_image) {
    if (!includeImageBytes) {
      return {
        ok: true,
        id: record.id,
        filename: record.filename,
        mimetype: record.mimetype,
        kind: 'image',
        path: record.sandbox_path || null,
        note: 'Image attached. Vision is disabled for this persistence model, so describe from filename/context only.',
      };
    }
    const buffer = await bufferFromRecord(record);
    if (!buffer) return { ok: false, error: 'image bytes are not available' };
    return {
      ok: true,
      id: record.id,
      filename: record.filename,
      mimetype: record.mimetype || 'image/jpeg',
      kind: 'image',
      path: record.sandbox_path || null,
      base64: buffer.toString('base64'),
    };
  }

  const buffer = await bufferFromRecord(record);
  if (buffer && isReadableFile(record.mimetype, record.filename)) {
    const content = clip(buffer.toString('utf8'), 180000);
    await updateJobFile(record.id, { textPreview: content });
    return {
      ok: true,
      id: record.id,
      filename: record.filename,
      mimetype: record.mimetype,
      kind: 'text',
      content,
    };
  }

  return {
    ok: true,
    id: record.id,
    filename: record.filename,
    mimetype: record.mimetype,
    kind: 'binary',
    size: Number(record.size) || null,
    sandboxPath: record.sandbox_path,
    url: record.url,
    note: 'Binary file. Use the sandbox tool to inspect it after it is copied into the job workspace.',
  };
}

export { updateJobFile };
