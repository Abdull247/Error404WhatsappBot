import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(rootDir, '.env') });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function optionalBool(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function optionalInt(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

const phoneNumber = normalizePhone(optional('WHATSAPP_PHONE_NUMBER', ''));

export const env = {
  ROOT_DIR: rootDir,
  AI_BASE_URL: required('AI_BASE_URL').replace(/\/+$/, ''),
  AI_API_KEY: required('AI_API_KEY'),
  AI_TIMEOUT_MS: optionalInt('AI_TIMEOUT_MS', 60000),
  DATABASE_URL: required('DATABASE_URL'),
  WHATSAPP_SESSION_DIR: path.resolve(rootDir, optional('WHATSAPP_SESSION_DIR', './session')),
  WHATSAPP_PRINT_QR: optionalBool('WHATSAPP_PRINT_QR', true),
  WHATSAPP_PHONE_NUMBER: phoneNumber,
  WHATSAPP_USE_PAIRING_CODE: optionalBool('WHATSAPP_USE_PAIRING_CODE', Boolean(phoneNumber)),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  CONFIG_PATH: path.resolve(rootDir, optional('CONFIG_PATH', './config.json')),
};

export function ensureSessionDir() {
  fs.mkdirSync(env.WHATSAPP_SESSION_DIR, { recursive: true });
}
