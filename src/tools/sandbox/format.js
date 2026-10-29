import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

export function clip(value, max = 8000) {
  const text = value == null ? '' : String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

export function joinLogs(logs) {
  if (!logs) return '';
  if (Array.isArray(logs)) return logs.join('');
  return String(logs);
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

function resultPreview(result, index, jid, files) {
  const preview = {};
  if (result.text) preview.text = clip(result.text, 2000);
  if (result.html) preview.html = clip(result.html, 1000);
  if (result.markdown) preview.markdown = clip(result.markdown, 2000);
  if (result.json) preview.json = result.json;
  if (result.png) {
    const filename = `sandbox-result-${index + 1}.png`;
    files.push(writeLocalFile(jid, filename, Buffer.from(result.png, 'base64'), 'image/png'));
    preview.image = filename;
  }
  if (result.jpeg) {
    const filename = `sandbox-result-${index + 1}.jpg`;
    files.push(writeLocalFile(jid, filename, Buffer.from(result.jpeg, 'base64'), 'image/jpeg'));
    preview.image = filename;
  }
  if (result.svg) preview.svg = clip(result.svg, 1000);
  return preview;
}

export function formatExecution(execution, jid) {
  const files = [];
  const results = (execution.results || []).map((result, index) => resultPreview(result, index, jid, files));
  const error = execution.error
    ? {
        name: execution.error.name || execution.error.ename || 'Error',
        value: clip(execution.error.value || execution.error.evalue || '', 2000),
        traceback: clip(execution.error.traceback, 4000),
      }
    : null;

  return {
    ok: !error,
    text: clip(execution.text || '', 4000) || null,
    stdout: clip(joinLogs(execution.logs?.stdout), 6000),
    stderr: clip(joinLogs(execution.logs?.stderr), 4000),
    error,
    results,
    files,
  };
}

export function formatEntry(entry) {
  if (!entry) return null;
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type || null,
    size: entry.size ?? null,
    permissions: entry.permissions || null,
  };
}

export function formatCommandResult(result) {
  return {
    stdout: clip(result.stdout, 6000),
    stderr: clip(result.stderr, 4000),
    exitCode: result.exitCode ?? result.exit_code ?? null,
    error: result.error || null,
  };
}

export function normalizeLanguage(value) {
  const language = String(value || 'python').trim().toLowerCase();
  if (['js', 'javascript', 'node'].includes(language)) return 'javascript';
  if (['ts', 'typescript'].includes(language)) return 'typescript';
  if (['py', 'python'].includes(language)) return 'python';
  if (['sh', 'shell', 'bash'].includes(language)) return 'bash';
  if (['r'].includes(language)) return 'r';
  if (['java'].includes(language)) return 'java';
  return language;
}

export function sandboxPath(value, fallback = '/home/user') {
  const raw = String(value || fallback).trim() || fallback;
  if (!raw.startsWith('/')) return `${fallback.replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`;
  return raw;
}
