import { ensureSessionDir, ensureToolsOutputDir, env } from './config/env.js';
import { appConfig } from './config/load-config.js';
import { getAiRuntime } from './config/providers.js';
import { getPersistenceConfig, persistenceFeatureEnabled } from './config/persistence.js';
import { getDefaultSandbox } from './config/sandboxes.js';
import { listStickers } from './config/stickers.js';
import { runMigrations } from './db/migrate.js';
import { loadCommands } from './commands/index.js';
import { loadPersonalities } from './personalities/load.js';
import { startHealthServer } from './http/server.js';
import { startPersistenceWorker } from './persistence/worker.js';
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
  const runtime = getAiRuntime();
  const sandbox = getDefaultSandbox();
  const persistence = getPersistenceConfig();
  logger.info(
    {
      provider: runtime.providerId,
      model: runtime.modelId,
      imageSupport: runtime.imageSupport,
      sandbox: sandbox ? { id: sandbox.id, type: sandbox.type, tool: sandbox.tool, supportsPersistenceAgent: sandbox.supportsPersistenceAgent } : null,
      persistenceAgent: {
        enabled: persistenceFeatureEnabled(),
        model: persistence.defaultModel,
        command: persistence.command,
      },
      stickers: listStickers().map((sticker) => sticker.id),
      bot: appConfig.bot.name,
      personalities: personalities.map((item) => item.id),
    },
    'starting WhatsApp AI bot',
  );
  await runMigrations();
  startPersistenceWorker();
  await createWhatsAppSocket({ onMessage: handleIncomingMessage });
}

main().catch((error) => {
  logger.error({ err: error }, 'fatal startup error');
  process.exit(1);
});
