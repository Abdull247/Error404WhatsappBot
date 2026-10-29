import { logger } from '../utils/logger.js';
import { handleMenu } from './menu.js';
import { parseCommand } from './parse.js';
import { handlePersonalities } from './personalities.js';
import { getCommand, listCommands, registerCommand } from './registry.js';

let loaded = false;

function loadCommands() {
  if (loaded) return;
  registerCommand({
    name: 'menu',
    aliases: ['help', 'commands'],
    usage: '.menu',
    description: 'List all available commands.',
    handler: handleMenu,
  });
  registerCommand({
    name: 'personalities',
    aliases: ['personality', 'persona'],
    usage: '.personalities  |  .personalities - Helpfulness',
    description: 'List AI personalities, or switch this chat to one.',
    handler: handlePersonalities,
  });
  loaded = true;
  logger.info({ commands: listCommands().map((item) => item.name) }, 'commands loaded');
}

export async function tryHandleCommand({ text, jid, pushName, sock, message, environment }) {
  loadCommands();
  const parsed = parseCommand(text);
  if (!parsed) return null;

  const command = getCommand(parsed.name);
  if (!command) {
    return `Unknown command .${parsed.name}. Send .menu for the list.`;
  }

  return command.handler({
    jid,
    pushName,
    sock,
    message,
    environment,
    arg: parsed.arg,
    raw: parsed.raw,
  });
}

export { loadCommands, parseCommand };
