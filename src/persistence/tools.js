import { getPersistenceConfig, persistenceSandbox } from '../config/persistence.js';
import { getEnabledTools } from '../tools/registry.js';
import { addLog } from '../db/repositories/persistence/logs.js';
import { addStep } from '../db/repositories/persistence/steps.js';
import { upsertJobMemory, listJobMemories, deleteJobMemory } from '../db/repositories/persistence/memories.js';
import { updateJob } from '../db/repositories/persistence/jobs.js';
import { jobPaths, persistJson, writeSandboxFile } from './workspace.js';
import { readJobAttachment } from './files.js';
import { clip } from './format.js';

function definition(name, description, properties, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

const persistMemoryDef = definition(
  'persist_memory',
  'Save, list, get, or delete durable job memory. Use this for facts, file paths, decisions, next steps, and findings that must survive a sandbox pause or bot restart.',
  {
    action: {
      type: 'string',
      description: 'save, list, get, or delete. Default save.',
    },
    key: {
      type: 'string',
      description: 'Memory key, for example next_step, repo_path, test_result.',
    },
    value: {
      type: 'string',
      description: 'Memory value for save.',
    },
    importance: {
      type: 'integer',
      description: '1-10. Higher stays more visible. Default 5.',
    },
  },
  [],
);

const saveCheckpointDef = definition(
  'save_checkpoint',
  'Write a resumable checkpoint for this job. Call after each completed stage. Include stage, done, next, and any paths.',
  {
    stage: { type: 'string', description: 'Current or completed stage name.' },
    summary: { type: 'string', description: 'What has been accomplished so far.' },
    done: { type: 'array', items: { type: 'string' }, description: 'Completed items.' },
    next: { type: 'array', items: { type: 'string' }, description: 'Remaining items.' },
    notes: { type: 'string', description: 'Anything a later resume must know.' },
    data: { type: 'object', description: 'Optional extra structured state.' },
  },
  ['summary'],
);

const logProgressDef = definition(
  'log_progress',
  'Record a short human-readable progress update. This is what the WhatsApp user sees with the check command.',
  {
    message: { type: 'string', description: 'Concise status, one or two sentences.' },
    title: { type: 'string', description: 'Optional short step title.' },
  },
  ['message'],
);

const readAttachmentDef = definition(
  'read_attachment',
  'Read a file that was sent with the WhatsApp message that started this job. Use for text, code, json, and images when vision is enabled.',
  {
    file: { type: 'string', description: 'Attachment filename or id.' },
    inspect_image: {
      type: 'boolean',
      description: 'If true and the file is an image, return it for visual inspection.',
    },
  },
  ['file'],
);

const writeWorkspaceDef = definition(
  'write_workspace',
  'Write a text file into this job workspace on the sandbox disk so it survives idle pause. Paths are relative to the job workspace unless absolute under the job root.',
  {
    path: { type: 'string', description: 'Relative path such as notes.md or artifacts/report.txt.' },
    content: { type: 'string', description: 'File contents.' },
  },
  ['path', 'content'],
);

async function handlePersistMemory(args, ctx) {
  const action = String(args.action || 'save').trim().toLowerCase();
  if (action === 'list') {
    const memories = await listJobMemories(ctx.job.id);
    return { ok: true, memories: memories.map((item) => ({ key: item.key, value: item.value, importance: item.importance })) };
  }
  const key = String(args.key || '').trim();
  if (!key) return { ok: false, error: 'key is required' };
  if (action === 'get') {
    const memories = await listJobMemories(ctx.job.id);
    const found = memories.find((item) => item.key === key);
    return found ? { ok: true, key: found.key, value: found.value } : { ok: false, error: `memory not found: ${key}` };
  }
  if (action === 'delete') {
    const removed = await deleteJobMemory(ctx.job.id, key);
    return { ok: Boolean(removed), deleted: key };
  }
  const value = String(args.value || '').trim();
  if (!value) return { ok: false, error: 'value is required for save' };
  const importance = Math.min(10, Math.max(1, Number.parseInt(args.importance, 10) || 5));
  const saved = await upsertJobMemory({
    jobId: ctx.job.id,
    key,
    value,
    importance,
    metadata: { source: 'agent' },
  });
  const paths = jobPaths(ctx.job.id);
  const all = await listJobMemories(ctx.job.id);
  const dump = {};
  for (const item of all) dump[item.key] = item.value;
  if (ctx.sandbox) {
    await persistJson(ctx.sandbox, paths.memory, dump).catch(() => null);
  }
  await addLog({ jobId: ctx.job.id, message: `memory saved: ${key}`, data: { key } });
  return { ok: true, key: saved.key, value: saved.value, importance: saved.importance };
}

async function handleSaveCheckpoint(args, ctx) {
  const checkpoint = {
    stage: args.stage || null,
    summary: args.summary || '',
    done: Array.isArray(args.done) ? args.done : [],
    next: Array.isArray(args.next) ? args.next : [],
    notes: args.notes || '',
    data: args.data && typeof args.data === 'object' ? args.data : {},
    savedAt: new Date().toISOString(),
  };
  await updateJob(ctx.job.id, {
    checkpoint,
    progress: args.summary || ctx.job.progress,
    metadata: { ...(ctx.job.metadata || {}), lastStage: checkpoint.stage },
  });
  const paths = jobPaths(ctx.job.id);
  if (ctx.sandbox) {
    await persistJson(ctx.sandbox, paths.checkpoint, checkpoint).catch(() => null);
  }
  await addStep({
    jobId: ctx.job.id,
    kind: 'checkpoint',
    title: checkpoint.stage || 'checkpoint',
    content: checkpoint.summary,
  });
  await addLog({ jobId: ctx.job.id, message: `checkpoint: ${checkpoint.summary}`, data: checkpoint });
  ctx.job.checkpoint = checkpoint;
  ctx.job.progress = checkpoint.summary;
  return { ok: true, checkpoint };
}

async function handleLogProgress(args, ctx) {
  const message = String(args.message || '').trim();
  if (!message) return { ok: false, error: 'message is required' };
  const title = String(args.title || 'progress').trim();
  await updateJob(ctx.job.id, { progress: message, status: 'running' });
  await addStep({ jobId: ctx.job.id, kind: 'progress', title, content: message });
  await addLog({ jobId: ctx.job.id, message });
  ctx.job.progress = message;
  const paths = jobPaths(ctx.job.id);
  if (ctx.sandbox) {
    const line = `${new Date().toISOString()} ${message}\n`;
    await writeSandboxFile(ctx.sandbox, `${paths.logs}/progress.log`, `${ctx.job.progress || ''}\n${line}`).catch(() => null);
  }
  return { ok: true, progress: message };
}

async function handleReadAttachment(args, ctx) {
  const name = String(args.file || args.filename || args.id || '').trim();
  if (!name) return { ok: false, error: 'file is required' };
  const inspectImage = ctx.runtime?.imageSupport !== false && (args.inspect_image !== false);
  const result = await readJobAttachment(ctx.job.id, name, { includeImageBytes: inspectImage });
  if (result.ok && result.kind === 'image' && result.base64) {
    ctx.pendingImage = {
      mimetype: result.mimetype,
      base64: result.base64,
      filename: result.filename,
    };
    return {
      ok: true,
      id: result.id,
      filename: result.filename,
      mimetype: result.mimetype,
      kind: 'image',
      note: 'Image loaded for visual inspection on the next reasoning step.',
    };
  }
  await addStep({
    jobId: ctx.job.id,
    kind: 'read_attachment',
    title: result.filename || name,
    content: result.kind === 'text' ? clip(result.content, 400) : result.note || result.kind,
  });
  return result;
}

async function handleWriteWorkspace(args, ctx) {
  const relative = String(args.path || '').replace(/\0/g, '').trim();
  if (!relative) return { ok: false, error: 'path is required' };
  if (relative.includes('..')) return { ok: false, error: 'path cannot contain ..' };
  const paths = jobPaths(ctx.job.id);
  const target = relative.startsWith(paths.root) || relative.startsWith('/data/home/')
    ? relative
    : `${paths.workspace}/${relative.replace(/^\/+/, '')}`;
  if (!ctx.sandbox) return { ok: false, error: 'sandbox is not available' };
  try {
    await writeSandboxFile(ctx.sandbox, target, args.content ?? '');
  } catch (error) {
    const message = String(error?.message || error);
    await addLog({ jobId: ctx.job.id, level: 'error', message: `write failed: ${target}`, data: { error: message } });
    return {
      ok: false,
      error: message,
      path: target,
      hint: 'Write under /data/home or the job workspace. /data/jen404 is not writable.',
    };
  }
  await addLog({ jobId: ctx.job.id, message: `wrote ${target}` });
  return { ok: true, path: target, bytes: Buffer.byteLength(String(args.content ?? ''), 'utf8') };
}

const internalHandlers = {
  persist_memory: handlePersistMemory,
  save_checkpoint: handleSaveCheckpoint,
  log_progress: handleLogProgress,
  read_attachment: handleReadAttachment,
  write_workspace: handleWriteWorkspace,
};

export function persistenceInternalDefinitions() {
  return [persistMemoryDef, saveCheckpointDef, logProgressDef, readAttachmentDef, writeWorkspaceDef];
}

export function loadPersistenceTools(context = {}) {
  const config = getPersistenceConfig();
  const box = persistenceSandbox();
  const sandboxTools = new Set([box?.tool, box?.id].filter(Boolean));
  const catalog = getEnabledTools(config.allow, context).filter((tool) => {
    const name = tool.function?.name;
    if (!name) return false;
    if (name === 'create_agent') return false;
    if (sandboxTools.size && (name === 'sandbox' || name === 'linux_machine')) {
      return sandboxTools.has(name);
    }
    return true;
  });
  return [...persistenceInternalDefinitions(), ...catalog];
}

export async function runPersistenceTool(name, args, ctx) {
  const handler = internalHandlers[name];
  if (!handler) return null;
  return handler(args || {}, ctx);
}
