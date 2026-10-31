import { appConfig } from '../config/load-config.js';
import { logger } from '../utils/logger.js';

function queueConfig() {
  const raw = appConfig.bot?.queue || {};
  const maxConcurrentChats = Math.max(1, Number.parseInt(raw.maxConcurrentChats, 10) || 4);
  const maxPerChat = Math.max(1, Number.parseInt(raw.maxPerChat, 10) || 8);
  const maxGlobal = Math.max(maxConcurrentChats, Number.parseInt(raw.maxGlobal, 10) || 48);
  return {
    maxConcurrentChats,
    maxPerChat,
    maxGlobal,
    notifyQueued: raw.notifyQueued !== false,
  };
}

const chatQueues = new Map();
const fairOrder = [];
let processingCount = 0;
let pumping = false;

function chatState(jid) {
  let state = chatQueues.get(jid);
  if (!state) {
    state = { items: [], processing: false };
    chatQueues.set(jid, state);
  }
  return state;
}

function pendingCount() {
  let total = 0;
  for (const state of chatQueues.values()) total += state.items.length;
  return total;
}

function chatsWaiting() {
  return fairOrder.filter((jid) => {
    const state = chatQueues.get(jid);
    return Boolean(state?.items.length);
  }).length;
}

function waitSnapshot(jid) {
  const config = queueConfig();
  const state = chatQueues.get(jid);
  const positionInChat = state?.items.length || 0;
  const chatsAhead = Math.max(0, chatsWaiting() - (positionInChat ? 1 : 0));
  return {
    jid,
    positionInChat,
    chatsAhead,
    activeChats: processingCount,
    pending: pendingCount(),
    maxConcurrentChats: config.maxConcurrentChats,
    waitingOnOthers: chatsAhead > 0 || processingCount >= config.maxConcurrentChats,
  };
}

function takeNext() {
  const n = fairOrder.length;
  for (let i = 0; i < n; i += 1) {
    const jid = fairOrder.shift();
    const state = chatQueues.get(jid);
    if (!state?.items.length) continue;
    if (state.processing) {
      fairOrder.push(jid);
      continue;
    }
    const item = state.items.shift();
    if (state.items.length) fairOrder.push(jid);
    return item;
  }
  return null;
}

async function runItem(item) {
  try {
    const result = await item.run();
    item.resolve({ dropped: false, result });
  } catch (error) {
    item.reject(error);
  }
}

function pump() {
  if (pumping) return;
  pumping = true;
  try {
    const config = queueConfig();
    while (processingCount < config.maxConcurrentChats) {
      const next = takeNext();
      if (!next) break;
      const state = chatState(next.jid);
      state.processing = true;
      processingCount += 1;
      runItem(next).finally(() => {
        processingCount -= 1;
        state.processing = false;
        if (!state.items.length && !state.processing) chatQueues.delete(next.jid);
        pump();
      });
    }
  } finally {
    pumping = false;
  }
}

export function enqueueChatWork({ jid, run, onQueued }) {
  return new Promise((resolve, reject) => {
    const config = queueConfig();
    const state = chatState(jid);
    if (state.items.length >= config.maxPerChat) {
      resolve({
        dropped: true,
        reason: 'chat_full',
        perChat: state.items.length,
        cap: config.maxPerChat,
      });
      return;
    }
    const waiting = state.processing || state.items.length > 0 || processingCount >= config.maxConcurrentChats;
    if (waiting && pendingCount() >= config.maxGlobal) {
      resolve({
        dropped: true,
        reason: 'global_full',
        pending: pendingCount(),
        cap: config.maxGlobal,
      });
      return;
    }

    const item = {
      jid,
      run,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    };
    state.items.push(item);
    if (!fairOrder.includes(jid)) fairOrder.push(jid);

    if (waiting && typeof onQueued === 'function') {
      const snapshot = waitSnapshot(jid);
      snapshot.notify = Boolean(
        config.notifyQueued
        && snapshot.positionInChat === 1
        && (snapshot.waitingOnOthers || state.processing),
      );
      Promise.resolve(onQueued(snapshot)).catch((error) => {
        logger.warn({ err: error, jid }, 'request queue onQueued failed');
      });
    }

    pump();
  });
}

export function requestQueueSnapshot() {
  const config = queueConfig();
  return {
    activeChats: processingCount,
    pending: pendingCount(),
    waitingChats: chatsWaiting(),
    maxConcurrentChats: config.maxConcurrentChats,
    maxPerChat: config.maxPerChat,
    maxGlobal: config.maxGlobal,
  };
}
