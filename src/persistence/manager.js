import { appConfig } from '../config/load-config.js';
import { getPersistenceConfig, persistenceFeatureEnabled } from '../config/persistence.js';
import { isGroupJid } from '../whatsapp/filters.js';
import { HOURGLASS, reactToMessage } from '../whatsapp/react.js';
import { captureMessageAttachments } from './files.js';
import { createJobId } from './ids.js';
import { queuedReply, formatJobCard, formatJobList, formatLogs } from './format.js';
import { parseJobId } from './ids.js';
import {
  insertJob,
  getJobForChat,
  listJobsForChat,
  countActiveJobs,
  requestCancel,
} from '../db/repositories/persistence/jobs.js';
import { latestSteps } from '../db/repositories/persistence/steps.js';
import { addLog, listLogs } from '../db/repositories/persistence/logs.js';
import { listJobFiles } from '../db/repositories/persistence/files.js';
import { wakePersistenceWorker } from './worker.js';
import { logger } from '../utils/logger.js';

function prefix() {
  return appConfig.bot.commandPrefix || '.';
}

function commandName() {
  return getPersistenceConfig().command;
}

export function persistenceAvailable() {
  return persistenceFeatureEnabled();
}

export async function createPersistenceJob({
  task,
  context = '',
  maxRuntimeMinutes,
  jid,
  pushName = null,
  sock = null,
  message = null,
}) {
  if (!persistenceAvailable()) {
    return { ok: false, error: 'Persistent agents are disabled. Enable supports_persistence_agent on a sandbox and persistenceAgent.enabled in config.json.' };
  }
  const cleanTask = String(task || '').trim();
  if (!cleanTask) return { ok: false, error: 'task is required' };
  if (!jid) return { ok: false, error: 'no WhatsApp chat context' };

  const config = getPersistenceConfig();
  const active = await countActiveJobs();
  if (active >= config.maxConcurrent * 4) {
    return { ok: false, error: `Too many persistent agents are already queued (${active}). Try again later.` };
  }

  const minutes = Number.parseInt(maxRuntimeMinutes, 10);
  const runtimeMinutes = Number.isFinite(minutes) && minutes > 0
    ? Math.min(minutes, config.maxRuntimeMinutes)
    : config.maxRuntimeMinutes;
  const id = createJobId();

  if (sock && message) {
    await reactToMessage(sock, message, HOURGLASS);
  }

  const job = await insertJob({
    id,
    ownerJid: jid,
    chatJid: jid,
    chatType: isGroupJid(jid) ? 'group' : 'dm',
    pushName,
    sourceMessageId: message?.key?.id || null,
    task: cleanTask,
    context: String(context || '').trim() || null,
    status: 'queued',
    progress: 'Queued',
    metadata: {
      source: 'create_agent',
    },
    maxRuntimeSeconds: runtimeMinutes * 60,
  });

  if (sock && message) {
    try {
      await captureMessageAttachments({ sock, message, jobId: id, jid });
    } catch (error) {
      logger.warn({ err: error, jobId: id }, 'failed to capture persistence attachments');
    }
  }

  await addLog({ jobId: id, message: 'job queued', data: { task: cleanTask } });
  wakePersistenceWorker();

  return {
    ok: true,
    id: job.id,
    status: job.status,
    maxRuntimeMinutes: runtimeMinutes,
    reply: queuedReply(job, { prefix: prefix(), command: commandName() }),
  };
}

export async function inspectJob(jid, rawId) {
  const id = parseJobId(rawId);
  const job = await getJobForChat(id, jid);
  if (!job) return `No persistent agent \`${id}\` in this chat.`;
  const [steps, files] = await Promise.all([
    latestSteps(id, { limit: 8 }),
    listJobFiles(id),
  ]);
  return formatJobCard(job, {
    prefix: prefix(),
    command: commandName(),
    steps,
    files,
  });
}

export async function inspectLogs(jid, rawId) {
  const id = parseJobId(rawId);
  const job = await getJobForChat(id, jid);
  if (!job) return `No persistent agent \`${id}\` in this chat.`;
  const logs = await listLogs(id, { limit: 30 });
  return `*Logs for* \`${id}\`\n\n${formatLogs(logs)}`;
}

export async function inspectResult(jid, rawId) {
  const id = parseJobId(rawId);
  const job = await getJobForChat(id, jid);
  if (!job) return `No persistent agent \`${id}\` in this chat.`;
  if (!job.result && !job.error) {
    return formatJobCard(job, { prefix: prefix(), command: commandName() });
  }
  return [
    `*Result for* \`${id}\``,
    `Status: ${job.status}`,
    '',
    job.result || job.error,
  ].join('\n');
}

export async function listChatJobs(jid) {
  const jobs = await listJobsForChat(jid, { limit: 8 });
  return formatJobList(jobs, { prefix: prefix(), command: commandName() });
}

export async function cancelChatJob(jid, rawId) {
  const id = parseJobId(rawId);
  const job = await requestCancel(id, jid);
  if (!job) {
    const existing = await getJobForChat(id, jid);
    if (!existing) return `No persistent agent \`${id}\` in this chat.`;
    return `Agent \`${id}\` is already ${existing.status}.`;
  }
  wakePersistenceWorker();
  return `Cancellation requested for \`${id}\`. It will stop after the current step.`;
}
