import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from '../config/load-config.js';
import { logger } from '../utils/logger.js';

const personalitiesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../personalities');

let cache = null;

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalize(raw, fallbackId) {
  const id = slugify(raw.id || raw.name || fallbackId);
  const name = String(raw.name || id).trim();
  const systemInstruction = String(raw.systemInstruction || raw.system || '').trim();
  if (!id || !systemInstruction) return null;
  const instructions = Array.isArray(raw.instructions)
    ? raw.instructions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const temperature = Number.isFinite(raw.temperature) ? raw.temperature : undefined;
  return {
    id,
    name,
    description: String(raw.description || '').trim(),
    temperature,
    systemInstruction,
    instructions,
    aliases: [id, slugify(name), name.toLowerCase()].filter(Boolean),
  };
}

function defaultPersonality() {
  return {
    id: 'helpfulness',
    name: 'Helpfulness',
    description: 'Default assistant personality from config.json.',
    temperature: appConfig.ai.temperature,
    systemInstruction: appConfig.ai.systemInstruction,
    instructions: [],
    aliases: ['helpfulness', 'helpful', 'default'],
  };
}

export function loadPersonalities() {
  if (cache) return cache;

  const items = [];
  if (fs.existsSync(personalitiesDir)) {
    const files = fs.readdirSync(personalitiesDir).filter((name) => name.endsWith('.json')).sort();
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(personalitiesDir, file), 'utf8'));
        const personality = normalize(raw, path.basename(file, '.json'));
        if (personality) items.push(personality);
      } catch (error) {
        logger.warn({ err: error, file }, 'failed to load personality config');
      }
    }
  }

  if (!items.some((item) => item.id === 'helpfulness')) {
    items.unshift(defaultPersonality());
  }

  cache = items;
  return cache;
}

export function listPersonalities() {
  return loadPersonalities();
}

export function findPersonality(query) {
  const needle = slugify(query);
  if (!needle) return null;
  const items = loadPersonalities();
  return items.find((item) => item.aliases.some((alias) => slugify(alias) === needle))
    || items.find((item) => item.name.toLowerCase() === String(query || '').trim().toLowerCase())
    || items.find((item) => slugify(item.name).includes(needle) || item.id.includes(needle))
    || null;
}

export function getDefaultPersonality() {
  return findPersonality(appConfig.bot.defaultPersonality || 'helpfulness') || loadPersonalities()[0];
}

export function formatPersonalityPrompt(personality) {
  if (!personality) return appConfig.ai.systemInstruction;
  const extra = personality.instructions?.length
    ? `\n\nStyle rules:\n${personality.instructions.map((item) => `- ${item}`).join('\n')}`
    : '';
  return `${personality.systemInstruction}${extra}`;
}
