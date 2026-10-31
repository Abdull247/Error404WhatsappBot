import { createPersistenceJob, persistenceAvailable } from '../../../persistence/manager.js';

export async function handler(args = {}, context = {}) {
  if (!persistenceAvailable()) {
    return {
      ok: false,
      error: 'Persistent agents are unavailable. Set supports_persistence_agent on a sandbox in sandboxes.json and keep persistenceAgent.enabled true.',
    };
  }

  const result = await createPersistenceJob({
    task: args.task,
    context: args.context,
    maxRuntimeMinutes: args.max_runtime_minutes ?? args.maxRuntimeMinutes,
    jid: context.jid,
    pushName: context.pushName,
    sock: context.sock,
    message: context.message,
  });

  if (result.busy) {
    return {
      ok: false,
      busy: true,
      error: result.error,
      cap: result.cap,
      runningCount: result.runningCount,
      instances: result.instances,
      instance: result.instance,
      reply: result.reply,
      instruction: 'A persistent agent is already running. Reply with the reply field almost verbatim, including job id, status, task, and the check/logs commands. Do not start the long task yourself.',
    };
  }
  if (!result.ok) return result;
  return {
    ok: true,
    id: result.id,
    status: result.status,
    maxRuntimeMinutes: result.maxRuntimeMinutes,
    reply: result.reply,
    instruction: 'Reply to the user with the reply field almost verbatim so they get the job id and the check/logs commands. Do not redo the task yourself.',
  };
}
