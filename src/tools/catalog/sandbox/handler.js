import {
  createSandbox,
  getOrCreateSandbox,
  connectSandbox,
  killSandbox,
  summarizeSandbox,
} from '../../sandbox/session.js';
import {
  clip,
  formatCommandResult,
  formatEntry,
  formatExecution,
  normalizeLanguage,
  sandboxPath,
  writeLocalFile,
} from '../../sandbox/format.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const ACTIONS = new Set([
  'create',
  'connect',
  'info',
  'kill',
  'set_timeout',
  'run_code',
  'run_command',
  'list_processes',
  'kill_process',
  'files_list',
  'files_read',
  'files_write',
  'files_mkdir',
  'files_remove',
  'files_rename',
  'files_exists',
  'files_info',
  'download',
  'get_url',
  'install',
]);

function requireKey() {
  if (!env.E2B_API_KEY) {
    return { ok: false, error: 'E2B_API_KEY is not configured' };
  }
  return null;
}

function cleanAction(value) {
  const action = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  const aliases = {
    exec: 'run_code',
    execute: 'run_code',
    python: 'run_code',
    shell: 'run_command',
    bash: 'run_command',
    cmd: 'run_command',
    ls: 'files_list',
    list: 'files_list',
    read: 'files_read',
    write: 'files_write',
    mkdir: 'files_mkdir',
    rm: 'files_remove',
    mv: 'files_rename',
    rename: 'files_rename',
    exists: 'files_exists',
    stat: 'files_info',
    url: 'get_url',
    host: 'get_url',
    expose: 'get_url',
    pip: 'install',
    npm: 'install',
    destroy: 'kill',
    close: 'kill',
    status: 'info',
    start: 'create',
    new: 'create',
  };
  const resolved = aliases[action] || action;
  if (!ACTIONS.has(resolved)) {
    throw new Error(`Unknown sandbox action: ${value}. Use one of: ${[...ACTIONS].join(', ')}`);
  }
  return resolved;
}

function timeoutMs(args, options) {
  const value = Number.parseInt(args.timeoutMs ?? options.defaultTimeoutMs ?? env.E2B_TIMEOUT_MS, 10);
  if (!Number.isFinite(value) || value <= 0) return env.E2B_TIMEOUT_MS;
  return Math.min(value, 24 * 60 * 60 * 1000);
}

function commandTimeout(options) {
  return options.commandTimeoutMs || 60000;
}

function guessFilename(filePath, fallback) {
  const name = String(filePath || '').split('/').filter(Boolean).pop();
  return name || fallback;
}

function mimeFromName(filename) {
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

async function withSandbox(jid, args, options, fn) {
  const sandbox = await getOrCreateSandbox(jid, {
    sandboxId: args.sandboxId,
    template: args.template,
    timeoutMs: timeoutMs(args, options),
  });
  const result = await fn(sandbox);
  if (result && typeof result === 'object' && result.sandboxId === undefined) {
    result.sandboxId = sandbox.sandboxId;
  }
  return result;
}

async function handleCreate(jid, args, options) {
  const sandbox = await createSandbox(jid, {
    template: args.template,
    timeoutMs: timeoutMs(args, options),
  });
  const info = await summarizeSandbox(sandbox);
  return { ok: true, created: true, ...info };
}

async function handleConnect(jid, args, options) {
  const sandboxId = String(args.sandboxId || '').trim();
  if (!sandboxId) return { ok: false, error: 'sandboxId is required for connect' };
  const sandbox = await connectSandbox(jid, sandboxId, {
    timeoutMs: timeoutMs(args, options),
  });
  const info = await summarizeSandbox(sandbox);
  return { ok: true, connected: true, ...info };
}

async function handleInfo(jid, args, options) {
  return withSandbox(jid, args, options, async (sandbox) => {
    const info = await summarizeSandbox(sandbox);
    return { ok: true, ...info };
  });
}

async function handleKill(jid) {
  const killed = await killSandbox(jid);
  return { ok: true, killed };
}

async function handleSetTimeout(jid, args, options) {
  return withSandbox(jid, args, options, async (sandbox) => {
    const ms = timeoutMs(args, options);
    await sandbox.setTimeout(ms);
    return { ok: true, timeoutMs: ms };
  });
}

async function handleRunCode(jid, args, options) {
  const code = String(args.code || '').trim();
  if (!code) return { ok: false, error: 'code is required for run_code' };
  const language = normalizeLanguage(args.language);
  return withSandbox(jid, args, options, async (sandbox) => {
    logger.info({ jid, language, bytes: Buffer.byteLength(code) }, 'sandbox run_code');
    const execution = await sandbox.runCode(code, {
      language,
      timeoutMs: commandTimeout(options),
    });
    const formatted = formatExecution(execution, jid);
    return {
      ...formatted,
      language,
    };
  });
}

async function handleRunCommand(jid, args, options) {
  const command = String(args.command || '').trim();
  if (!command) return { ok: false, error: 'command is required for run_command' };
  const background = Boolean(args.background);
  return withSandbox(jid, args, options, async (sandbox) => {
    logger.info({ jid, command, background }, 'sandbox run_command');
    const opts = {
      timeoutMs: commandTimeout(options),
    };
    if (args.cwd) opts.cwd = sandboxPath(args.cwd);
    if (background) {
      const handle = await sandbox.commands.run(command, { ...opts, background: true });
      return {
        ok: true,
        background: true,
        pid: handle.pid,
        command,
      };
    }
    const result = await sandbox.commands.run(command, opts);
    return {
      ok: (result.exitCode ?? result.exit_code ?? 0) === 0,
      command,
      ...formatCommandResult(result),
    };
  });
}

async function handleListProcesses(jid, args, options) {
  return withSandbox(jid, args, options, async (sandbox) => {
    const processes = await sandbox.commands.list();
    return {
      ok: true,
      processes: (processes || []).map((proc) => ({
        pid: proc.pid,
        cmd: proc.cmd,
        args: proc.args,
        cwd: proc.cwd || null,
        tag: proc.tag || null,
      })),
    };
  });
}

async function handleKillProcess(jid, args, options) {
  const pid = Number.parseInt(args.pid, 10);
  if (!Number.isFinite(pid)) return { ok: false, error: 'pid is required for kill_process' };
  return withSandbox(jid, args, options, async (sandbox) => {
    const killed = await sandbox.commands.kill(pid);
    return { ok: true, pid, killed };
  });
}

async function handleFilesList(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const entries = await sandbox.files.list(target, {
      depth: Number.parseInt(args.depth ?? 1, 10) || 1,
    });
    return {
      ok: true,
      path: target,
      entries: (entries || []).map(formatEntry),
    };
  });
}

