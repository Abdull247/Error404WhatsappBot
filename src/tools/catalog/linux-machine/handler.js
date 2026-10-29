import {
  createMachine,
  getOrCreateMachine,
  connectMachine,
  killMachine,
  summarizeMachine,
  listOwnerMachines,
} from '../../linux-machine/session.js';
import { instaboxConfigured } from '../../linux-machine/client.js';
import { isOwnerJid } from '../../../whatsapp/owner.js';
import { listPorts, publishPort, unpublishPort } from '../../linux-machine/ports.js';
import {
  clip,
  formatCommandResult,
  formatEntry,
  guessFilename,
  machinePath,
  mimeFromName,
  normalizeLanguage,
  writeLocalFile,
} from '../../linux-machine/format.js';
import { logger } from '../../../utils/logger.js';

const ACTIONS = new Set([
  'create',
  'connect',
  'info',
  'list',
  'kill',
  'pause',
  'resume',
  'stop',
  'set_auto_suspend',
  'run_code',
  'run_command',
  'list_processes',
  'kill_process',
  'files_list',
  'files_read',
  'files_write',
  'files_mkdir',
  'files_remove',
  'files_exists',
  'download',
  'get_url',
  'unpublish_port',
  'list_ports',
  'install',
  'desktop_start',
  'desktop_status',
  'desktop_screenshot',
  'desktop_open',
  'desktop_click',
  'desktop_type',
  'desktop_press',
  'desktop_scroll',
  'desktop_move',
  'desktop_stream',
  'desktop_revoke',
  'snapshot',
  'metrics',
]);

function requireKey() {
  if (!instaboxConfigured()) {
    return { ok: false, error: 'INSTABOX_API_KEY is not configured' };
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
    list_files: 'files_list',
    read: 'files_read',
    write: 'files_write',
    mkdir: 'files_mkdir',
    rm: 'files_remove',
    exists: 'files_exists',
    url: 'get_url',
    host: 'get_url',
    expose: 'get_url',
    publish: 'get_url',
    publish_port: 'get_url',
    pip: 'install',
    npm: 'install',
    destroy: 'kill',
    close: 'kill',
    delete: 'kill',
    status: 'info',
    start: 'create',
    new: 'create',
    suspend: 'pause',
    wake: 'resume',
    screenshot: 'desktop_screenshot',
    open: 'desktop_open',
    click: 'desktop_click',
    type: 'desktop_type',
    press: 'desktop_press',
    stream: 'desktop_stream',
    vnc: 'desktop_stream',
    desktop: 'desktop_start',
  };
  const resolved = aliases[action] || action;
  if (!ACTIONS.has(resolved)) {
    throw new Error(`Unknown linux_machine action: ${value}. Use one of: ${[...ACTIONS].join(', ')}`);
  }
  return resolved;
}

function machineIdOf(args) {
  return String(args.machineId || args.sandboxId || '').trim();
}

function commandTimeout(args, options) {
  const value = Number.parseInt(args.timeoutMs ?? options.commandTimeoutMs ?? 120000, 10);
  if (!Number.isFinite(value) || value <= 0) return 120000;
  return Math.min(value, 600000);
}

function languageCommand(language) {
  if (language === 'javascript') {
    return { filename: '/tmp/jen404-run.mjs', runner: 'node /tmp/jen404-run.mjs' };
  }
  if (language === 'typescript') {
    return { filename: '/tmp/jen404-run.ts', runner: 'bun /tmp/jen404-run.ts || npx --yes tsx /tmp/jen404-run.ts' };
  }
  if (language === 'bash') {
    return { filename: '/tmp/jen404-run.sh', runner: 'bash /tmp/jen404-run.sh' };
  }
  return { filename: '/tmp/jen404-run.py', runner: 'python3 /tmp/jen404-run.py' };
}

async function withMachine(jid, args, fn) {
  const sandbox = await getOrCreateMachine(jid, {
    sandboxId: machineIdOf(args),
    template: args.template,
    name: args.name,
    autoSuspendMs: args.autoSuspendMs,
  });
  const result = await fn(sandbox);
  if (result && typeof result === 'object' && result.machineId === undefined) {
    result.machineId = sandbox.sandboxId;
  }
  return result;
}

async function handleCreate(jid, args) {
  const sandbox = await createMachine(jid, {
    template: args.template,
    name: args.name,
    autoSuspendMs: args.autoSuspendMs,
  });
  const info = await summarizeMachine(sandbox);
  return { ok: true, created: true, persistent: true, ...info };
}

