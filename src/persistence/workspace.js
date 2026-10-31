import { getOrCreateMachine } from '../tools/linux-machine/session.js';
import { getPersistenceConfig } from '../config/persistence.js';
import { persistenceSandbox } from '../config/persistence.js';
import { listJobFiles, updateJobFile } from '../db/repositories/persistence/files.js';
import { logger } from '../utils/logger.js';
import { isReadableFile } from './files.js';

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function jobPaths(jobId) {
  const root = `${getPersistenceConfig().workspaceRoot.replace(/\/+$/, '')}/${jobId}`;
  return {
    root,
    workspace: `${root}/workspace`,
    logs: `${root}/logs`,
    artifacts: `${root}/artifacts`,
    attachments: `${root}/attachments`,
    memory: `${root}/memory.json`,
    checkpoint: `${root}/checkpoint.json`,
    heartbeat: `${root}/heartbeat.txt`,
  };
}

export async function getJobMachine(job) {
  const box = persistenceSandbox();
  if (!box || box.tool !== 'linux_machine') return null;
  return getOrCreateMachine(job.chat_jid || job.owner_jid);
}

export async function ensureJobWorkspace(job, sandbox) {
  const paths = jobPaths(job.id);
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
    await sandbox.commands.exec(`mkdir -p ${quote(dir)}`, { timeoutMs: 15000 }).catch(() => null);
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
