import { getToolHandler } from './registry.js';

export async function executeToolCall(toolCall) {
  const name = toolCall?.function?.name;
  const handler = getToolHandler(name);
  if (!handler) {
    return {
      role: 'tool',
      tool_call_id: toolCall?.id,
      content: JSON.stringify({ error: `Unknown tool: ${name}` }),
    };
  }

  let args = {};
  try {
    args = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    args = {};
  }

  const result = await handler(args);
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  };
}
