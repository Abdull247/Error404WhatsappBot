import fs from 'node:fs';
import { logger } from '../utils/logger.js';

export async function sendArtifacts(sock, jid, artifacts = [], quoted) {
  for (const file of artifacts) {
    if (!file?.ok || !file.path || !fs.existsSync(file.path)) continue;
    try {
      const payload = (file.mimetype || '').startsWith('image/') && file.mimetype !== 'image/svg+xml'
        ? {
            image: fs.readFileSync(file.path),
            fileName: file.filename,
            mimetype: file.mimetype,
            caption: file.filename,
          }
        : {
            document: fs.readFileSync(file.path),
            fileName: file.filename,
            mimetype: file.mimetype || 'text/plain',
          };
      await sock.sendMessage(
        jid,
        payload,
        quoted ? { quoted } : undefined,
      );
      logger.info({ jid, filename: file.filename }, 'sent generated file');
    } catch (error) {
      logger.error({ err: error, jid, filename: file.filename }, 'failed to send generated file');
    }
  }
}
