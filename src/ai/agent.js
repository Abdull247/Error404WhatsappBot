import { appConfig } from '../config/load-config.js';
import { getChatSettings } from '../db/repositories/settings.js';
import { loadContext, saveTurn } from '../memory/store.js';
import { findPersonality, formatPersonalityPrompt, getDefaultPersonality } from '../personalities/load.js';
import { executeToolCall, loadTools } from '../tools/index.js';
import { isSlowTool } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import { reactToMessage } from '../whatsapp/react.js';
import { createChatCompletion } from './client.js';
import { isGreeting } from './greetings.js';
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

export async function generateReply({ jid, text, pushName, sock, message }) {
  let history = [];
  let memories = [];

  try {
    const context = await loadContext(jid);
    history = context.history;
    memories = context.memories;
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to load memory, continuing without it');
  }

  const lastHistory = history[history.length - 1];
  const historyForPrompt = lastHistory?.role === 'user' && lastHistory.content === text
    ? history.slice(0, -1)
    : history;

  let personality = getDefaultPersonality();
  try {
    const settings = await getChatSettings(jid);
    personality = findPersonality(settings?.personality) || personality;
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to load chat personality');
  }

  const messages = buildMessages({
    userText: text,
    history: historyForPrompt,
    memories,
    pushName,
    systemInstruction: formatPersonalityPrompt(personality),
  });

  const tools = loadTools();
  const greeting = isGreeting(text);
  const datetimeEnabled = tools.some((tool) => tool.function?.name === 'get_datetime');

  if (greeting && datetimeEnabled) {
    messages.push({
      role: 'system',
      content: 'The user greeted you. Call get_datetime with query="greeting" now. Then greet them by display name or firstName using greeting, timeOfDay, date, and timezone. Do not guess the time.',
    });
  }

  const artifacts = [];
  const maxRounds = appConfig.tools.maxRounds || 6;
  let lastMessage = null;
  let reactedBusy = false;
  const toolContext = { jid, pushName, text, sock, message };

  try {
    for (let round = 0; round < maxRounds; round += 1) {
      const toolChoice = greeting && datetimeEnabled && round === 0
        ? { type: 'function', function: { name: 'get_datetime' } }
        : undefined;
      const completion = await createChatCompletion({
        messages,
        tools,
        toolChoice,
        temperature: personality?.temperature,
      });
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
        if (!reactedBusy && isSlowTool(toolCall?.function?.name)) {
          await reactToMessage(sock, message, '\u231B');
          reactedBusy = true;
        }
        const result = await executeToolCall(toolCall, toolContext);
        messages.push(result.message);
        if (result.artifacts?.length) {
          artifacts.push(...result.artifacts);
        }
      }
    }
  } finally {
    if (reactedBusy) {
      await reactToMessage(sock, message, '\u2705');
    }
  }

  let reply = extractText(lastMessage);
  if (!reply && artifacts.length) {
    reply = defaultRecap(artifacts);
  }
  if (!reply) {
    reply = 'I could not generate a reply just now.';
  }

  saveTurn(jid, 'assistant', reply, {
    model: appConfig.ai.model,
    files: artifacts.map((file) => file.filename),
  }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save assistant turn');
  });

  return { text: reply, artifacts };
}
