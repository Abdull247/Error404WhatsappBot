import fs from 'node:fs';
import { logger } from '../utils/logger.js';

export async function sendArtifacts(sock, jid, artifacts = [], quoted) {
  for (const file of artifacts) {
    if (!file?.ok || !file.path || !fs.existsSync(file.path)) continue;
    try {
      await sock.sendMessage(
        jid,
        {
          document: fs.readFileSync(file.path),
          fileName: file.filename,
          mimetype: file.mimetype || 'text/plain',
        },
        quoted ? { quoted } : undefined,
      );
      logger.info({ jid, filename: file.filename }, 'sent generated file');
    } catch (error) {
      logger.error({ err: error, jid, filename: file.filename }, 'failed to send generated file');
    }
  }
}
