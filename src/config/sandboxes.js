import fs from 'node:fs';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const defaults = {
  default: 'linux_machine',
  boxes: [
    {
      id: 'sandbox',
      type: 'e2b',
      tool: 'sandbox',
      name: 'E2B sandbox',
      description: 'Temporary isolated E2B Linux VM. One box per chat until it is killed or times out. Home is /home/user. Use for short-lived code, charts, and throwaway commands.',
    },
    {
      id: 'linux_machine',
      type: 'instabox',
      tool: 'linux_machine',
      name: 'InstaBox Linux computer',
      description: 'Persistent InstaBox Linux computer (Debian, /data disk, optional desktop). Shared and reused across turns for every user and group. Home is /data/home. Use for projects, servers, files that should last, and the desktop.',
    },
  ],
};

function normalizeBox(raw, index) {
  const id = String(raw?.id || raw?.tool || `box-${index + 1}`).trim();
  return {
    id,
    type: String(raw?.type || id).trim(),
    tool: String(raw?.tool || id).trim(),
    name: String(raw?.name || id).trim(),
    description: String(raw?.description || '').trim(),
    enabled: raw?.enabled !== false,
  };
}

export function loadSandboxConfig() {
  const filePath = env.SANDBOXES_PATH;
  if (!fs.existsSync(filePath)) {
    logger.warn({ path: filePath }, 'sandboxes config not found, using defaults');
    return defaults;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const boxes = Array.isArray(parsed.boxes)
    ? parsed.boxes.map(normalizeBox).filter((box) => box.enabled)
    : defaults.boxes;
  const defaultId = String(parsed.default || parsed.defaultSandbox || boxes[0]?.id || '').trim();
  return {
    default: defaultId,
    boxes,
  };
}

export const sandboxConfig = loadSandboxConfig();

export function getDefaultSandbox() {
  const boxes = sandboxConfig.boxes || [];
  return boxes.find((box) => box.id === sandboxConfig.default)
    || boxes.find((box) => box.tool === sandboxConfig.default)
    || boxes[0]
    || null;
}

export function getSandboxByTool(toolName) {
  return (sandboxConfig.boxes || []).find((box) => box.tool === toolName || box.id === toolName) || null;
}

export function sandboxToolNames() {
  return (sandboxConfig.boxes || []).map((box) => box.tool).filter(Boolean);
}
