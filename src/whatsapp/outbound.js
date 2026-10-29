const recent = new Map();
const WINDOW_MS = 20000;

export function markBotReply(jid) {
  if (!jid) return;
  recent.set(jid, Date.now());
}

export function wasRecentBotReply(jid) {
  const at = recent.get(jid);
  if (!at) return false;
  if (Date.now() - at > WINDOW_MS) {
    recent.delete(jid);
    return false;
  }
  return true;
}
