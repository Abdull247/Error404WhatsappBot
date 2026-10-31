import { getPersistenceConfig, persistenceFeatureEnabled } from '../config/persistence.js';
import { env } from '../config/env.js';
import { claimNextJob, updateJob } from '../db/repositories/persistence/jobs.js';
import { addLog } from '../db/repositories/persistence/logs.js';
import { executePersistenceJob } from './executor.js';
import { createWorkerId } from './ids.js';
import { queueJobNotification, flushNotifications } from './notifications.js';
import { logger } from '../utils/logger.js';

let timer = null;
let running = false;
let active = 0;
let workerId = '';
let stopping = false;

function terminalPatch(job, outcome) {
  const now = new Date().toISOString();
  const status = outcome.status || 'failed';
  return {
    status,
    result: outcome.result || job.result || null,
    error: outcome.error || (status === 'failed' ? 'agent failed' : null),
    progress: job.progress || status,
    completedAt: now,
    leaseUntil: null,
    workerId,
  };
}

async function runClaimed(job) {
  try {
    await addLog({ jobId: job.id, message: `claimed by ${workerId}`, data: { attempt: job.attempt } });
    const outcome = await executePersistenceJob(job, {
      workerId,
      shouldStop: () => stopping,
    });
    if (['lost_lease', 'stopped'].includes(outcome.status)) {
      await addLog({ jobId: job.id, level: 'warn', message: `released: ${outcome.status}` });
      return;
    }
    const status = outcome.status === 'cancelled' || outcome.status === 'timed_out' || outcome.status === 'completed' || outcome.status === 'failed'
      ? outcome.status
      : 'interrupted';
    const latestPatch = terminalPatch(job, { ...outcome, status });
    if (outcome.artifacts?.length) {
      latestPatch.metadata = {
        ...(job.metadata || {}),
        artifacts: outcome.artifacts.map((file) => ({
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
        })),
      };
    }
    const updated = await updateJob(job.id, latestPatch);
    await addLog({
      jobId: job.id,
      level: status === 'completed' ? 'info' : 'warn',
      message: `finished: ${status}`,
    });
    if (getPersistenceConfig().notifyOnComplete && updated) {
      await queueJobNotification(updated, status);
    }
  } catch (error) {
    logger.error({ err: error, jobId: job.id }, 'persistence worker job failed');
    const failed = await updateJob(job.id, {
      status: 'failed',
      error: error.message,
      completedAt: new Date().toISOString(),
      leaseUntil: null,
    });
    if (failed) await queueJobNotification(failed, 'failed');
  }
}

async function tick() {
  if (stopping || running) return;
  running = true;
  try {
    await flushNotifications();
    const config = getPersistenceConfig();
    while (active < config.maxConcurrent) {
      const job = await claimNextJob(workerId, config.leaseSeconds, config.maxConcurrent);
      if (!job) break;
      if (job.attempt > config.maxAttempts) {
        const failed = await updateJob(job.id, {
          status: 'failed',
          error: `Exceeded max attempts (${config.maxAttempts})`,
          completedAt: new Date().toISOString(),
          leaseUntil: null,
        });
        if (failed) await queueJobNotification(failed, 'failed');
        continue;
      }
      active += 1;
      runClaimed(job).finally(() => {
        active -= 1;
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'persistence worker tick failed');
  } finally {
    running = false;
  }
}

export function startPersistenceWorker() {
  if (timer || !persistenceFeatureEnabled()) return false;
  workerId = env.PERSISTENCE_WORKER_ID || createWorkerId();
  const config = getPersistenceConfig();
  timer = setInterval(() => {
    tick();
  }, config.pollIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick();
  logger.info({ workerId, pollIntervalMs: config.pollIntervalMs, maxConcurrent: config.maxConcurrent }, 'persistence worker started');
  return true;
}

export function stopPersistenceWorker() {
  stopping = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function persistenceWorkerStatus() {
  return {
    workerId,
    active,
    running: Boolean(timer),
  };
}

export function wakePersistenceWorker() {
  if (timer) tick();
}
