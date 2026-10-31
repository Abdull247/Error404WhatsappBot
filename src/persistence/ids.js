import crypto from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

function randomToken(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function createJobId() {
  return `jen-${Date.now()}-${randomToken(6)}`;
}

export function createFileId() {
  return crypto.randomUUID();
}

export function createWorkerId() {
  return `w-${process.pid}-${randomToken(4)}`;
}

export function parseJobId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/jen-\d{10,}-[a-z0-9]+/i);
  return match ? match[0] : raw;
}
