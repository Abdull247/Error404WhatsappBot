import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../config/env.js';
import {
  cloudflareConfig,
  cloudflareConfigured,
  defaultImageModel,
  isImageModel,
  resolveImageModel,
} from '../../../config/cloudflare.js';
import { createStoredFile } from '../../../db/repositories/files.js';
import { isGroupJid } from '../../../whatsapp/filters.js';
import { logger } from '../../../utils/logger.js';
import { makeObjectKey, resolveFileUrl, r2Configured, safeJid, uploadR2Object } from '../../../storage/r2.js';

function extensionFor(contentType) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[String(contentType || '').split(';')[0].trim()] || 'png';
}

function modelSlug(modelId) {
  return String(modelId).split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'image';
}

export async function handler(args = {}, context = {}, options = {}) {
  const prompt = String(args.prompt || args.description || '').trim();
  if (!prompt) {
    return { ok: false, error: 'prompt is required' };
  }
  const maxChars = options.maxPromptChars || 2000;
  if (prompt.length > maxChars) {
    return { ok: false, error: `prompt is too long (max ${maxChars} chars)` };
  }
  if (!cloudflareConfigured()) {
    return {
      ok: false,
      error: 'Cloudflare AI is not configured (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN)',
    };
  }

  const requested = resolveImageModel(args.model || options.model);
  if (!isImageModel(requested)) {
    return {
      ok: false,
      error: `model is not enabled for image generation: ${requested}`,
      available: (cloudflareConfig.models.image || []).map((item) => item.id),
    };
  }

  const payload = { prompt };
  const steps = Number.parseInt(args.steps, 10);
  if (Number.isFinite(steps) && steps > 0) payload.steps = Math.min(steps, 50);

  try {
    const url = `${cloudflareConfig.baseUrl}/accounts/${cloudflareConfig.accountId}/ai/run/${requested}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cloudflareConfig.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = String(response.headers.get('content-type') || '');
    let buffer;
    if (contentType.includes('application/json')) {
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          error: json?.errors?.[0]?.message || json?.message || `Cloudflare AI request failed with status ${response.status}`,
          status: response.status,
        };
      }
      const raw = json?.result?.image || json?.result?.base64 || json?.result;
      if (typeof raw === 'string') {
        buffer = Buffer.from(raw, 'base64');
      } else {
        buffer = Buffer.from(JSON.stringify(json));
      }
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        return { ok: false, error: `Cloudflare AI request failed with status ${response.status}`, status: response.status };
      }
    }

    if (!buffer || !buffer.length) {
      return { ok: false, error: 'Cloudflare AI returned an empty image' };
    }

    const ext = extensionFor(contentType);
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const filename = `ai-${modelSlug(requested)}-${Date.now()}.${ext}`;
    const dir = path.join(env.TOOLS_OUTPUT_DIR, safeJid(context.jid), 'images');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    let url2 = null;
    let record = null;
    if (r2Configured()) {
      try {
        const key = makeObjectKey(context.jid, filename);
        const uploaded = await uploadR2Object({ key, body: buffer, contentType: mime });
        url2 = uploaded.url;
        record = await createStoredFile({
          id: crypto.randomUUID(),
          jid: context.jid,
          chatType: isGroupJid(context.jid) ? 'group' : 'dm',
          filename,
          key,
          url: url2,
          mimetype: mime,
          size: buffer.length,
          source: 'generate_image',
          metadata: { prompt, model: requested },
        });
        if (!url2) url2 = await resolveFileUrl(record);
      } catch (error) {
        logger.warn({ err: error }, 'failed to store generated image in R2');
      }
    }

    logger.info({ model: requested, bytes: buffer.length }, 'generated image');
    return {
      ok: true,
      model: requested,
      prompt,
      filename,
      url: url2,
      files: [{
        ok: true,
        filename,
        path: filePath,
        mimetype: mime,
        size: buffer.length,
        attachment: true,
        caption: prompt,
      }],
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, error: 'Cloudflare AI image generation timed out' };
    }
    logger.error({ err: error }, 'image generation failed');
    return { ok: false, error: error.message };
  }
}
