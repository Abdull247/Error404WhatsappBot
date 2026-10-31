import { getOrCreateMachine } from '../tools/linux-machine/session.js';
import { getPersistenceConfig } from '../config/persistence.js';
import { persistenceSandbox } from '../config/persistence.js';
import { listJobFiles, updateJobFile } from '../db/repositories/persistence/files.js';
import { logger } from '../utils/logger.js';
import { isReadableFile } from './files.js';

const FALLBACK_ROOTS = [
  '/data/home/jen404/agents',
  '/data/home/agents',
  '/tmp/jen404/agents',
];

let resolvedRoot = '';

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function configuredRoot() {
  return String(getPersistenceConfig().workspaceRoot || '').replace(/\/+$/, '') || '/data/home/jen404/agents';
}

export function jobPaths(jobId, root = resolvedRoot || configuredRoot()) {
  const base = `${String(root).replace(/\/+$/, '')}/${jobId}`;
  return {
    root: base,
    workspace: `${base}/workspace`,
    logs: `${base}/logs`,
    artifacts: `${base}/artifacts`,
    attachments: `${base}/attachments`,
    memory: `${base}/memory.json`,
    checkpoint: `${base}/checkpoint.json`,
    heartbeat: `${base}/heartbeat.txt`,
  };
}

export async function getJobMachine(job) {
  const box = persistenceSandbox();
  if (!box || box.tool !== 'linux_machine') return null;
  return getOrCreateMachine(job.chat_jid || job.owner_jid);
}

async function canUseRoot(sandbox, root) {
  const probe = `${String(root).replace(/\/+$/, '')}/.probe`;
  try {
    await sandbox.commands.exec(`mkdir -p ${quote(root)} && date -Is > ${quote(probe)} && rm -f ${quote(probe)}`, {
      timeoutMs: 20000,
    });
    return true;
  } catch (error) {
    logger.warn({ err: error, root }, 'persistence workspace root is not writable');
    return false;
  }
}

export async function resolveWorkspaceRoot(sandbox) {
  if (resolvedRoot) return resolvedRoot;
  const candidates = [configuredRoot(), ...FALLBACK_ROOTS.filter((root) => root !== configuredRoot())];
  if (!sandbox?.commands?.exec) {
    resolvedRoot = candidates[0];
    return resolvedRoot;
  }
  for (const root of candidates) {
    if (await canUseRoot(sandbox, root)) {
      resolvedRoot = root;
      if (root !== configuredRoot()) {
        logger.warn({ configured: configuredRoot(), using: root }, 'persistence workspace root fell back to a writable path');
      }
      return resolvedRoot;
    }
  }
  resolvedRoot = candidates[candidates.length - 1];
  return resolvedRoot;
}

export async function ensureJobWorkspace(job, sandbox) {
  const root = await resolveWorkspaceRoot(sandbox);
  const paths = jobPaths(job.id, root);
  if (!sandbox?.commands?.exec) return paths;
  const script = [
    `mkdir -p ${quote(paths.workspace)} ${quote(paths.logs)} ${quote(paths.artifacts)} ${quote(paths.attachments)}`,
    `date -Is > ${quote(paths.heartbeat)}`,
  ].join(' && ');
  await sandbox.commands.exec(script, { timeoutMs: 30000 });
  return paths;
}

export async function writeSandboxFile(sandbox, target, content) {
  if (!sandbox?.files?.write) return false;
  const dir = String(target).replace(/\/[^/]+$/, '');
  if (dir && sandbox.commands?.exec) {
    try {
      await sandbox.commands.exec(`mkdir -p ${quote(dir)}`, { timeoutMs: 15000 });
    } catch (error) {
      const message = String(error?.message || error);
      if (/Permission denied|EACCES|cannot create directory/i.test(message)) {
        throw new Error(`Cannot write ${target}: parent directory is not writable (${message})`);
      }
      throw error;
    }
  }
  await sandbox.files.write(target, content == null ? '' : String(content));
  return true;
}

export async function readSandboxFile(sandbox, target) {
  if (!sandbox?.files?.read) return null;
  try {
    return await sandbox.files.read(target);
  } catch {
    return null;
  }
}

export async function syncAttachmentsToWorkspace(job, sandbox) {
  if (!sandbox?.files?.write) return [];
  const paths = jobPaths(job.id);
  const files = await listJobFiles(job.id);
  const copied = [];
  for (const file of files) {
    if (file.sandbox_path) {
      copied.push(file);
      continue;
    }
    const target = `${paths.attachments}/${file.filename}`;
    try {
      if (file.text_preview && isReadableFile(file.mimetype, file.filename)) {
        await sandbox.files.write(target, file.text_preview);
      } else if (file.metadata?.base64) {
        const b64 = file.metadata.base64;
        await sandbox.commands.exec(
          `python3 - <<'PY'\nimport base64, pathlib\npathlib.Path(${JSON.stringify(target)}).write_bytes(base64.b64decode(${JSON.stringify(b64)}))\nPY`,
          { timeoutMs: 30000 },
        );
      } else if (file.url) {
        await sandbox.commands.exec(
          `python3 - <<'PY'\nfrom urllib.request import urlretrieve\nurlretrieve(${JSON.stringify(file.url)}, ${JSON.stringify(target)})\nPY`,
          { timeoutMs: 60000 },
        );
      } else {
        continue;
      }
      await updateJobFile(file.id, { sandboxPath: target });
      copied.push({ ...file, sandbox_path: target });
    } catch (error) {
      logger.warn({ err: error, jobId: job.id, filename: file.filename }, 'failed to copy attachment into workspace');
    }
  }
  return copied;
}

export async function persistJson(sandbox, target, value) {
  return writeSandboxFile(sandbox, target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function touchHeartbeat(sandbox, jobId) {
  if (!sandbox?.commands?.exec) return;
  const paths = jobPaths(jobId);
  try {
    await sandbox.commands.exec(`date -Is > ${quote(paths.heartbeat)} && echo ok`, { timeoutMs: 15000 });
  } catch (error) {
    logger.warn({ err: error, jobId }, 'persistence sandbox keepalive failed');
  }
}