async function handleConnect(jid, args) {
  const machineId = machineIdOf(args);
  if (!machineId) return { ok: false, error: 'machineId is required for connect' };
  const sandbox = await connectMachine(jid, machineId);
  const info = await summarizeMachine(sandbox);
  return { ok: true, connected: true, persistent: true, ...info };
}

async function handleInfo(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    const info = await summarizeMachine(sandbox);
    return { ok: true, persistent: true, ...info };
  });
}

async function handleList(jid) {
  let machines = await listOwnerMachines(jid, { allOwners: true });
  if (!machines?.length) {
    machines = await listOwnerMachines(jid);
  }
  return {
    ok: true,
    machines: (machines || []).map((item) => ({
      machineId: item.sandboxId,
      name: item.name || null,
      state: item.state || null,
      templateId: item.templateId || null,
      metadata: item.metadata || null,
    })),
  };
}

async function handleKill(jid, args) {
  const killed = await killMachine(jid, machineIdOf(args));
  return { ok: true, killed };
}

async function handlePause(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.pause();
    return { ok: true, paused: true };
  });
}

async function handleResume(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.resume();
    const info = await summarizeMachine(sandbox);
    return { ok: true, resumed: true, ...info };
  });
}

async function handleStop(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.stop();
    return { ok: true, stopped: true };
  });
}

async function handleSetAutoSuspend(jid, args) {
  const idleMs = Number.parseInt(args.autoSuspendMs, 10);
  if (!Number.isFinite(idleMs) || idleMs < 0) {
    return { ok: false, error: 'autoSuspendMs is required (0 disables on paid plans)' };
  }
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.setAutoSuspend(idleMs);
    return { ok: true, autoSuspendMs: idleMs };
  });
}

async function handleRunCode(jid, args, options) {
  const code = String(args.code || '').trim();
  if (!code) return { ok: false, error: 'code is required for run_code' };
  const language = normalizeLanguage(args.language);
  const { filename, runner } = languageCommand(language, code);
  return withMachine(jid, args, async (sandbox) => {
    logger.info({ jid, language, bytes: Buffer.byteLength(code) }, 'linux_machine run_code');
    await sandbox.files.write(filename, code);
    const result = await sandbox.commands.exec(runner, {
      cwd: machinePath(args.cwd, options.home),
      timeoutMs: commandTimeout(args, options),
    });
    return {
      ok: (result.exitCode ?? 0) === 0,
      language,
      ...formatCommandResult(result, options.maxOutputChars),
    };
  });
}

async function handleRunCommand(jid, args, options) {
  const command = String(args.command || '').trim();
  if (!command) return { ok: false, error: 'command is required for run_command' };
  const background = Boolean(args.background);
  return withMachine(jid, args, async (sandbox) => {
    logger.info({ jid, command, background }, 'linux_machine run_command');
    const opts = {
      cwd: machinePath(args.cwd, options.home),
      timeoutMs: commandTimeout(args, options),
    };
    if (background) {
      const handle = await sandbox.commands.run(command, { ...opts, background: true });
      return {
        ok: true,
        background: true,
        pid: handle.pid,
        command,
      };
    }
    const result = await sandbox.commands.exec(command, opts);
    return {
      ok: (result.exitCode ?? 0) === 0,
      command,
      ...formatCommandResult(result, options.maxOutputChars),
    };
  });
}

async function handleListProcesses(jid, args, options) {
  return withMachine(jid, args, async (sandbox) => {
    const result = await sandbox.commands.exec('ps -eo pid,user,stat,etime,cmd --no-headers', {
      timeoutMs: commandTimeout(args, options),
    });
    const processes = String(result.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80)
      .map((line) => {
        const parts = line.split(/\s+/, 5);
        return {
          pid: Number.parseInt(parts[0], 10) || null,
          user: parts[1] || null,
          stat: parts[2] || null,
          etime: parts[3] || null,
          cmd: parts[4] || line,
        };
      });
    return { ok: true, processes };
  });
}

async function handleKillProcess(jid, args, options) {
  const pid = Number.parseInt(args.pid, 10);
  if (!Number.isFinite(pid)) return { ok: false, error: 'pid is required for kill_process' };
  return withMachine(jid, args, async (sandbox) => {
    const result = await sandbox.commands.exec(`kill ${pid}`, {
      timeoutMs: commandTimeout(args, options),
    });
    return {
      ok: (result.exitCode ?? 0) === 0,
      pid,
      ...formatCommandResult(result, options.maxOutputChars),
    };
  });
}

async function handleFilesList(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
    const entries = await sandbox.files.list(target);
    return {
      ok: true,
      path: target,
      entries: (entries || []).map(formatEntry),
    };
  });
}

