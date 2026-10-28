export function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isStatusJid(jid) {
  return jid === 'status@broadcast';
}

export function extractText(message) {
  const content = message.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ''
  ).trim();
}

export function shouldIgnore(message) {
  if (!message?.message) return true;
  if (message.key?.fromMe) return true;
  if (message.message.protocolMessage) return true;
  if (message.message.reactionMessage) return true;
  return false;
}
