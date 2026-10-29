import { extractMessageContent } from '@whiskeysockets/baileys';

export function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isStatusJid(jid) {
  return jid === 'status@broadcast';
}

export function unwrapMessageContent(message) {
  return extractMessageContent(message?.message) || message?.message || {};
}

export function extractText(message) {
  const content = unwrapMessageContent(message);
  const text = (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();

  return text;
}

export function shouldIgnore(message) {
  if (!message) return true;
  if (message.key?.remoteJid === 'status@broadcast') return true;
  if (message.messageStubType) return true;

  const content = unwrapMessageContent(message);
  if (!content || !Object.keys(content).length) return true;
  if (content.protocolMessage) return true;
  if (content.reactionMessage) return true;
  if (content.senderKeyDistributionMessage && Object.keys(content).length === 1) return true;
  return false;
}
