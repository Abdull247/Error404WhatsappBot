import { env } from './env.js';
import { appConfig } from './load-config.js';
import { logger } from '../utils/logger.js';

function isLiteralValue(value) {
  return /^(https?:\/\/|\/)/.test(String(value || ''));
}

function readEnvSpec(spec) {
  if (!spec) return { name: '', required: false, value: '' };
  if (typeof spec === 'string') {
    if (isLiteralValue(spec)) return { name: '', required: false, value: spec.replace(/\/+$/, '') };
    return { name: spec, required: true, value: process.env[spec]?.trim() || '' };
  }
  const name = String(spec.env || spec.name || '').trim();
  const required = spec.required !== false && spec.keyNeeded !== false;
  const fromEnv = name ? (process.env[name]?.trim() || '') : '';
  const literal = spec.value || spec.url || '';
  return { name, required, value: fromEnv || literal };
}

export function normalizeModel(raw, fallbackId) {
  if (!raw) return { id: fallbackId, image_support: false };
  if (typeof raw === 'string') return { id: raw, image_support: false };
  const id = String(raw.id || raw.model || raw.name || fallbackId || '').trim();
  const imageSupport = Boolean(
    raw.image_support
    ?? raw.image_surport
    ?? raw.imageSupport
    ?? raw.vision
    ?? raw.support?.image
    ?? raw.support?.image_support
    ?? raw.support?.image_surport,
  );
  return {
    ...raw,
    id,
    image_support: imageSupport,
  };
}

export function normalizeProvider(raw, index = 0) {
  const id = String(raw?.id || raw?.name || `provider-${index + 1}`).trim();
  const models = Array.isArray(raw?.models)
    ? raw.models.map((model, modelIndex) => normalizeModel(model, `${id}-model-${modelIndex + 1}`)).filter((model) => model.id)
    : [];
  return {
    id,
    baseUrl: raw?.baseUrl || raw?.base_url || { env: 'AI_BASE_URL', required: true },
    apiKey: raw?.apiKey || raw?.api_key || { env: 'AI_API_KEY', required: true },
    timeoutMs: raw?.timeoutMs || raw?.timeout_ms || { env: 'AI_TIMEOUT_MS', required: false },
    models,
  };
}

export function listProviders() {
  const providers = Array.isArray(appConfig.ai?.providers) ? appConfig.ai.providers : [];
  if (providers.length) return providers.map((provider, index) => normalizeProvider(provider, index));
  return [normalizeProvider({
    id: 'default',
    baseUrl: { env: 'AI_BASE_URL', required: true },
    apiKey: { env: 'AI_API_KEY', required: true },
    models: [{ id: appConfig.ai?.defaultModel || appConfig.ai?.model || 'gpt-4o-mini' }],
  })];
}

export function findModel(modelRef) {
  const raw = String(modelRef || appConfig.ai?.defaultModel || appConfig.ai?.model || '').trim();
  const providers = listProviders();
  if (!raw) {
    const provider = providers[0];
    const model = provider?.models?.[0];
    return provider && model ? { provider, model } : null;
  }

  const slash = raw.indexOf('/');
  if (slash > 0) {
    const providerId = raw.slice(0, slash);
    const modelId = raw.slice(slash + 1);
    const named = providers.find((provider) => provider.id === providerId);
    if (named) {
      const model = named.models.find((item) => item.id === modelId || item.id === raw);
      if (model) return { provider: named, model };
    }
  }

  for (const provider of providers) {
    const model = provider.models.find((item) => item.id === raw);
    if (model) return { provider, model };
  }
  return null;
}

export function resolveProviderRuntime(provider, model) {
  const baseUrl = readEnvSpec(provider.baseUrl);
  const apiKey = readEnvSpec(provider.apiKey);
  const timeout = readEnvSpec(provider.timeoutMs);

  if (baseUrl.required && !baseUrl.value) {
    throw new Error(`Missing env ${baseUrl.name || 'base URL'} for AI provider "${provider.id}"`);
  }
  if (apiKey.required && !apiKey.value) {
    throw new Error(`Missing env ${apiKey.name || 'API key'} for AI provider "${provider.id}"`);
  }
  if (!baseUrl.value) {
    throw new Error(`AI provider "${provider.id}" has no base URL`);
  }

  const timeoutMs = Number.parseInt(timeout.value || String(env.AI_TIMEOUT_MS || 60000), 10);
  return {
    providerId: provider.id,
    modelId: model.id,
    model,
    imageSupport: Boolean(model.image_support),
    baseUrl: baseUrl.value.replace(/\/+$/, ''),
    apiKey: apiKey.value,
    apiKeyNeeded: apiKey.required,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
  };
}

let cachedRuntime = null;

export function getAiRuntime(modelRef) {
  const requested = String(modelRef || appConfig.ai?.defaultModel || appConfig.ai?.model || '').trim();
  if (cachedRuntime && !modelRef) return cachedRuntime;

  const match = findModel(requested);
  if (!match) {
    throw new Error(`AI default model not found in providers: ${requested || '(none)'}`);
  }
  const runtime = resolveProviderRuntime(match.provider, match.model);
  if (!modelRef) cachedRuntime = runtime;
  logger.debug({ provider: runtime.providerId, model: runtime.modelId, imageSupport: runtime.imageSupport }, 'resolved AI runtime');
  return runtime;
}

export function currentModelSupportsImages(runtime) {
  return Boolean((runtime || getAiRuntime()).imageSupport);
}
