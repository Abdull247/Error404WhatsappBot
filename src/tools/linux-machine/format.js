import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

export function clip(value, max = 8000) {
  const text = value == null ? '' : String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

export function safeJid(jid) {
  return String(jid || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function writeLocalFile(jid, filename, data, mimetype) {
  const dir = path.join(env.TOOLS_OUTPUT_DIR, safeJid(jid));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, data);
  return {
    ok: true,
    filename,
    path: filePath,
    mimetype,
    size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data)),
    attachment: true,
  };
}

export function formatEntry(entry) {
  if (!entry) return null;
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type || null,
    size: entry.size ?? null,
  };
}

export function formatCommandResult(result, max = 8000) {
  return {
    stdout: clip(result.stdout, Math.min(6000, max)),
    stderr: clip(result.stderr, Math.min(4000, max)),
    exitCode: result.exitCode ?? result.exit_code ?? null,
    timedOut: Boolean(result.timedOut),
    truncated: Boolean(result.truncated),
    error: result.error || null,
  };
}

export function normalizeLanguage(value) {
  const language = String(value || 'python').trim().toLowerCase();
  if (['js', 'javascript', 'node'].includes(language)) return 'javascript';
  if (['ts', 'typescript'].includes(language)) return 'typescript';
  if (['py', 'python'].includes(language)) return 'python';
  if (['sh', 'shell', 'bash'].includes(language)) return 'bash';
  return language;
}

export function machinePath(value, fallback = '/data/home') {
  const raw = String(value || fallback).trim() || fallback;
  if (!raw.startsWith('/')) return `${fallback.replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`;
  return raw;
}

export function guessFilename(filePath, fallback) {
  const name = String(filePath || '').split('/').filter(Boolean).pop();
  return name || fallback;
}

export function mimeFromName(filename) {
  const ext = String(filename).split('.').pop()?.toLowerCase();
  const map = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    ts: 'text/plain',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    py: 'text/x-python',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    csv: 'text/csv',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
