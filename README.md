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
- In groups the bot stays quiet unless it is @mentioned or someone replies to one of its messages. Replies are quoted so the group can follow the thread. The AI is told it is in a group and gets the group name, description, and speaker.
- `.env` holds secrets and connection URLs.
- `migrations/` holds SQL files applied on startup.
- `src/tools/catalog/` holds one folder per tool (`config.json` + `handler.js`).
- `personalities/` holds one JSON file per AI personality.
- `write_file` can create `.html`, `.css`, `.js`, `.txt`, `.json`, and `.md` files, send them on WhatsApp, then send a short recap.
- `sandbox` runs code and commands in a temporary E2B Linux VM. One sandbox is reused per WhatsApp user until it is killed or times out.

## Setup

Copy `.env.example` to `.env` and fill in:

- `AI_BASE_URL`
- `AI_API_KEY`
- `DATABASE_URL`
- `LANGSEARCH_API_KEY`
- `E2B_API_KEY`
- `SCREENSHOTLAYER_API_KEY`

Edit `config.json` for model, temperature, and system instruction.

Group chat:

- `ignoreGroups: true` (default) means the bot does not answer every group message.
- `respondToMentionsInGroups: true` answers when someone tags / @mentions the bot.
- `respondToRepliesInGroups: true` answers when someone replies to the bot's own message.
- Group replies quote the triggering message. The model receives group name, description, participant count, and who spoke.
- `reactInGroups: true` lets the bot emoji-react to a tagged or quoted group message (funny, thanks, hype, greetings) and then still reply.

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

`list_chats` and `summarize_chat` are owner-only. The bot logs DMs and group messages it sees (even when `ignoreGroups` is true and it does not reply). Ask it to list chats, then summarize a group or pull out facts, people, decisions, and action items. Set `OWNER_NUMBERS` in `.env` (comma-separated, with country code) so only you can use these tools. Summarize reacts with an hourglass, then a check mark.

`react` puts one emoji on the current WhatsApp message. In groups, if someone tags the bot or replies to it with something funny, hype, or grateful, it can react first and then send a text reply.

`screenshot` captures a website with the Screenshotlayer API and sends the image on WhatsApp. Set `SCREENSHOTLAYER_API_KEY` in `.env`. Ask for a screenshot of a URL, optionally full page or a mobile viewport. Capture reacts with an hourglass, then a check mark.

## Commands

Messages that start with `.` are handled before the AI.

```text
.menu
.personalities
.personalities - Helpfulness
```

`.menu` lists commands. `.personalities` lists the JSON configs in `personalities/`. `.personalities - Helpfulness` switches this chat to that personality. The choice is stored per user/chat.

## Scripts

```bash
# start bot
npm start

# restart on file changes
npm run dev

# run SQL migrations only
npm run migrate
```

## Deploy on Render

Two supported service types. Both run the same code; the bot switches modes from env vars alone.

| Type | When to use | What you need |
| --- | --- | --- |
| **Web Service** (free tier works) | Default choice. Renders a health endpoint on `$PORT`. | Nothing extra; pair the bot once from your phone. |
| **Background Worker** (paid) | If you want the session on a persistent disk instead of Postgres. | Persistent disk + instance that never spins down. |

### Web Service mode (recommended)

Set the environment variable `PORT` (Render injects it automatically, but you can also pin it). The bot then:

- starts a tiny HTTP server on `$PORT` serving `GET /`, `/health`, and `/ping` with JSON status (`whatsapp` connection state and `jid` included);
- defaults `WHATSAPP_AUTH_STORE=postgres`, so the WhatsApp session lives in Neon instead of the ephemeral disk and survives deploys and restarts.

Free web services sleep after ~15 minutes of no inbound HTTP. The WhatsApp socket does not count as activity, so it is strongest to keep a free pinger (UptimeRobot, cron-job.org, etc.) hitting `/health` every 5-10 minutes.

Settings:

