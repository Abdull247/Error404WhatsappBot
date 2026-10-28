import fs from 'node:fs';
import { env } from './env.js';

const defaults = {
  ai: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1024,
    topP: 1,
    systemInstruction: 'You are a helpful WhatsApp assistant.',
  },
  bot: {
    name: 'Assistant',
    ignoreGroups: true,
    ignoreStatus: true,
    respondToMentionsInGroups: true,
    typingIndicator: true,
    markMessagesRead: true,
  },
  memory: {
    enabled: true,
    maxHistoryMessages: 20,
    maxMemoriesPerUser: 50,
  },
  tools: {
    enabled: false,
    allow: [],
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function loadAppConfig() {
  if (!fs.existsSync(env.CONFIG_PATH)) {
    throw new Error(`Config file not found: ${env.CONFIG_PATH}`);
  }

  const raw = fs.readFileSync(env.CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return deepMerge(defaults, parsed);
}

export const appConfig = loadAppConfig();
