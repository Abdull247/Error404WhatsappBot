import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function firstExisting(dir, names) {
  for (const name of names) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function resolveFile(rootDir, folderDir, info) {
  const candidates = [
    info.file && path.join(folderDir, info.file),
    info.path && path.resolve(rootDir, info.path),
    info.sticker && path.join(folderDir, info.sticker),
    firstExisting(folderDir, fs.existsSync(folderDir)
      ? fs.readdirSync(folderDir).filter((name) => /\.webp$/i.test(name))
      : []),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || '';
}

function normalizeSticker(raw, rootDir, catalogPath) {
  const folder = String(raw.folder || raw.id || '').trim();
  const id = String(raw.id || folder).trim();
  if (!id) return null;
  const folderDir = path.resolve(rootDir, 'stickers', folder || id);
  const file = resolveFile(rootDir, folderDir, raw);
  if (!file) {
    logger.warn({ id, folder }, 'sticker file missing');
    return null;
  }
  return {
    id,
    name: String(raw.name || id).trim(),
    folder: folder || id,
    file: path.basename(file),
    path: path.relative(rootDir, file).replace(/\\/g, '/'),
    absPath: file,
    info: raw.info || path.relative(rootDir, path.join(folderDir, 'info.json')).replace(/\\/g, '/'),
    catalog: raw.catalog || path.relative(rootDir, catalogPath).replace(/\\/g, '/'),
    enabled: raw.enabled !== false,
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    description: String(raw.description || '').trim(),
    whenToUse: String(raw.whenToUse || raw.when_to_use || '').trim(),
    whenNotToUse: String(raw.whenNotToUse || raw.when_not_to_use || '').trim(),
  };
}

function loadFolderInfo(rootDir, entry) {
  const folder = String(entry.folder || entry.id || '').trim();
  if (!folder) return entry;
  const infoPath = entry.info
    ? path.resolve(rootDir, entry.info)
    : path.join(rootDir, 'stickers', folder, 'info.json');
  if (!fs.existsSync(infoPath)) return entry;
  try {
    const info = readJson(infoPath);
    return {
      ...entry,
      ...info,
      id: entry.id || info.id,
      folder,
      info: entry.info || path.relative(rootDir, infoPath).replace(/\\/g, '/'),
    };
  } catch (error) {
    logger.warn({ err: error, infoPath }, 'failed to parse sticker info');
    return entry;
  }
}

function scanFolders(rootDir, stickersDir) {
  if (!fs.existsSync(stickersDir)) return [];
  return fs.readdirSync(stickersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, folder: entry.name }));
}

export function loadStickerCatalog() {
  const rootDir = env.ROOT_DIR;
  const catalogPath = env.STICKERS_PATH;
  let listed = [];
  if (fs.existsSync(catalogPath)) {
    try {
      const parsed = readJson(catalogPath);
      listed = Array.isArray(parsed.stickers) ? parsed.stickers : [];
    } catch (error) {
      logger.warn({ err: error, catalogPath }, 'failed to parse stickers catalog');
    }
  } else {
    logger.warn({ path: catalogPath }, 'stickers catalog not found, scanning folders');
  }

  const byId = new Map();
  const stickersDir = path.join(rootDir, 'stickers');
  const entries = listed.length ? listed : scanFolders(rootDir, stickersDir);
  for (const raw of entries) {
    const merged = loadFolderInfo(rootDir, raw);
    const sticker = normalizeSticker(merged, rootDir, catalogPath);
    if (sticker?.enabled) byId.set(sticker.id, sticker);
  }
  return [...byId.values()];
}

export const stickerCatalog = loadStickerCatalog();

export function listStickers() {
  return stickerCatalog;
}

export function findSticker(ref) {
  const raw = String(ref || '').trim().toLowerCase();
  if (!raw) return null;
  return stickerCatalog.find((sticker) => (
    sticker.id.toLowerCase() === raw
    || sticker.name.toLowerCase() === raw
    || sticker.folder.toLowerCase() === raw
    || sticker.file.toLowerCase() === raw
  )) || null;
}

export function formatStickerCatalog() {
  if (!stickerCatalog.length) return '';
  const lines = stickerCatalog.map((sticker) => {
    const tags = sticker.tags.length ? ` tags=${sticker.tags.join(',')}` : '';
    return `- ${sticker.id} (${sticker.folder}/): ${sticker.description}${tags}`;
  });
  return `Available WhatsApp stickers (send with send_sticker). Pick the one whose vibe fits; call send_sticker with action="list" if you need full whenToUse notes.\n${lines.join('\n')}`;
}
