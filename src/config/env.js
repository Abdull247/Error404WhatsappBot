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

function detectPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') {
    return optionalBool('HEALTH_SERVER', false) ? 10000 : 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error('Environment variable PORT must be an integer');
  }
  return parsed;
}

function optionalIntWithDefaultMs(name, fallbackMs) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer (milliseconds)`);
  }
  return parsed;
}

const phoneNumber = normalizePhone(optional('WHATSAPP_PHONE_NUMBER', ''));
const port = detectPort();

export const env = {
  ROOT_DIR: rootDir,
  AI_BASE_URL: required('AI_BASE_URL').replace(/\/+$/, ''),
  AI_API_KEY: required('AI_API_KEY'),
  AI_TIMEOUT_MS: optionalInt('AI_TIMEOUT_MS', 60000),
  DATABASE_URL: required('DATABASE_URL'),
  WHATSAPP_SESSION_DIR: path.resolve(rootDir, optional('WHATSAPP_SESSION_DIR', './session')),
  WHATSAPP_AUTH_STORE: optional('WHATSAPP_AUTH_STORE', port ? 'postgres' : 'file'),
  WHATSAPP_PRINT_QR: optionalBool('WHATSAPP_PRINT_QR', true),
  WHATSAPP_PHONE_NUMBER: phoneNumber,
  WHATSAPP_USE_PAIRING_CODE: optionalBool('WHATSAPP_USE_PAIRING_CODE', Boolean(phoneNumber)),
  OWNER_NUMBERS: optional('OWNER_NUMBERS', phoneNumber),
  HOST: optional('HOST', '0.0.0.0'),
  PORT: port,
  WHATSAPP_MAX_STALE_MS: optionalIntWithDefaultMs('WHATSAPP_MAX_STALE_MS', 10 * 60 * 1000),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  CONFIG_PATH: path.resolve(rootDir, optional('CONFIG_PATH', './config.json')),
  TOOLS_OUTPUT_DIR: path.resolve(rootDir, optional('TOOLS_OUTPUT_DIR', './generated')),
  LANGSEARCH_API_KEY: optional('LANGSEARCH_API_KEY', ''),
  LANGSEARCH_BASE_URL: optional('LANGSEARCH_BASE_URL', 'https://api.langsearch.com/v1/web-search').replace(/\/+$/, ''),
  DEFAULT_TIMEZONE: optional('DEFAULT_TIMEZONE', 'UTC'),
  E2B_API_KEY: optional('E2B_API_KEY', ''),
  E2B_TIMEOUT_MS: optionalInt('E2B_TIMEOUT_MS', 300000),
  SCREENSHOTLAYER_API_KEY: optional('SCREENSHOTLAYER_API_KEY', '36ba2cccc19800bc5f098110779c083d'),
  SCREENSHOTLAYER_SECRET: optional('SCREENSHOTLAYER_SECRET', ''),
  SCREENSHOTLAYER_BASE_URL: optional(
    'SCREENSHOTLAYER_BASE_URL',
    'https://api.screenshotlayer.com/api/capture',
  ).replace(/\/+$/, ''),
};

if (env.E2B_API_KEY && !process.env.E2B_API_KEY) {
  process.env.E2B_API_KEY = env.E2B_API_KEY;
}

export function ensureSessionDir() {
  fs.mkdirSync(env.WHATSAPP_SESSION_DIR, { recursive: true });
}

export function ensureToolsOutputDir() {
  fs.mkdirSync(env.TOOLS_OUTPUT_DIR, { recursive: true });
}
