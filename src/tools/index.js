import { appConfig } from '../config/load-config.js';
import { getEnabledTools } from './registry.js';

export function loadTools() {
  if (!appConfig.tools.enabled) return [];
  return getEnabledTools(appConfig.tools.allow);
}