async function handleFilesRead(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
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
  return withMachine(jid, args, async (sandbox) => {
    const written = [];
    for (const item of items) {
      const target = machinePath(item.path, options.home);
      await sandbox.files.write(target, item.content == null ? '' : String(item.content));
      written.push({ path: target, bytes: Buffer.byteLength(String(item.content ?? ''), 'utf8') });
    }
    return { ok: true, written };
  });
}

async function handleFilesMkdir(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.commands.exec(`mkdir -p ${JSON.stringify(target)}`);
    return { ok: true, path: target, created: true };
  });
}

async function handleFilesRemove(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.files.remove(target);
    return { ok: true, path: target, removed: true };
  });
}

async function handleFilesExists(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
    const exists = await sandbox.files.exists(target);
    return { ok: true, path: target, exists };
  });
}

async function handleDownload(jid, args, options) {
  const target = machinePath(args.path, options.home);
  return withMachine(jid, args, async (sandbox) => {
    const bytes = await sandbox.files.read(target, { format: 'bytes' });
    const filename = guessFilename(target, 'linux-machine-file');
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

async function handleGetUrl(jid, args) {
  const port = Number.parseInt(args.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'port is required for get_url (1-65535)' };
  }
  return withMachine(jid, args, async (sandbox) => {
    const published = await publishPort(sandbox.sandboxId, port, args.portName);
    return {
      ok: true,
      port,
      url: published.url || published.ports?.[0]?.url || null,
      name: published.name || args.portName || null,
      published,
    };
  });
}

async function handleUnpublishPort(jid, args) {
  const port = Number.parseInt(args.port, 10);
  if (!Number.isFinite(port)) return { ok: false, error: 'port is required for unpublish_port' };
  return withMachine(jid, args, async (sandbox) => {
    await unpublishPort(sandbox.sandboxId, port);
    return { ok: true, port, unpublished: true };
  });
}

async function handleListPorts(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    const listed = await listPorts(sandbox.sandboxId);
    return { ok: true, ports: listed.ports || listed || [] };
  });
}

async function handleInstall(jid, args, options) {
  const packages = Array.isArray(args.packages)
    ? args.packages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!packages.length) return { ok: false, error: 'packages is required for install' };
  const manager = String(args.manager || 'pip').trim().toLowerCase();
  const command = manager === 'npm'
    ? `npm install ${packages.map((pkg) => JSON.stringify(pkg)).join(' ')}`
    : `python3 -m pip install ${packages.map((pkg) => JSON.stringify(pkg)).join(' ')}`;
  return handleRunCommand(jid, { ...args, command, background: false }, options);
}

async function ensureDesktop(sandbox, args) {
  const width = Number.parseInt(args.width ?? 1280, 10) || 1280;
  const height = Number.parseInt(args.height ?? 800, 10) || 800;
  return sandbox.desktop.start({ width, height });
}

async function handleDesktopStart(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    const status = await ensureDesktop(sandbox, args);
    return { ok: true, desktop: status };
  });
}

async function handleDesktopStatus(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    const status = await sandbox.desktop.status();
    return { ok: true, desktop: status };
  });
}

async function handleDesktopScreenshot(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    const png = await sandbox.desktop.screenshot();
    const file = writeLocalFile(jid, 'linux-desktop.png', Buffer.from(png), 'image/png');
    return {
      ok: true,
      filename: file.filename,
      size: file.size,
      files: [file],
    };
  });
}

async function handleDesktopOpen(jid, args) {
  const url = String(args.url || '').trim();
  if (!url) return { ok: false, error: 'url is required for desktop_open' };
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    await sandbox.desktop.open(url);
    return { ok: true, opened: url };
  });
}

async function handleDesktopClick(jid, args) {
  const x = Number.parseInt(args.x, 10);
  const y = Number.parseInt(args.y, 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: 'x and y are required for desktop_click' };
  }
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    const opts = {};
    if (args.button) opts.button = String(args.button);
    if (args.double) opts.double = true;
    await sandbox.desktop.click(x, y, opts);
    return { ok: true, x, y };
  });
}

async function handleDesktopType(jid, args) {
  const text = args.text == null ? '' : String(args.text);
  if (!text) return { ok: false, error: 'text is required for desktop_type' };
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    await sandbox.desktop.type(text);
    return { ok: true, typed: text.length };
  });
}

async function handleDesktopPress(jid, args) {
  const raw = String(args.keys || args.text || '').trim();
  if (!raw) return { ok: false, error: 'keys is required for desktop_press' };
  const keys = raw.includes('+') ? raw.split('+').map((item) => item.trim()).filter(Boolean) : raw;
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    await sandbox.desktop.press(keys);
    return { ok: true, keys };
  });
}