```text
Name: error404-whatsapp-bot
Region: closest to you
Branch: main
Root Directory: (leave empty)
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

No persistent disk is required in this mode. `TOOLS_OUTPUT_DIR` is still ephemeral, which is fine for disposable generated files.

### Background Worker mode

A Background Worker gets no `PORT`, the HTTP server stays off, and the session defaults to `WHATSAPP_AUTH_STORE=file`. It keeps a WhatsApp socket open with no inbound traffic.

Use a **paid** instance so Render does not spin it down. Add a persistent disk:

```text
Name: whatsapp-data
Mount Path: /data
Size: 1 GB
```

Then set:

```text
WHATSAPP_SESSION_DIR=/data/session
TOOLS_OUTPUT_DIR=/data/generated
```

Without this, every deploy or restart wipes `./session` and the bot logs out.

### Create the service

1. New > Background Worker.
2. Connect this GitHub repo.
3. Runtime: **Node**.
4. Instance: a paid plan (Starter or higher). Do not use a free web service.
5. Settings:

```text
Name: error404-whatsapp-bot
Region: closest to you
Branch: main
Root Directory: (leave empty)
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Set the Node version to 18 or newer. In the Render dashboard add:

```text
NODE_VERSION=20
```

Or add an `.node-version` / `NODE_VERSION` env var. `package.json` requires `>=18.18.0`.

### Persistent disk

Baileys stores the WhatsApp session on disk. If that folder is lost, you have to link the phone again.

On the paid worker, add a persistent disk:

```text
Name: whatsapp-data
Mount Path: /data
Size: 1 GB
```

Then set:

```text
WHATSAPP_SESSION_DIR=/data/session
TOOLS_OUTPUT_DIR=/data/generated
```

Without this, every deploy or restart wipes `./session` and the bot logs out.

### Environment variables

In Render > Environment, add the same keys as `.env.example`. Do not upload a `.env` file.

Required:

```text
AI_BASE_URL
AI_API_KEY
DATABASE_URL
```

WhatsApp linking (pairing code, recommended on Render):

```text
WHATSAPP_USE_PAIRING_CODE=true
WHATSAPP_PHONE_NUMBER=2348012345678
WHATSAPP_PRINT_QR=false
OWNER_NUMBERS=2348012345678
```

Session and health (only what differs from the defaults):

```text
WHATSAPP_SESSION_DIR=/data/session  # Worker mode with a disk only
WHATSAPP_AUTH_STORE=postgres         # omit to auto-detect from PORT
PORT=10000                            # Web Service only, usually injected
HOST=0.0.0.0
HEALTH_SERVER=true                    # optional: listen on 10000 without PORT
```

Use digits only, with country code, no `+` or spaces.

Optional tools:

```text
LANGSEARCH_API_KEY
E2B_API_KEY
SCREENSHOTLAYER_API_KEY
SCREENSHOTLAYER_SECRET
```

Useful extras:

```text
LOG_LEVEL=info
CONFIG_PATH=./config.json
DEFAULT_TIMEZONE=Africa/Lagos
AI_TIMEOUT_MS=60000
E2B_TIMEOUT_MS=300000
```

`config.json` is in the repo, so model/personality settings deploy with git. Secrets stay in Render env vars.

### First boot / link WhatsApp

1. Deploy the service.
2. Open **Logs**.
3. Wait for a pairing code line such as `WhatsApp pairing code ready`.
4. On your phone: Linked Devices > Link with phone number > enter the code.
5. After `WhatsApp connected`, leave the service running. `GET /health` should report `"whatsapp":"open"`.

If the session is already stored (Postgres rows or the persistent disk), later deploys reconnect without a new code.

Do not use QR login on Render unless you can read the ASCII QR in logs. Pairing code is the reliable path.

### What not to deploy it as

- **Static Site**: there is no frontend build to host.
- **Cron Job**: the WhatsApp socket must stay open, not run once and exit.
- **Private Service**: works technically, but nothing else in this repo needs to call the health endpoint over HTTP, so there is no reason to pick it over a Web Service.

### After deploy

- Migrations run on startup (`runMigrations` in `src/index.js`). You do not need a separate migrate step. This includes `004_whatsapp_auth.sql`, which creates the `whatsapp_auth` table for the Postgres session store.
- Scale to **1 instance**. Two instances with the same session will fight over the WhatsApp link.
- Health check: `GET /health` (or `/ping`) returns `{"ok":true,"whatsapp":"open","jid":"...","uptime":...}` when connected.
- Worker mode: if the bot stops answering, check logs for disconnects, then confirm the persistent disk still has `/data/session`.
- Web Service mode: the session is in Neon, so a lost link is not about disk. To relink, clear the `whatsapp_auth` rows (or set `WHATSAPP_AUTH_STORE=file` locally) and restart. A new pairing code will print in logs.
