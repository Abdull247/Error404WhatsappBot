import { env } from '../../config/env.js';

export function getInstaboxOpts() {
  const opts = {};
  if (env.INSTABOX_API_KEY) opts.apiKey = env.INSTABOX_API_KEY;
  if (env.INSTABOX_API_URL) opts.apiUrl = env.INSTABOX_API_URL;
  return opts;
}

export function instaboxConfigured() {
  return Boolean(env.INSTABOX_API_KEY);
}

export function apiBaseUrl() {
  return String(env.INSTABOX_API_URL || 'https://api.instabox.sh').replace(/\/+$/, '');
}

export async function instaboxRequest(pathname, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'X-API-Key': env.INSTABOX_API_KEY,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.confirmDelete) {
    headers['X-Confirm-Delete'] = options.confirmDelete;
  }

  const response = await fetch(`${apiBaseUrl()}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const err = payload?.error || payload || {};
    const error = new Error(err.message || `InstaBox HTTP ${response.status}`);
    error.status = response.status;
    error.code = err.code || null;
    error.payload = payload;
    throw error;
  }

  return payload;
}