async function handleDesktopScroll(jid, args) {
  const direction = String(args.direction || 'down').trim().toLowerCase();
  const amount = Number.parseInt(args.amount ?? 3, 10) || 3;
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    await sandbox.desktop.scroll({ direction, amount });
    return { ok: true, direction, amount };
  });
}

async function handleDesktopMove(jid, args) {
  const x = Number.parseInt(args.x, 10);
  const y = Number.parseInt(args.y, 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: 'x and y are required for desktop_move' };
  }
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    await sandbox.desktop.move(x, y);
    return { ok: true, x, y };
  });
}

async function handleDesktopStream(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await ensureDesktop(sandbox, args);
    const ttlSeconds = Number.parseInt(args.ttlSeconds ?? 3600, 10) || 3600;
    const viewOnly = args.viewOnly !== false;
    const stream = await sandbox.desktop.streamUrl({ viewOnly, ttlSeconds });
    return {
      ok: true,
      url: stream.url,
      expiresAt: stream.expiresAt || null,
      viewOnly,
    };
  });
}

async function handleDesktopRevoke(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    await sandbox.desktop.revokeStreamUrls();
    return { ok: true, revoked: true };
  });
}

async function handleSnapshot(jid, args) {
  const name = String(args.snapshotName || args.name || '').trim();
  if (!name) return { ok: false, error: 'snapshotName is required for snapshot' };
  return withMachine(jid, args, async (sandbox) => {
    const snap = await sandbox.createSnapshot({ name });
    return {
      ok: true,
      snapshotId: snap.id || snap.snapshotId || null,
      name: snap.name || name,
      status: snap.status || null,
    };
  });
}

async function handleMetrics(jid, args) {
  return withMachine(jid, args, async (sandbox) => {
    const samples = await sandbox.getMetrics();
    const latest = samples?.length ? samples[samples.length - 1] : null;
    return {
      ok: true,
      samples: (samples || []).slice(-10).map((item) => ({
        timestamp: item.timestamp || null,
        cpuUsedPct: item.cpuUsedPct ?? null,
        memUsed: item.memUsed ?? null,
        memTotal: item.memTotal ?? null,
        diskTotal: item.diskTotal ?? null,
        diskUsed: item.diskUsed ?? null,
      })),
      latest,
    };
  });
}

const HANDLERS = {
  create: handleCreate,
  connect: handleConnect,
  info: handleInfo,
  list: handleList,
  kill: handleKill,
  pause: handlePause,
  resume: handleResume,
  stop: handleStop,
  set_auto_suspend: handleSetAutoSuspend,
  run_code: handleRunCode,
  run_command: handleRunCommand,
  list_processes: handleListProcesses,
  kill_process: handleKillProcess,
  files_list: handleFilesList,
  files_read: handleFilesRead,
  files_write: handleFilesWrite,
  files_mkdir: handleFilesMkdir,
  files_remove: handleFilesRemove,
  files_exists: handleFilesExists,
  download: handleDownload,
  get_url: handleGetUrl,
  unpublish_port: handleUnpublishPort,
  list_ports: handleListPorts,
  install: handleInstall,
  desktop_start: handleDesktopStart,
  desktop_status: handleDesktopStatus,
  desktop_screenshot: handleDesktopScreenshot,
  desktop_open: handleDesktopOpen,
  desktop_click: handleDesktopClick,
  desktop_type: handleDesktopType,
  desktop_press: handleDesktopPress,
  desktop_scroll: handleDesktopScroll,
  desktop_move: handleDesktopMove,
  desktop_stream: handleDesktopStream,
  desktop_revoke: handleDesktopRevoke,
  snapshot: handleSnapshot,
  metrics: handleMetrics,
};

const OWNER_ACTIONS = new Set(['create', 'kill', 'stop', 'pause', 'snapshot', 'set_auto_suspend']);

export async function handler(args = {}, context = {}, options = {}) {
  const missing = requireKey();
  if (missing) return missing;

  let action;
  try {
    action = cleanAction(args.action);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (OWNER_ACTIONS.has(action) && !isOwnerJid(context.jid, context.sock)) {
    return { ok: false, error: `${action} is only available to the bot owner.` };
  }

  try {
    return await HANDLERS[action](context.jid, args, options);
  } catch (error) {
    logger.error({ err: error, action, jid: context.jid }, 'linux_machine action failed');
    return { ok: false, action, error: error.message, code: error.code || null };
  }
}
