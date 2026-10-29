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
- `src/tools/catalog/` holds one folder per tool (`config.json` + `handler.js`).
- `write_file` can create `.html`, `.css`, `.js`, `.txt`, `.json`, and `.md` files, send them on WhatsApp, then send a short recap.
- `sandbox` runs code and commands in a temporary E2B Linux VM. One sandbox is reused per WhatsApp user until it is killed or times out.

## Setup

Copy `.env.example` to `.env` and fill in:

- `AI_BASE_URL`
- `AI_API_KEY`
- `DATABASE_URL`
- `LANGSEARCH_API_KEY`
- `E2B_API_KEY`

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

## Tools

Tool calling is enabled in `config.json`. Each tool lives in `src/tools/catalog/<tool-name>/`.

`write_file` creates files under `generated/` and sends them as WhatsApp documents. Example: ask for a portfolio and the bot can create `index.html`, `styles.css`, and `script.js`, send those files, then reply with a short "I've finished" recap.

`web_search` uses the LangSearch Web Search API. Set `LANGSEARCH_API_KEY` in `.env`. The bot can look up live information, then answer with source URLs.

`get_datetime` returns the user's local date and time. Simple greetings use `query=greeting` (timezone, date, local time, time of day). Use `query=full` for weekdays, week number, and other calendar details. The bot must not guess the time.

`sandbox` uses the E2B code-interpreter SDK. Set `E2B_API_KEY` in `.env`. The model calls it with an `action` such as `run_code`, `run_command`, `files_write`, `install`, `get_url`, or `kill`. Long sandbox work reacts to the user message with an hourglass, then a check mark when finished. Charts and downloaded files are sent on WhatsApp.

## Scripts

```bash
# start bot
npm start

# restart on file changes
npm run dev

# run SQL migrations only
npm run migrate
```
