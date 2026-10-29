import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { unwrapMessageContent } from './filters.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function getImageMessage(message) {
  const content = unwrapMessageContent(message);
  return content.imageMessage || null;
}

export function hasImageMessage(message) {
  return Boolean(getImageMessage(message));
}

export async function downloadImageAttachment(sock, message) {
  const image = getImageMessage(message);
  if (!image) return null;

  try {
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: sock?.updateMediaMessage,
      },
    );
    if (!buffer || !buffer.length) return null;
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`image is too large (${buffer.length} bytes)`);
    }
    const mimetype = String(image.mimetype || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    return {
      mimetype,
      base64: Buffer.from(buffer).toString('base64'),
      size: buffer.length,
      caption: String(image.caption || '').trim(),
    };
  } catch (error) {
    logger.error({ err: error }, 'failed to download WhatsApp image');
    throw error;
  }
}
