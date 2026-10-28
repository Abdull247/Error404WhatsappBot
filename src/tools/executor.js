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
  logger.info({ name, args: Object.keys(args) }, 'executing tool');

  try {
    const result = await handler(args, context);
    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
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
