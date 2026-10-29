import { appConfig } from '../config/load-config.js';
import { env } from '../config/env.js';
import { generateReply } from '../ai/agent.js';
import { tryHandleCommand } from '../commands/index.js';
import { rememberUser } from '../memory/store.js';
import { logger } from '../utils/logger.js';
import { getAiRuntime } from '../config/providers.js';
import { extractText, isGroupJid, isStatusJid, shouldIgnore, stripBotMention } from './filters.js';
import { downloadImageAttachment, hasImageMessage } from './media.js';
import {
  botJids,
  botNames,
  buildChatEnvironment,
  loadGroupDetails,
  shouldReplyToMessage,
} from './group.js';
import { logIncomingMessage } from './log-message.js';
import { markBotReply, wasRecentBotReply } from './outbound.js';
import { pickGroupReaction, reactToMessage } from './react.js';
import { sendArtifacts } from './send.js';

const inflight = new Set();

async function showTyping(sock, jid) {
  if (!appConfig.bot.typingIndicator) return;
  try {
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate('composing', jid);
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to show typing indicator');
  }
}

async function stopTyping(sock, jid) {
  if (!appConfig.bot.typingIndicator) return;
  try {
    await sock.sendPresenceUpdate('paused', jid);
  } catch (error) {
    logger.warn({ err: error, jid }, 'failed to clear typing indicator');
  }
}

export async function handleIncomingMessage(sock, message) {
  if (shouldIgnore(message)) return;

  const jid = message.key.remoteJid;
  if (!jid) return;
  if (appConfig.bot.ignoreStatus && isStatusJid(jid)) return;

  const text = extractText(message);
  const hasImage = hasImageMessage(message);
  if (!text && !hasImage) {
    logger.debug({ jid }, 'ignored message with no text');
    return;
  }

  const ageMs = Date.now() - Number(message.messageTimestamp || 0) * 1000;
  if (Number.isFinite(ageMs) && ageMs > env.WHATSAPP_MAX_STALE_MS) {
    logger.info(
      { jid, ageMs, limitMs: env.WHATSAPP_MAX_STALE_MS },
      'ignored stale message; if this happens often the host was asleep too long (free tier)',
    );
    return;
  }

  const messageId = message.key.id || `${jid}:${text}`;
  if (inflight.has(messageId)) return;
  inflight.add(messageId);

  const group = isGroupJid(jid);
  const fromMe = Boolean(message.key?.fromMe);
  const pushName = message.pushName || null;
  const addressing = shouldReplyToMessage(sock, message, { jid, text, fromMe, group });
  const { shouldReply, mentioned, replyToBot, trigger } = addressing;
  if (group && !shouldReply && !fromMe) {
    logger.debug(
      { jid, trigger, mentioned, replyToBot, text: text.slice(0, 120) },
      'group message not addressed to bot',
    );
  }
  const shouldLog = (!group || appConfig.bot.logGroupMessages !== false)
    && !(fromMe && wasRecentBotReply(jid));

  try {
    if (shouldLog) {
      const logPromise = logIncomingMessage(sock, message, {
        text,
        pushName,
        replied: shouldReply,
        mentioned,
        replyToBot,
      });
      if (shouldReply) {
        await logPromise;
      } else {
        logPromise.catch((error) => {
          logger.warn({ err: error, jid }, 'failed to log incoming chat');
        });
      }
    }

    if (!shouldReply) return;

    const groupDetails = group ? await loadGroupDetails(sock, jid) : null;
    const environment = buildChatEnvironment({
      message,
      jid,
      pushName,
      group,
      mentioned,
      replyToBot,
      trigger,
      groupDetails,
    });
    const promptText = group
      ? (stripBotMention(text, botNames(sock), botJids(sock)) || text)
      : text;

    logger.info(
      { jid, pushName, group, mentioned, replyToBot, trigger, text },
      'incoming WhatsApp message',
    );

    const prefix = appConfig.bot.commandPrefix || '.';
    let existingReaction = '';
    if (group && appConfig.bot.reactInGroups !== false && !promptText.startsWith(prefix)) {
      const quickReaction = pickGroupReaction(promptText);
      if (quickReaction && await reactToMessage(sock, message, quickReaction)) {
        existingReaction = quickReaction;
      }
    }

    await showTyping(sock, jid);

    if (appConfig.bot.markMessagesRead) {
      sock.readMessages([message.key]).catch((error) => {
        logger.warn({ err: error, jid }, 'failed to mark message as read');
      });
    }

    if (!group) {
      rememberUser(jid, pushName).catch((error) => {
        logger.warn({ err: error, jid }, 'failed to persist user, continuing without memory write');
      });
    }

    const commandReply = promptText && promptText.startsWith(prefix)
      ? await tryHandleCommand({
          text: promptText,
          jid,
          pushName,
          sock,
          message,
          environment,
        })
      : null;
    let image = null;
    const vision = getAiRuntime().imageSupport;
    if (commandReply == null && hasImage && vision) {
      try {
        image = await downloadImageAttachment(sock, message);
      } catch (error) {
        logger.warn({ err: error, jid }, 'failed to download attached image');
      }
    }
    const replyTextInput = promptText
      || (image ? '' : (hasImage ? 'The user sent an image.' : ''));
    const reply = commandReply == null
      ? await generateReply({
          jid,
          text: replyTextInput,
          pushName,
          sock,
          message,
          environment,
          existingReaction,
          image,
        })
      : { text: commandReply, artifacts: [] };
    const artifacts = reply.artifacts || [];
    const replyText = typeof reply === 'string' ? reply : reply.text;

    if (artifacts.length) {
      await sendArtifacts(sock, jid, artifacts, message);
    }

    markBotReply(jid);
    await sock.sendMessage(jid, { text: replyText }, { quoted: message });
    logger.info({ jid, files: artifacts.length, group }, 'sent WhatsApp reply');
  } catch (error) {
    logger.error({ err: error, jid }, 'failed to generate or send reply');
    try {
      await sock.sendMessage(jid, {
        text: 'Sorry, I ran into a problem handling that message.',
      }, { quoted: message });
    } catch (sendError) {
      logger.error({ err: sendError, jid }, 'failed to send error reply');
    }
  } finally {
    if (shouldReply) {
      await stopTyping(sock, jid);
    }
    inflight.delete(messageId);
  }
}
