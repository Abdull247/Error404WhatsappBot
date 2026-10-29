import { appConfig } from '../config/load-config.js';
import { getChatSettings, setChatPersonality } from '../db/repositories/settings.js';
import { findPersonality, getDefaultPersonality, listPersonalities } from '../personalities/load.js';

function formatList(currentId) {
  const lines = ['*Personalities*', ''];
  for (const item of listPersonalities()) {
    const mark = item.id === currentId ? ' (active)' : '';
    lines.push(`- *${item.name}*${mark}`);
    if (item.description) lines.push(`  ${item.description}`);
  }
  lines.push('');
  const prefix = appConfig.bot.commandPrefix || '.';
  lines.push('Switch with:');
  lines.push(`${prefix}personalities - Helpfulness`);
  return lines.join('\n');
}

export async function handlePersonalities({ jid, arg }) {
  const settings = jid ? await getChatSettings(jid) : null;
  const current = findPersonality(settings?.personality)
    || getDefaultPersonality();

  if (!arg) {
    return formatList(current?.id);
  }

  const next = findPersonality(arg);
  if (!next) {
    return `I don't have a personality named "${arg}".\n\n${formatList(current?.id)}`;
  }

  if (jid) {
    await setChatPersonality(jid, next.id);
  }

  return `Switched this chat to *${next.name}*.\n${next.description || ''}`.trim();
}
