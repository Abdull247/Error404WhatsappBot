import { appConfig } from '../config/load-config.js';
import { loadCatalog } from './catalog/load.js';
import { getEnabledTools, registerTool } from './registry.js';
import { logger } from '../utils/logger.js';

let loaded = false;

export async function initTools() {
  if (loaded) return;
  const catalog = await loadCatalog();
  for (const tool of catalog) {
    registerTool(tool.definition, tool.handler, tool.options);
  }
  loaded = true;
  logger.info({ tools: catalog.map((tool) => tool.name) }, 'tools loaded');
}

export function loadTools() {
  if (!appConfig.tools.enabled) return [];
  return getEnabledTools(appConfig.tools.allow);
}

export { executeToolCall } from './executor.js';
