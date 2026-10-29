import { appConfig } from '../../../config/load-config.js';
import { normalizeEmoji, reactToMessage } from '../../../whatsapp/react.js';

export async function handler(args = {}, context = {}) {
  const emoji = normalizeEmoji(args.emoji);
  if (!emoji) {
    return { ok: false, error: 'emoji is required' };
  }

  const group = Boolean(context.environment?.isGroup);
  if (group && appConfig.bot.reactInGroups === false) {
    return { ok: false, error: 'group reactions are disabled' };
  }
  if (!group && appConfig.bot.reactInDms !== true) {
    return { ok: false, error: 'DM reactions are disabled' };
  }
  if (!context.sock || !context.message) {
    return { ok: false, error: 'no WhatsApp message to react to' };
  }

  const sent = await reactToMessage(context.sock, context.message, emoji);
  if (sent && typeof context.markReaction === 'function') {
    context.markReaction(emoji);
  }

  return {
    ok: sent,
    emoji,
    error: sent ? undefined : 'failed to send reaction',
  };
}
