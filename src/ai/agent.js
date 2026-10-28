import { appConfig } from '../config/load-config.js';
import { loadContext, saveTurn } from '../memory/store.js';
import { loadTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { createChatCompletion } from './client.js';
import { buildMessages } from './prompt.js';

function extractText(completion) {
  const choice = completion?.choices?.[0];
  const message = choice?.message;
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
  const completion = await createChatCompletion({ messages, tools });
  const reply = extractText(completion) || 'I could not generate a reply just now.';

  saveTurn(jid, 'user', text, { pushName }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save user turn');
  });
  saveTurn(jid, 'assistant', reply, {
    model: appConfig.ai.model,
    finishReason: completion?.choices?.[0]?.finish_reason ?? null,
  }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save assistant turn');
  });

  return reply;
}
