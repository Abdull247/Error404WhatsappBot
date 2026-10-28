import { appConfig } from '../config/load-config.js';
import { loadContext, saveTurn } from '../memory/store.js';
import { executeToolCall, loadTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { createChatCompletion } from './client.js';
import { buildMessages } from './prompt.js';

function extractText(message) {
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }

  return '';
}

function getToolCalls(message) {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    return message.tool_calls;
  }
  return [];
}

function defaultRecap(artifacts) {
  const names = artifacts.map((file) => file.filename).filter(Boolean);
  if (!names.length) return "I've finished.";
  if (names.length === 1) return `I've finished. I created ${names[0]} and sent it to you.`;
  return `I've finished. I created ${names.join(', ')} and sent them to you.`;
}

export async function generateReply({ jid, text, pushName }) {
  let history = [];
  let memories = [];

  try {
    const context = await loadContext(jid);
    history = context.history;
    memories = context.memories;
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to load memory, continuing without it');
  }

  const messages = buildMessages({
    userText: text,
    history,
    memories,
    pushName,
  });

  const tools = loadTools();
  const artifacts = [];
  const maxRounds = appConfig.tools.maxRounds || 6;
  let lastMessage = null;

  for (let round = 0; round < maxRounds; round += 1) {
    const completion = await createChatCompletion({ messages, tools });
    lastMessage = completion?.choices?.[0]?.message || null;
    if (!lastMessage) break;

    const toolCalls = getToolCalls(lastMessage);
    messages.push({
      role: 'assistant',
      content: lastMessage.content ?? null,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    });

    if (!toolCalls.length) break;

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall, { jid, pushName, text });
      messages.push(result.message);
      if (result.artifacts?.length) {
        artifacts.push(...result.artifacts);
      }
    }
  }

  let reply = extractText(lastMessage);
  if (!reply && artifacts.length) {
    reply = defaultRecap(artifacts);
  }
  if (!reply) {
    reply = 'I could not generate a reply just now.';
  }

  saveTurn(jid, 'user', text, { pushName }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save user turn');
  });
  saveTurn(jid, 'assistant', reply, {
    model: appConfig.ai.model,
    files: artifacts.map((file) => file.filename),
  }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save assistant turn');
  });

  return { text: reply, artifacts };
}
