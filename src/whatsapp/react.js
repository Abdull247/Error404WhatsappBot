import { logger } from '../utils/logger.js';

export async function reactToMessage(sock, message, emoji) {
  if (!sock || !message?.key || !emoji) return;
  const jid = message.key.remoteJid;
  if (!jid) return;
  try {
    await sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: message.key,
      },
    });
  } catch (error) {
    logger.warn({ err: error, jid, emoji }, 'failed to react to message');
  }
}
