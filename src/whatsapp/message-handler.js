import { appConfig } from '../config/load-config.js';
import { generateReply } from '../ai/agent.js';
import { rememberUser } from '../memory/store.js';
import { logger } from '../utils/logger.js';
import { extractText, isGroupJid, isStatusJid, shouldIgnore, unwrapMessageContent } from './filters.js';
import { sendArtifacts } from './send.js';

const inflight = new Set();

function mentionedBot(sock, message) {
  const content = unwrapMessageContent(message);
  const mentioned = content.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const botJid = sock.user?.id?.split(':')[0];
  return Boolean(botJid && mentioned.some((id) => String(id).startsWith(botJid)));
}

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

  const group = isGroupJid(jid);
  if (group && appConfig.bot.ignoreGroups && !mentionedBot(sock, message)) return;

  const ageMs = Date.now() - Number(message.messageTimestamp || 0) * 1000;
  if (Number.isFinite(ageMs) && ageMs > 2 * 60 * 1000) {
    logger.debug({ jid, ageMs }, 'ignored stale WhatsApp message');
    return;
  }

  const text = extractText(message);
  if (!text) {
    logger.debug({ jid }, 'ignored message with no text');
    return;
  }

  const messageId = message.key.id || `${jid}:${text}`;
  if (inflight.has(messageId)) return;
  inflight.add(messageId);

  const pushName = message.pushName || null;
  logger.info({ jid, pushName, text }, 'incoming WhatsApp message');

  await showTyping(sock, jid);

  if (appConfig.bot.markMessagesRead) {
    sock.readMessages([message.key]).catch((error) => {
      logger.warn({ err: error, jid }, 'failed to mark message as read');
    });
  }

  try {
    rememberUser(jid, pushName).catch((error) => {
      logger.warn({ err: error, jid }, 'failed to persist user, continuing without memory write');
    });

    const reply = await generateReply({ jid, text, pushName });
    const artifacts = reply.artifacts || [];
    const replyText = typeof reply === 'string' ? reply : reply.text;

    if (artifacts.length) {
      await sendArtifacts(sock, jid, artifacts, message);
    }

    await sock.sendMessage(jid, { text: replyText }, { quoted: message });
    logger.info({ jid, files: artifacts.length }, 'sent WhatsApp reply');
  } catch (error) {
    logger.error({ err: error, jid }, 'failed to generate or send reply');
    try {
      await sock.sendMessage(jid, {
        text: 'Sorry, I ran into a problem handling that message.',
      });
    } catch (sendError) {
      logger.error({ err: sendError, jid }, 'failed to send error reply');
    }
  } finally {
    await stopTyping(sock, jid);
    inflight.delete(messageId);
  }
}
