import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const FORMATS = {
  png: { ext: '.png', mime: 'image/png', api: 'PNG' },
  jpg: { ext: '.jpg', mime: 'image/jpeg', api: 'JPG' },
  jpeg: { ext: '.jpg', mime: 'image/jpeg', api: 'JPEG' },
  gif: { ext: '.gif', mime: 'image/gif', api: 'GIF' },
  webp: { ext: '.webp', mime: 'image/webp', api: 'WEBP' },
};

function safeJid(jid) {
  return String(jid || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'site';
  } catch {
    return 'site';
  }
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('url is required');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('url is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('url must be http or https');
  }
  return parsed.toString();
}

function flag(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1') return '1';
  if (value === false || value === 0 || value === '0') return '0';
  return fallback;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function looksLikeJson(buffer) {
  const start = buffer.subarray(0, 32).toString('utf8').trimStart();
  return start.startsWith('{') || start.startsWith('[');
}

function parseApiError(buffer, status) {
  const fallback = `Screenshotlayer request failed with status ${status}`;
  try {
    const body = JSON.parse(buffer.toString('utf8'));
    return body?.error?.info || body?.error?.type || body?.message || body?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function handler(args = {}, context = {}, options = {}) {
  const accessKey = env.SCREENSHOTLAYER_API_KEY;
  if (!accessKey) {
    return { ok: false, error: 'SCREENSHOTLAYER_API_KEY is not configured' };
  }

  let url;
  try {
    url = normalizeUrl(args.url);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  const formatKey = String(args.format || options.format || 'PNG').trim().toLowerCase();
  const format = FORMATS[formatKey] || FORMATS.png;
  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    format: format.api,
  });

  const fullpage = flag(args.fullpage, flag(options.fullpage, '0'));
  if (fullpage) params.set('fullpage', fullpage);

  const force = flag(args.force, '1');
  if (force) params.set('force', force);

  const viewport = String(args.viewport || options.viewport || '').trim();
  if (/^\d+x\d+$/.test(viewport)) params.set('viewport', viewport);

  const width = clampInt(args.width, 1, 5000);
  if (width) params.set('width', String(width));

  const delay = clampInt(args.delay, 1, 20);
  if (delay) params.set('delay', String(delay));

  const quality = clampInt(args.quality, 1, 100);
  if (quality) params.set('quality', String(quality));

  const userAgent = String(args.user_agent || args.userAgent || '').trim();
  if (userAgent) params.set('user_agent', userAgent);

  if (env.SCREENSHOTLAYER_SECRET) {
    params.set(
      'secret_key',
      crypto.createHash('md5').update(`${url}${env.SCREENSHOTLAYER_SECRET}`).digest('hex'),
    );
  }

  const endpoint = `${env.SCREENSHOTLAYER_BASE_URL}?${params.toString()}`;
  const timeoutMs = (options.timeoutMs || 60000) + (delay ? delay * 1000 : 0);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger.info({ url, fullpage, viewport, format: format.api }, 'capturing website screenshot');
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'image/png, image/jpeg, image/gif, image/webp, application/json',
      },
      signal: controller.signal,
    });

    const contentType = String(response.headers.get('content-type') || '');
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok || contentType.includes('json') || looksLikeJson(buffer)) {
      return {
        ok: false,
        status: response.status,
        error: parseApiError(buffer, response.status),
      };
    }

    if (!buffer.length) {
      return { ok: false, error: 'Screenshotlayer returned an empty image' };
    }

    const dir = path.join(env.TOOLS_OUTPUT_DIR, safeJid(context.jid), 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `screenshot-${hostnameFromUrl(url)}-${Date.now()}${format.ext}`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    logger.info({ url, filename, size: buffer.length }, 'saved website screenshot');
    return {
      ok: true,
      url,
      filename,
      size: buffer.length,
      format: format.api,
      viewport: viewport || null,
      fullpage: fullpage === '1',
      files: [{
        ok: true,
        filename,
        path: filePath,
        mimetype: format.mime,
        size: buffer.length,
        attachment: true,
        caption: url,
      }],
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, error: 'Screenshot request timed out' };
    }
    logger.error({ err: error, url }, 'screenshot capture failed');
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}
