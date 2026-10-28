import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let reconnecting = false;
let pairingRequested = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPairingCode(code) {
  const compact = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (compact.length === 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }
  return compact;
}

async function requestPairingCode(sock) {
  if (sock.authState.creds.registered) return;
  if (!env.WHATSAPP_USE_PAIRING_CODE) return;
  if (pairingRequested) return;
  if (!env.WHATSAPP_PHONE_NUMBER) {
    throw new Error('WHATSAPP_PHONE_NUMBER is required when WHATSAPP_USE_PAIRING_CODE=true');
  }

  pairingRequested = true;
  try {
    await delay(1500);
    const code = await sock.requestPairingCode(env.WHATSAPP_PHONE_NUMBER);
    logger.info(
      { phone: env.WHATSAPP_PHONE_NUMBER, code: formatPairingCode(code) },
      'WhatsApp pairing code ready. On your phone: Linked Devices > Link with phone number',
    );
    return;
  } catch (error) {
    pairingRequested = false;
    throw error;
  }
}

export async function createWhatsAppSocket({ onMessage }) {
  const { state, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const baileysLogger = logger.child({ module: 'baileys' });
  baileysLogger.level = 'warn';

  const usePairingCode = env.WHATSAPP_USE_PAIRING_CODE && !state.creds.registered;

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    logger: baileysLogger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usePairingCode && env.WHATSAPP_PRINT_QR) {
      logger.info('scan this QR code to link WhatsApp');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting' && usePairingCode) {
      try {
        await requestPairingCode(sock);
      } catch (error) {
        logger.error({ err: error }, 'failed to request WhatsApp pairing code');
      }
    }

    if (connection === 'open') {
      reconnecting = false;
      logger.info({ jid: sock.user?.id }, 'WhatsApp connected');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      pairingRequested = false;
      logger.warn({ statusCode, shouldReconnect }, 'WhatsApp disconnected');

      if (shouldReconnect && !reconnecting) {
        reconnecting = true;
        await delay(2000);
        createWhatsAppSocket({ onMessage })
          .catch((error) => {
            logger.error({ err: error }, 'failed to reconnect WhatsApp');
          })
          .finally(() => {
            reconnecting = false;
          });
      } else if (!shouldReconnect) {
        logger.error('WhatsApp session logged out. Delete the session folder and link again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages || []) {
      try {
        await onMessage(sock, message);
      } catch (error) {
        logger.error({ err: error }, 'failed to handle incoming message');
      }
    }
  });

  if (usePairingCode) {
    try {
      await requestPairingCode(sock);
    } catch (error) {
      logger.error({ err: error }, 'failed to request WhatsApp pairing code');
    }
  }

  return sock;
}
