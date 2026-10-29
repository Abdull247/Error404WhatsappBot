const GREETING_RE = /^(hi|hii+|hello|hey|yo|hiya|howdy|good\s+(morning|afternoon|evening|night)|what'?s\s+up|sup|hola|bonjour|salaam|salam|hey\s+there|hi\s+there)([!.,\s]*)?$/i;

export function isGreeting(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length > 64) return false;
  return GREETING_RE.test(value);
}
