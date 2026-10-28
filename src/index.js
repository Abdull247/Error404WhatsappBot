import { ensureSessionDir } from './config/env.js';
import { appConfig } from './config/load-config.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './utils/logger.js';
import { createWhatsAppSocket } from './whatsapp/auth.js';
import { handleIncomingMessage } from './whatsapp/message-handler.js';

async function main() {
  ensureSessionDir();
  logger.info({ model: appConfig.ai.model, bot: appConfig.bot.name }, 'starting WhatsApp AI bot');
  await runMigrations();
  await createWhatsAppSocket({ onMessage: handleIncomingMessage });
}

main().catch((error) => {
  logger.error({ err: error }, 'fatal startup error');
  process.exit(1);
});
