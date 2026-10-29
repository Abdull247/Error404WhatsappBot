import { countChats, findChats, listChats } from '../../../db/repositories/chats.js';
import { isOwnerJid } from '../../../whatsapp/owner.js';

function cleanType(value) {
  const type = String(value || 'all').trim().toLowerCase();
  if (['dm', 'direct', 'private', 'user'].includes(type)) return 'dm';
  if (['group', 'groups', 'g.us'].includes(type)) return 'group';
  return 'all';
}

function clampLimit(value, fallback) {
  const limit = Number.parseInt(value ?? fallback, 10);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, limit));
}

function summarize(chat) {
  return {
    jid: chat.jid,
    name: chat.name || chat.jid,
    type: chat.type,
    lastMessage: chat.last_message || null,
    lastSender: chat.last_sender || null,
    lastMessageAt: chat.last_message_at || null,
    messageCount: chat.message_count || 0,
  };
}

export async function handler(args = {}, context = {}, options = {}) {
  if (!isOwnerJid(context.jid, context.sock)) {
    return { ok: false, error: 'list_chats is only available to the bot owner in a direct chat.' };
  }

  const limit = clampLimit(args.limit, options.limit || 20);
  const type = cleanType(args.type);
  const query = String(args.query || '').trim();

  const rows = query
    ? await findChats(query, Math.max(limit, 30))
    : await listChats({ limit: Math.max(limit, 40) });

  const chats = rows
    .filter((chat) => type === 'all' || chat.type === type)
    .slice(0, limit)
    .map(summarize);

  const counts = await countChats();
  return {
    ok: true,
    query: query || null,
    type,
    counts,
    chats,
  };
}
