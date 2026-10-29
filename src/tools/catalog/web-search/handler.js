import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const FRESHNESS = new Set(['noLimit', 'oneDay', 'oneWeek', 'oneMonth', 'oneYear']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_RANGE = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/;

function cleanQuery(value) {
  const query = String(value || '').trim();
  if (!query) throw new Error('query is required');
  return query;
}

function clampCount(value, fallback) {
  const count = Number.parseInt(value ?? fallback, 10);
  if (Number.isNaN(count)) return fallback;
  return Math.min(50, Math.max(1, count));
}

function cleanFreshness(value, fallback) {
  const freshness = String(value || fallback || 'noLimit').trim();
  if (FRESHNESS.has(freshness) || DATE.test(freshness) || DATE_RANGE.test(freshness)) {
    return freshness;
  }
  return fallback || 'noLimit';
}

function cleanDomains(value) {
  if (!Array.isArray(value)) return undefined;
  const domains = value.map((item) => String(item || '').trim()).filter(Boolean);
  return domains.length ? domains : undefined;
}

function summarize(item) {
  return {
    title: item.name || item.displayUrl || item.url,
    url: item.url,
    datePublished: item.datePublished || null,
    content: item.text || item.snippet || '',
  };
}

export async function handler(args = {}, _context = {}, options = {}) {
  if (!env.LANGSEARCH_API_KEY) {
    return { ok: false, error: 'LANGSEARCH_API_KEY is not configured' };
  }

  const query = cleanQuery(args.query);
  const count = clampCount(args.count, options.count || 5);
  const freshness = cleanFreshness(args.freshness, options.freshness || 'noLimit');
  const payload = {
    query,
    count,
    freshness,
    contents: {
      text: { maxCharacters: options.maxCharacters || 3000 },
    },
  };

  const includeDomains = cleanDomains(args.includeDomains);
  const excludeDomains = cleanDomains(args.excludeDomains);
  if (includeDomains) payload.includeDomains = includeDomains;
  if (excludeDomains) payload.excludeDomains = excludeDomains;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);

  try {
    logger.info({ query, count, freshness }, 'calling LangSearch web search');
    const response = await fetch(env.LANGSEARCH_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LANGSEARCH_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: body?.message || body?.msg || `LangSearch request failed with status ${response.status}`,
        logId: body?.log_id || null,
      };
    }

    const results = (body?.data?.webPages?.value || []).map(summarize);
    return {
      ok: true,
      query,
      results,
      usage: body?.usage || null,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, error: 'LangSearch request timed out' };
    }
    logger.error({ err: error }, 'LangSearch request failed');
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}
