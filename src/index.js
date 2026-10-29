import { ensureSessionDir, ensureToolsOutputDir, env } from './config/env.js';
import { appConfig } from './config/load-config.js';
import { runMigrations } from './db/migrate.js';
import { loadCommands } from './commands/index.js';
import { loadPersonalities } from './personalities/load.js';
import { startHealthServer } from './http/server.js';
import { initTools } from './tools/index.js';
import { logger } from './utils/logger.js';
import { createWhatsAppSocket } from './whatsapp/auth.js';
import { handleIncomingMessage } from './whatsapp/message-handler.js';

async function main() {
  if (env.WHATSAPP_AUTH_STORE !== 'postgres') {
    ensureSessionDir();
  }
  ensureToolsOutputDir();
  startHealthServer();
  await initTools();
  loadCommands();
  const personalities = loadPersonalities();
  logger.info(
    { model: appConfig.ai.model, bot: appConfig.bot.name, personalities: personalities.map((item) => item.id) },
    'starting WhatsApp AI bot',
  );
  await runMigrations();
  await createWhatsAppSocket({ onMessage: handleIncomingMessage });
}

main().catch((error) => {
  logger.error({ err: error }, 'fatal startup error');
  process.exit(1);
});
