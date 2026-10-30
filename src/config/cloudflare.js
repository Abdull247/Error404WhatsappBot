import fs from 'node:fs';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

const defaults = {
  accountId: { env: 'CLOUDFLARE_ACCOUNT_ID', required: true },
  apiToken: { env: 'CLOUDFLARE_API_TOKEN', required: true },
  baseUrl: 'https://api.cloudflare.com/client/v4',
  models: {
    image: [{ id: DEFAULT_IMAGE_MODEL, name: 'Flux schnell', enabled: true }],
    text: [{ id: '@cf/moonshotai/kimi-k2.7-code', name: 'Kimi k2.7 code', enabled: true }],
  },
};

function readEnvSpec(spec) {
  if (!spec) return { name: '', required: false, value: '' };
  if (typeof spec === 'string') return { name: spec, required: true, value: process.env[spec]?.trim() || '' };
  const name = String(spec.env || spec.name || '').trim();
  const required = spec.required !== false;
  return { name, required, value: name ? (process.env[name]?.trim() || '') : '' };
}

function normalizeModels(list) {
  return (Array.isArray(list) ? list : [])
    .map((model) => {
      const id = String(typeof model === 'string' ? model : model?.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(typeof model === 'string' ? id : model?.name || id).trim(),
        enabled: typeof model === 'string' ? true : model?.enabled !== false,
      };
    })
    .filter(Boolean);
}

export function loadCloudflareConfig() {
  let raw = {};
  if (fs.existsSync(env.CLOUDFLARE_CONFIG_PATH)) {
    try {
      raw = JSON.parse(fs.readFileSync(env.CLOUDFLARE_CONFIG_PATH, 'utf8'));
    } catch (error) {
      logger.warn({ err: error, path: env.CLOUDFLARE_CONFIG_PATH }, 'failed to parse cloudflare config');
    }
  } else {
    logger.warn({ path: env.CLOUDFLARE_CONFIG_PATH }, 'cloudflare config not found, using defaults');
  }

  const accountId = readEnvSpec(raw.accountId || defaults.accountId);
  const apiToken = readEnvSpec(raw.apiToken || defaults.apiToken);
  const baseUrl = String(raw.baseUrl || defaults.baseUrl).replace(/\/+$/, '');

  return {
    accountId: accountId.value,
    accountIdNeeded: accountId.required,
    apiToken: apiToken.value,
    apiTokenNeeded: apiToken.required,
    baseUrl,
    models: {
      image: normalizeModels(raw.models?.image || defaults.models.image),
      text: normalizeModels(raw.models?.text || defaults.models.text),
    },
  };
}

export const cloudflareConfig = loadCloudflareConfig();

export function cloudflareConfigured() {
  return Boolean(cloudflareConfig.accountId && cloudflareConfig.apiToken);
}

export function defaultImageModel() {
  const model = (cloudflareConfig.models.image || []).find((item) => item.enabled);
  return model?.id || DEFAULT_IMAGE_MODEL;
}

export function resolveImageModel(modelRef) {
  const requested = String(modelRef || '').trim();
  if (!requested) return defaultImageModel();
  const match = (cloudflareConfig.models.image || [])
    .concat(cloudflareConfig.models.text || [])
    .find((item) => item.id === requested || item.name === requested);
  return match?.id || requested;
}

export function isImageModel(modelId) {
  return (cloudflareConfig.models.image || []).some((item) => item.id === modelId);
}
