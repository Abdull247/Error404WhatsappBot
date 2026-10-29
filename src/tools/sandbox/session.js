import { Sandbox } from '@e2b/code-interpreter';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const sessions = new Map();

function sessionKey(jid) {
  return String(jid || 'unknown');
}

export function getClientOpts() {
  const opts = {};
  if (env.E2B_API_KEY) opts.apiKey = env.E2B_API_KEY;
  return opts;
}

export function getStoredSession(jid) {
  return sessions.get(sessionKey(jid)) || null;
}

export function forgetSession(jid) {
  sessions.delete(sessionKey(jid));
}

export async function connectSandbox(jid, sandboxId, options = {}) {
  const timeoutMs = options.timeoutMs || env.E2B_TIMEOUT_MS;
  const sandbox = await Sandbox.connect(sandboxId, {
    ...getClientOpts(),
    timeoutMs,
  });
  const record = {
    sandbox,
    sandboxId: sandbox.sandboxId,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(jid), record);
  return sandbox;
}

export async function createSandbox(jid, options = {}) {
  const timeoutMs = options.timeoutMs || env.E2B_TIMEOUT_MS;
  const existing = sessions.get(sessionKey(jid));
  if (existing?.sandbox) {
    try {
      await existing.sandbox.kill();
    } catch (error) {
      logger.warn({ err: error, jid: sessionKey(jid) }, 'failed to kill previous sandbox');
    }
    sessions.delete(sessionKey(jid));
  }

  const createOpts = {
    ...getClientOpts(),
    timeoutMs,
    metadata: {
      bot: 'jen404',
      user: sessionKey(jid),
    },
  };

  const sandbox = options.template
    ? await Sandbox.create(options.template, createOpts)
    : await Sandbox.create(createOpts);

  const record = {
    sandbox,
    sandboxId: sandbox.sandboxId,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(jid), record);
  logger.info({ jid: sessionKey(jid), sandboxId: sandbox.sandboxId }, 'created e2b sandbox');
  return sandbox;
}

export async function getOrCreateSandbox(jid, options = {}) {
  const key = sessionKey(jid);
  const existing = sessions.get(key);
  if (existing?.sandbox) {
    try {
      const running = await existing.sandbox.isRunning();
      if (running) {
        await existing.sandbox.setTimeout(options.timeoutMs || env.E2B_TIMEOUT_MS);
        return existing.sandbox;
      }
    } catch (error) {
      logger.warn({ err: error, jid: key }, 'stored sandbox is not usable, creating a new one');
    }
    sessions.delete(key);
  }

  if (options.sandboxId) {
    return connectSandbox(jid, options.sandboxId, options);
  }

  return createSandbox(jid, options);
}

export async function killSandbox(jid) {
  const key = sessionKey(jid);
  const existing = sessions.get(key);
  let killed = false;

  if (existing?.sandbox) {
    try {
      killed = await existing.sandbox.kill();
    } catch (error) {
      logger.warn({ err: error, jid: key }, 'failed to kill sandbox instance');
    }
  } else if (existing?.sandboxId) {
    try {
      killed = await Sandbox.kill(existing.sandboxId, getClientOpts());
    } catch (error) {
      logger.warn({ err: error, jid: key }, 'failed to kill sandbox by id');
    }
  }

  sessions.delete(key);
  return killed;
}

export async function summarizeSandbox(sandbox) {
  const info = await sandbox.getInfo();
  return {
    sandboxId: sandbox.sandboxId,
    templateId: info.templateId || info.template_id || null,
    name: info.name || null,
    state: info.state || 'running',
    startedAt: info.startedAt || info.started_at || null,
    endAt: info.endAt || info.end_at || null,
    cpuCount: info.cpuCount || info.cpu_count || null,
    memoryMB: info.memoryMB || info.memory_mb || null,
  };
}
