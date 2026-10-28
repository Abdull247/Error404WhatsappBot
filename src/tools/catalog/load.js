import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

const catalogDir = path.dirname(fileURLToPath(import.meta.url));

export async function loadCatalog() {
  const entries = fs.readdirSync(catalogDir, { withFileTypes: true });
  const tools = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folder = path.join(catalogDir, entry.name);
    const configPath = path.join(folder, 'config.json');
    const handlerPath = path.join(folder, 'handler.js');
    if (!fs.existsSync(configPath) || !fs.existsSync(handlerPath)) continue;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.enabled === false || !config.definition?.function?.name) continue;

    const mod = await import(pathToFileURL(handlerPath).href);
    const handler = mod.handler || mod.default;
    if (typeof handler !== 'function') {
      logger.warn({ folder: entry.name }, 'tool handler is not a function');
      continue;
    }

    tools.push({
      name: config.definition.function.name,
      definition: config.definition,
      options: config.options || {},
      handler: (args, context) => handler(args, context, config.options || {}),
    });
  }

  return tools;
}
