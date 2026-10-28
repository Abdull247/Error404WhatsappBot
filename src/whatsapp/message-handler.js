import { appConfig } from '../config/load-config.js';
import { generateReply } from '../ai/agent.js';
import { rememberUser } from '../memory/store.js';
import { logger } from '../utils/logger.js';
import { extractText, isGroupJid, isStatusJid, shouldIgnore } from './filters.js';

export async function handleIncomingMessage(sock, message) {
  if (shouldIgnore(message)) return;

  const jid = message.key.remoteJid;
  if (!jid) return;
  if (appConfig.bot.ignoreStatus && isStatusJid(jid)) return;

  const group = isGroupJid(jid);
  if (group && appConfig.bot.ignoreGroups) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const botJid = sock.user?.id?.split(':')[0];
    const mentionedBot = botJid && mentioned.some((id) => id.startsWith(botJid));
    if (!(appConfig.bot.respondToMentionsInGroups && mentionedBot)) return;
  }

  const text = extractText(message);
  if (!text) return;

  const pushName = message.pushName || null;
  await rememberUser(jid, pushName);

  if (appConfig.bot.markMessagesRead) {
    await sock.readMessages([message.key]);
  }

  if (appConfig.bot.typingIndicator) {
    await sock.sendPresenceUpdate('composing', jid);
  }

  try {
    const reply = await generateReply({ jid, text, pushName });
    await sock.sendMessage(jid, { text: reply }, { quoted: message });
  } catch (error) {
    logger.error({ err: error, jid }, 'failed to generate or send reply');
    await sock.sendMessage(jid, {
      text: 'Sorry, I ran into a problem handling that message.',
    });
  } finally {
    if (appConfig.bot.typingIndicator) {
      await sock.sendPresenceUpdate('paused', jid);
    }
  }
}
