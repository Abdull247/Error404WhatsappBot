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
