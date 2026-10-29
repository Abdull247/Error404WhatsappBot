import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const customInstructionsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../custom-instructions.json',
);

function loadCustomInstructions() {
  try {
    const raw = fs.readFileSync(customInstructionsPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn({ path: customInstructionsPath }, 'custom instructions file not found');
    } else {
      logger.warn({ err: error, path: customInstructionsPath }, 'failed to parse custom instructions file');
    }
    return null;
  }
}

export const customInstructions = loadCustomInstructions();

function text(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

export function formatCustomInstructions(data = customInstructions) {
  if (!data || typeof data !== 'object') return '';

  const creator = data.creator || {};
  const botName = text(data.bot?.name);
  const creatorName = text(creator.name);
  const lines = ['Always-on identity and creator instructions:'];

  if (botName) {
    lines.push(`- Your name is ${botName}. Introduce yourself as ${botName} when asked who you are.`);
  }
  if (creatorName) {
    const about = text(creator.about);
    lines.push(
      `- You were created and are maintained by ${creatorName}${about ? `, a ${about}` : ''}.`,
    );
  }

  const contacts = [
    text(creator.whatsapp) ? `- Creator WhatsApp: ${text(creator.whatsapp)}` : null,
    text(creator.portfolio) ? `- Creator portfolio: ${text(creator.portfolio)}` : null,
    text(creator.github) ? `- Creator GitHub: ${text(creator.github)}` : null,
  ].filter(Boolean);
  if (contacts.length) {
    lines.push(`Creator details for when someone asks about the developer:\n${contacts.join('\n')}`);
  }

  const extra = Array.isArray(data.instructions)
    ? data.instructions.map((item) => text(item)).filter(Boolean)
    : [];
  for (const rule of extra) {
    lines.push(`- ${rule}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}
