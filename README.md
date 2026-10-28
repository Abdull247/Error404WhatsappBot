# WhatsApp AI Bot

Node.js WhatsApp bot using Baileys, an OpenAI-compatible AI API, and Neon Postgres for conversation memory.

## Layout

```text
config.json
.env.example
migrations/
src/
  index.js
  ai/
  config/
  db/
  memory/
  tools/
  utils/
  whatsapp/
```

- `config.json` holds model name, system instruction, bot behavior, and memory settings.
- `.env` holds secrets and connection URLs.
- `migrations/` holds SQL files applied on startup.
- `src/tools/` is ready for tool calling later.

## Setup

Copy `.env.example` to `.env` and fill in:

- `AI_BASE_URL`
- `AI_API_KEY`
- `DATABASE_URL`

Edit `config.json` for model, temperature, and system instruction.

```bash
npm install
npm start
```

Link WhatsApp with either QR or pairing code.

QR (default):

```bash
npm start
```

Scan the QR printed in the terminal.

Pairing code:

Set these in `.env`:

```bash
WHATSAPP_USE_PAIRING_CODE=true
WHATSAPP_PHONE_NUMBER=2348012345678
```

Use digits only, including country code. Then start the bot and enter the printed code on your phone under Linked Devices > Link with phone number.

## Scripts

```bash
# start bot
npm start

# restart on file changes
npm run dev

# run SQL migrations only
npm run migrate
```
