import { appConfig } from '../config/load-config.js';
import { loadContext, saveTurn } from '../memory/store.js';
import { loadTools } from '../tools/index.js';
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
  const { history, memories } = await loadContext(jid);
  const messages = buildMessages({
    userText: text,
    history,
    memories,
    pushName,
  });

  const tools = loadTools();
  const completion = await createChatCompletion({ messages, tools });
  const reply = extractText(completion) || 'I could not generate a reply just now.';

  await saveTurn(jid, 'user', text, { pushName });
  await saveTurn(jid, 'assistant', reply, {
    model: appConfig.ai.model,
    finishReason: completion?.choices?.[0]?.finish_reason ?? null,
  });

  return reply;
}
