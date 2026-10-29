import { appConfig } from '../config/load-config.js';
import { formatMemories } from '../memory/store.js';

const TOOL_INSTRUCTION = `When the user asks you to generate code, a website, a portfolio, HTML, CSS, JavaScript, notes, or any downloadable text file, you MUST use the write_file tool. Create a separate file for each part, for example index.html, styles.css, and script.js. Do not dump large source files as chat text. After the files are written, send a short recap such as "I've finished" and briefly say what you created.

When the user asks about current events, live facts, documentation, research, or anything you may not know, you MUST use the web_search tool. Prefer a focused query. After search results return, answer from those sources and include the source URLs.

Never guess the current date, time, weekday, or timezone. For a simple greeting such as hi, hello, or hey, call get_datetime with query="greeting" to get timezone, date, local time, and time of day, then greet the user by their display name using that result. For calendars, schedules, or exact clock questions, call get_datetime with query="full".

When the user asks you to run code, try a snippet, install packages, use a terminal, inspect files in an isolated environment, plot a chart, start a server, or otherwise execute untrusted/generated programs, you MUST use the sandbox tool. It is a temporary E2B Linux VM reused for this user until you kill it. Call sandbox with an action:

- run_code: execute python, javascript, typescript, r, java, or bash. Default language is python. Keep state across cells.
- run_command: shell command. Set background=true for servers.
- files_write / files_read / files_list / files_mkdir / files_remove / files_rename: filesystem under /home/user.
- install: pip or npm packages.
- get_url: public https URL for a port after starting a server in the background.
- download: send a sandbox file back to the user on WhatsApp.
- info / kill / set_timeout / create: lifecycle.

Do not dump large program output as chat. Summarize stdout/stderr and mention files or URLs. If a chart or image is produced, it is already sent. Kill the sandbox when the user is clearly done.`;

export function buildMessages({ userText, history, memories, pushName }) {
  const messages = [
    {
      role: 'system',
      content: appConfig.ai.systemInstruction,
    },
  ];

  if (appConfig.tools.enabled) {
    messages.push({
      role: 'system',
      content: TOOL_INSTRUCTION,
    });
  }

  const memoryBlock = formatMemories(memories);
  if (memoryBlock) {
    messages.push({
      role: 'system',
      content: memoryBlock,
    });
  }

  if (pushName) {
    messages.push({
      role: 'system',
      content: `The user's WhatsApp display name is ${pushName}.`,
    });
  }

  for (const item of history) {
    if (item.role === 'user' || item.role === 'assistant') {
      messages.push({
        role: item.role,
        content: item.content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: userText,
  });

  return messages;
}