async function handleFilesRead(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const content = await sandbox.files.read(target);
    return {
      ok: true,
      path: target,
      content: clip(content, options.maxOutputChars || 8000),
    };
  });
}

async function handleFilesWrite(jid, args, options) {
  const items = [];
  if (Array.isArray(args.files) && args.files.length) {
    items.push(...args.files);
  } else if (args.path) {
    items.push({ path: args.path, content: args.content ?? '' });
  }
  if (!items.length) {
    return { ok: false, error: 'Provide path and content, or a files array.' };
  }
  return withSandbox(jid, args, options, async (sandbox) => {
    const written = [];
    for (const item of items) {
      const target = sandboxPath(item.path);
      await sandbox.files.write(target, item.content == null ? '' : String(item.content));
      written.push({ path: target, bytes: Buffer.byteLength(String(item.content ?? ''), 'utf8') });
    }
    return { ok: true, written };
  });
}

async function handleFilesMkdir(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const created = await sandbox.files.makeDir(target);
    return { ok: true, path: target, created };
  });
}

async function handleFilesRemove(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    await sandbox.files.remove(target);
    return { ok: true, path: target, removed: true };
  });
}

async function handleFilesRename(jid, args, options) {
  const from = sandboxPath(args.path);
  const to = sandboxPath(args.newPath);
  if (!args.newPath) return { ok: false, error: 'newPath is required for files_rename' };
  return withSandbox(jid, args, options, async (sandbox) => {
    const info = await sandbox.files.rename(from, to);
    return { ok: true, from, to, entry: formatEntry(info) };
  });
}

async function handleFilesExists(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const exists = await sandbox.files.exists(target);
    return { ok: true, path: target, exists };
  });
}

async function handleFilesInfo(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const info = await sandbox.files.getInfo(target);
    return { ok: true, entry: formatEntry(info) };
  });
}

async function handleDownload(jid, args, options) {
  const target = sandboxPath(args.path);
  return withSandbox(jid, args, options, async (sandbox) => {
    const bytes = await sandbox.files.read(target, { format: 'bytes' });
    const filename = guessFilename(target, 'sandbox-file');
    const buffer = Buffer.from(bytes);
    const file = writeLocalFile(jid, filename, buffer, mimeFromName(filename));
    return {
      ok: true,
      path: target,
      filename,
      size: buffer.length,
      files: [file],
    };
  });
}

async function handleGetUrl(jid, args, options) {
  const port = Number.parseInt(args.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'port is required for get_url (1-65535)' };
  }
  return withSandbox(jid, args, options, async (sandbox) => {
    const host = sandbox.getHost(port);
    return {
      ok: true,
      port,
      host,
      url: `https://${host}`,
    };
  });
}

async function handleInstall(jid, args, options) {
  const packages = Array.isArray(args.packages)
    ? args.packages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!packages.length) return { ok: false, error: 'packages is required for install' };
  const manager = String(args.manager || 'pip').trim().toLowerCase();
  const command = manager === 'npm'
    ? `npm install ${packages.join(' ')}`
    : `pip install ${packages.join(' ')}`;
  return handleRunCommand(jid, { ...args, command, background: false }, options);
}

const HANDLERS = {
  create: handleCreate,
  connect: handleConnect,
  info: handleInfo,
  kill: handleKill,
  set_timeout: handleSetTimeout,
  run_code: handleRunCode,
  run_command: handleRunCommand,
  list_processes: handleListProcesses,
  kill_process: handleKillProcess,
  files_list: handleFilesList,
  files_read: handleFilesRead,
  files_write: handleFilesWrite,
  files_mkdir: handleFilesMkdir,
  files_remove: handleFilesRemove,
  files_rename: handleFilesRename,
  files_exists: handleFilesExists,
  files_info: handleFilesInfo,
  download: handleDownload,
  get_url: handleGetUrl,
  install: handleInstall,
};

export async function handler(args = {}, context = {}, options = {}) {
  const missing = requireKey();
  if (missing) return missing;

  let action;
  try {
    action = cleanAction(args.action);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    return await HANDLERS[action](context.jid, args, options);
  } catch (error) {
    logger.error({ err: error, action, jid: context.jid }, 'sandbox action failed');
    return { ok: false, action, error: error.message };
  }
}
