import { Sandbox } from '@insforge/instabox-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getInstaboxOpts } from './client.js';

const sessions = new Map();
const METADATA_ROLE = 'owner-linux';

function sessionKey(jid) {
  return String(jid || 'unknown');
}

function userTag(jid) {
  return sessionKey(jid).slice(0, 120);
}

function machineName(jid) {
  const digits = String(jid || '').replace(/\D/g, '').slice(-10) || 'owner';
  return `jen404-${digits}`.toLowerCase().slice(0, 40);
}

function ownerMetadata(jid) {
  return {
    bot: 'jen404',
    role: METADATA_ROLE,
    user: userTag(jid),
  };
}

function store(jid, sandbox) {
  const record = {
    sandbox,
    sandboxId: sandbox.sandboxId,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(jid), record);
  return sandbox;
}

export function getStoredMachine(jid) {
  return sessions.get(sessionKey(jid)) || null;
}

export function forgetMachine(jid) {
  sessions.delete(sessionKey(jid));
}

export async function listOwnerMachines(jid, options = {}) {
  const listed = await Sandbox.list(getInstaboxOpts());
  if (options.allOwners) {
    const tagged = listed.filter((item) => item.metadata?.role === METADATA_ROLE || item.metadata?.bot === 'jen404');
    return tagged.length ? tagged : listed;
  }
  const mine = listed.filter((item) => item.metadata?.user === userTag(jid));
  return mine.length ? mine : listed;
}

export async function connectMachine(jid, machineId, options = {}) {
  const sandbox = await Sandbox.connect(machineId, {
    ...getInstaboxOpts(),
    resume: options.resume !== false,
  });
  return store(jid, sandbox);
}

export async function createMachine(jid, options = {}) {
  const template = String(options.template || env.INSTABOX_TEMPLATE || 'agent-browser').trim() || 'agent-browser';
  const createOpts = {
    ...getInstaboxOpts(),
    name: options.name || machineName(jid),
    metadata: ownerMetadata(jid),
    vault: false,
  };
  if (options.autoSuspendMs != null) {
    createOpts.autoSuspendMs = Number(options.autoSuspendMs);
  }

  try {
    const sandbox = await Sandbox.create(template, createOpts);
    logger.info({ jid: sessionKey(jid), sandboxId: sandbox.sandboxId, template }, 'created instabox machine');
    return store(jid, sandbox);
  } catch (error) {
    if (error?.code === 'quota_exceeded' || error?.status === 429) {
      const listed = await Sandbox.list(getInstaboxOpts());
      const chosen = pickExisting(listed, jid);
      if (chosen) {
        logger.info({ jid: sessionKey(jid), sandboxId: chosen.sandboxId }, 'reusing instabox machine after quota');
        return connectMachine(jid, chosen.sandboxId);
      }
    }
    throw error;
  }
}

async function ensureUsable(sandbox) {
  const running = await sandbox.isRunning();
  if (running) return sandbox;
  await sandbox.resume();
  return sandbox;
}

function pickExisting(listed, jid) {
  if (!listed?.length) return null;
  const tagged = listed.find((item) => item.metadata?.role === METADATA_ROLE && item.metadata?.user === userTag(jid));
  if (tagged) return tagged;
  const roleTagged = listed.find((item) => item.metadata?.role === METADATA_ROLE);
  if (roleTagged) return roleTagged;
  const named = listed.find((item) => String(item.name || '').startsWith('jen404-') || item.name === '404machine');
  if (named) return named;
  return listed[0];
}

export async function getOrCreateMachine(jid, options = {}) {
  const key = sessionKey(jid);
  const existing = sessions.get(key);
  if (existing?.sandbox) {
    try {
      await ensureUsable(existing.sandbox);
      return existing.sandbox;
    } catch (error) {
      logger.warn({ err: error, jid: key }, 'stored instabox machine is not usable');
      sessions.delete(key);
    }
  }

  const machineId = String(options.sandboxId || options.machineId || env.INSTABOX_MACHINE_ID || '').trim();
  if (machineId) {
    return connectMachine(jid, machineId, options);
  }

  try {
    const listed = await Sandbox.list(getInstaboxOpts());
    const chosen = pickExisting(listed, jid);
    if (chosen) {
      const sandbox = await connectMachine(jid, chosen.sandboxId, options);
      try {
        if (!chosen.metadata?.role) {
          await sandbox.setMetadata(ownerMetadata(jid));
        }
      } catch (error) {
        logger.warn({ err: error, sandboxId: chosen.sandboxId }, 'failed to tag instabox machine metadata');
      }
      return sandbox;
    }
  } catch (error) {
    logger.warn({ err: error, jid: key }, 'failed to list instabox machines');
  }

  return createMachine(jid, options);
}

export async function killMachine(jid, machineId) {
  const key = sessionKey(jid);
  const existing = sessions.get(key);
  const targetId = String(machineId || existing?.sandboxId || '').trim();
  let killed = false;

  if (existing?.sandbox && (!targetId || existing.sandboxId === targetId)) {
    try {
      killed = await existing.sandbox.kill();
    } catch (error) {
      logger.warn({ err: error, jid: key }, 'failed to kill instabox machine instance');
    }
    sessions.delete(key);
    return killed;
  }

  if (targetId) {
    try {
      killed = await Sandbox.kill(targetId, getInstaboxOpts());
    } catch (error) {
      logger.warn({ err: error, jid: key, machineId: targetId }, 'failed to kill instabox machine by id');
    }
  }

  if (!targetId || existing?.sandboxId === targetId) {
    sessions.delete(key);
  }
  return killed;
}

export async function summarizeMachine(sandbox) {
  const info = await sandbox.getInfo();
  const machine = info.machine || {};
  return {
    machineId: sandbox.sandboxId,
    sandboxId: sandbox.sandboxId,
    templateId: info.templateId || machine.templateId || null,
    name: info.name || machine.name || null,
    state: info.state || machine.state || null,
    startedAt: info.startedAt || machine.startedAt || null,
    autoSuspendMs: info.autoSuspendMs ?? null,
    metadata: info.metadata || machine.metadata || null,
    vcpus: machine.vcpus || machine.spec?.vcpus || null,
    memMiB: machine.memMiB || machine.spec?.memMiB || null,
  };
}
