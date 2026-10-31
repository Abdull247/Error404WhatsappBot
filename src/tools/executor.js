import { getToolHandler } from './registry.js';
import { logger } from '../utils/logger.js';

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function executeToolCall(toolCall, context = {}) {
  const name = toolCall?.function?.name;
  const handler = getToolHandler(name);
  if (!handler) {
    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall?.id,
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
      },
      artifacts: [],
    };
  }

  const args = parseArgs(toolCall.function?.arguments);
  logger.info({
    name,
    args: Object.keys(args),
    action: args.action || null,
    path: args.path || null,
    machineId: args.machineId || args.sandboxId || null,
    jobId: args.id || null,
    task: typeof args.task === 'string' ? args.task.slice(0, 180) : undefined,
  }, 'executing tool');

  try {
    const result = await handler(args, context);
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    if (name === 'create_agent' || result?.id || result?.busy) {
      logger.info({
        name,
        ok: result?.ok,
        busy: result?.busy,
        jobId: result?.id || result?.instance?.id,
        status: result?.status,
      }, 'tool finished');
    } else {
      logger.info({
        name,
        ok: result?.ok,
        machineId: result?.machineId || args.machineId || args.sandboxId || null,
        output: content.slice(0, 400),
      }, 'tool finished');
    }
    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall.id,
        content,
      },
      artifacts: Array.isArray(result?.files) ? result.files.filter((file) => file.ok && file.attachment) : [],
    };
  } catch (error) {
    logger.error({ err: error, name }, 'tool execution failed');
    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: error.message }),
      },
      artifacts: [],
    };
  }
}
