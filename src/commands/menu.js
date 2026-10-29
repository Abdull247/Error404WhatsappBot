import { appConfig } from '../config/load-config.js';
import { listCommands } from './registry.js';

export function menuText() {
  const bot = appConfig.bot.name || 'Jen404';
  const prefix = appConfig.bot.commandPrefix || '.';
  const lines = [`*${bot} commands*`, ''];
  for (const command of listCommands()) {
    lines.push(`*${prefix}${command.name}*`);
    if (command.usage) lines.push(`  ${command.usage}`);
    if (command.description) lines.push(`  ${command.description}`);
    lines.push('');
  }
  lines.push('Personality switch example:');
  lines.push(`${prefix}personalities - Helpfulness`);
  return lines.join('\n').trim();
}

export async function handleMenu() {
  return menuText();
}
