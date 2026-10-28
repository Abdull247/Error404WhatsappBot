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

export async function createWhatsAppSocket({ onMessage }) {
  const { state, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const baileysLogger = logger.child({ module: 'baileys' });
  baileysLogger.level = 'warn';

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
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && env.WHATSAPP_PRINT_QR) {
      logger.info('scan this QR code to link WhatsApp');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      logger.info('WhatsApp connected');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode, shouldReconnect }, 'WhatsApp disconnected');

      if (shouldReconnect) {
        createWhatsAppSocket({ onMessage }).catch((error) => {
          logger.error({ err: error }, 'failed to reconnect WhatsApp');
        });
      } else {
        logger.error('WhatsApp session logged out. Delete the session folder and scan again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ type, messages }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      try {
        await onMessage(sock, message);
      } catch (error) {
        logger.error({ err: error }, 'failed to handle incoming message');
      }
    }
  });

  return sock;
}
