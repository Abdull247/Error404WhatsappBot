import { appConfig } from '../config/load-config.js';
import { getAiRuntime } from '../config/providers.js';
import { getChatSettings } from '../db/repositories/settings.js';
import { loadContext, saveTurn } from '../memory/store.js';
import { findPersonality, formatPersonalityPrompt, getDefaultPersonality } from '../personalities/load.js';
import { executeToolCall, loadTools } from '../tools/index.js';
import { isSlowTool } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import { BUSY_REACTIONS, reactToMessage } from '../whatsapp/react.js';
import { formatEnvironmentPrompt } from '../whatsapp/group.js';
import { isOwnerJid } from '../whatsapp/owner.js';
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

export async function generateReply({
  jid,
  text,
  pushName,
  sock,
  message,
  environment = null,
  existingReaction = '',
  image = null,
}) {
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
  const historyForPrompt = lastHistory?.role === 'user'
    && (lastHistory.content === text || lastHistory.metadata?.replied)
    ? history.slice(0, -1)
    : history;

  let personality = getDefaultPersonality();
  try {
    const settings = await getChatSettings(jid);
    personality = findPersonality(settings?.personality) || personality;
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to load chat personality');
  }

  const owner = isOwnerJid(jid, sock);
  const runtime = getAiRuntime();
  const visionImage = runtime.imageSupport ? image : null;
  const messages = buildMessages({
    userText: text,
    history: historyForPrompt,
    memories,
    pushName,
    systemInstruction: formatPersonalityPrompt(personality),
    environment: {
      ...environment,
      prompt: formatEnvironmentPrompt(environment),
    },
    image: visionImage,
  });

  const tools = loadTools({
    jid,
    sock,
    isOwner: owner,
  });
  const greeting = Boolean(text) && isGreeting(text);
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
  let expressiveReaction = existingReaction || '';
  const toolContext = {
    jid,
    pushName,
    text,
    sock,
    message,
    environment,
    markReaction(emoji) {
      if (emoji && !BUSY_REACTIONS.has(emoji)) {
        expressiveReaction = emoji;
      }
    },
  };

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
        runtime,
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
        if (!reactedBusy && !expressiveReaction && isSlowTool(toolCall?.function?.name)) {
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
    if (reactedBusy && !expressiveReaction) {
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
    model: runtime.modelId,
    provider: runtime.providerId,
    files: artifacts.map((file) => file.filename),
  }).catch((error) => {
    logger.warn({ err: error, jid }, 'failed to save assistant turn');
  });

  return { text: reply, artifacts, reaction: expressiveReaction || null };
}
