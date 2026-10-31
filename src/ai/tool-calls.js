import crypto from 'node:crypto';

function randomId() {
  return `call_${crypto.randomBytes(6).toString('hex')}`;
}

export function extractText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

function coerceValue(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (
    (value.startsWith('{') && value.endsWith('}'))
    || (value.startsWith('[') && value.endsWith(']'))
    || value === 'true'
    || value === 'false'
    || /^-?\d+(\.\d+)?$/.test(value)
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function toolCall(name, args) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  return {
    id: randomId(),
    type: 'function',
    function: {
      name: clean,
      arguments: JSON.stringify(args && typeof args === 'object' ? args : {}),
    },
  };
}

function parseArgBlocks(body) {
  const args = {};
  const re = /<arg_key>\s*([^<]+?)\s*<\/arg_key>\s*<arg_value>([\s\S]*?)(?:<\/arg_value>|(?=<arg_key>)|$)/gi;
  let match;
  while ((match = re.exec(body))) {
    const key = String(match[1] || '').trim();
    if (!key) continue;
    args[key] = coerceValue(match[2]);
  }
  return args;
}

function parseXmlToolCalls(text) {
  const calls = [];
  const re = /<tool_call(?:\s+name=["']([^"']+)["'])?\s*>([\s\S]*?)(?:<\/tool_call>|(?=<tool_call)|$)/gi;
  let match;
  while ((match = re.exec(text))) {
    const named = String(match[1] || '').trim();
    const body = String(match[2] || '').trim();
    if (!body && !named) continue;

    const jsonMatch = body.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const name = named || parsed.name || parsed.tool || parsed.function;
        const args = parsed.arguments || parsed.args || parsed.parameters || parsed;
        if (name && args && typeof args === 'object' && !Array.isArray(args)) {
          const call = toolCall(name, args.name ? parsed.arguments || parsed.args || {} : args);
          if (call) calls.push(call);
          continue;
        }
      } catch {
        // fall through to arg tags / bare name
      }
    }

    const nameFromBody = named || (body.match(/^([A-Za-z][\w-]*)/) || [])[1] || '';
    const args = parseArgBlocks(body);
    if (nameFromBody) {
      const call = toolCall(nameFromBody, args);
      if (call) calls.push(call);
    }
  }
  return calls;
}

function parseInvokeToolCalls(text) {
  const calls = [];
  const re = /<invoke\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/invoke>/gi;
  let match;
  while ((match = re.exec(text))) {
    const args = {};
    const paramRe = /<(?:parameter|arg)\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:parameter|arg)>/gi;
    let param;
    while ((param = paramRe.exec(match[2] || ''))) {
      args[param[1]] = coerceValue(param[2]);
    }
    const call = toolCall(match[1], args);
    if (call) calls.push(call);
  }
  return calls;
}

const TOOL_DUMP_RE = /<tool_call[\s>]|<arg_key>|<arg_value>|<\/tool_call>|<invoke\s+name=/i;

export function looksLikeToolDump(text) {
  return TOOL_DUMP_RE.test(String(text || ''));
}

export function parseToolCallsFromText(text) {
  const raw = String(text || '');
  if (!looksLikeToolDump(raw)) return [];
  const calls = [...parseXmlToolCalls(raw), ...parseInvokeToolCalls(raw)];
  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.function.name}:${call.function.arguments}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function stripToolCallText(text) {
  let value = String(text || '');
  value = value.replace(/<tool_call[\s\S]*?(?:<\/tool_call>|$)/gi, '');
  value = value.replace(/<invoke\s+name=["'][^"']+["'][\s\S]*?<\/invoke>/gi, '');
  value = value.replace(/<arg_key>[\s\S]*?(?:<\/arg_value>|$)/gi, '');
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

export function getToolCalls(message) {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    return message.tool_calls;
  }
  return parseToolCallsFromText(extractText(message));
}
