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

  if (!result.ok) return result;
  return {
    ok: true,
    id: result.id,
    status: result.status,
    maxRuntimeMinutes: result.maxRuntimeMinutes,
    reply: result.reply,
    instruction: 'Reply to the user with the reply field almost verbatim. Do not redo the task yourself.',
  };
}
