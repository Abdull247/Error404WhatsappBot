import { appConfig } from '../config/load-config.js';

export function parseCommand(text) {
  const prefix = appConfig.bot.commandPrefix || '.';
  const raw = String(text || '').trim();
  if (!raw.startsWith(prefix) || raw.length <= prefix.length) return null;

  const body = raw.slice(prefix.length).trim();
  if (!body) return null;

  const dash = body.match(/^([A-Za-z][\w-]*)\s+-\s+(.+)$/);
  if (dash) {
    return {
      name: dash[1].toLowerCase(),
      arg: dash[2].trim(),
      raw,
    };
  }

  const colon = body.match(/^([A-Za-z][\w-]*)\s*:\s*(.+)$/);
  if (colon) {
    return {
      name: colon[1].toLowerCase(),
      arg: colon[2].trim(),
      raw,
    };
  }

  const parts = body.split(/\s+/);
  const name = parts.shift().toLowerCase();
  const arg = parts.join(' ').trim();
  return { name, arg: arg || '', raw };
}
