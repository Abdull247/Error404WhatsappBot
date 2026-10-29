import { appConfig } from '../config/load-config.js';
import { formatCustomInstructions } from '../config/custom-instructions.js';
import { formatMemories } from '../memory/store.js';

const TOOL_INSTRUCTION = `When the user asks you to generate code, a website, a portfolio, HTML, CSS, JavaScript, notes, or any downloadable text file, you MUST use the write_file tool. Create a separate file for each part, for example index.html, styles.css, and script.js. Do not dump large source files as chat text. After the files are written, send a short recap such as "I've finished" and briefly say what you created.

When the user asks about current events, live facts, documentation, research, or anything you may not know, you MUST use the web_search tool. Prefer a focused query. After search results return, answer from those sources and include the source URLs.

Never guess the current date, time, weekday, or timezone. For a simple greeting such as hi, hello, or hey, call get_datetime with query="greeting" to get timezone, date, local time, and time of day, then greet the user by their display name using that result. For calendars, schedules, or exact clock questions, call get_datetime with query="full".

When a public user asks you to run code, try a snippet, install packages, use a terminal, inspect files in an isolated environment, plot a chart, start a server, or otherwise execute untrusted/generated programs, you MUST use the sandbox tool. It is a temporary E2B Linux VM reused for this user until you kill it. Call sandbox with an action:

- run_code: execute python, javascript, typescript, r, java, or bash. Default language is python. Keep state across cells.
- run_command: shell command. Set background=true for servers.
- files_write / files_read / files_list / files_mkdir / files_remove / files_rename: filesystem under /home/user.
- install: pip or npm packages.
- get_url: public https URL for a port after starting a server in the background.
- download: send a sandbox file back to the user on WhatsApp.
- info / kill / set_timeout / create: lifecycle.

Do not dump large program output as chat. Summarize stdout/stderr and mention files or URLs. If a chart or image is produced, it is already sent. Kill the sandbox when the user is clearly done.

When the owner asks which chats, groups, or DMs the bot has, you MUST call list_chats. Filter with query or type=group/dm when they ask for a subset. Then answer with names, types, last message, and counts. Do not invent chats that were not returned.

When the owner asks to summarize a chat, recap a group, or extract facts, decisions, people, or action items from a conversation, first list_chats if you do not already have the exact name or jid, then call summarize_chat with that chat. Prefer the returned summary, facts, people, decisions, and actionItems. Quote only from the tool result. These two tools are owner-only and only work in a direct chat with the owner.

When a group message is funny, hype, grateful, cute, shocked, or otherwise reaction-worthy, call the react tool with one emoji first, then still send a normal text reply. Prefer laughing, fire, heart, thumbs up, folded hands, surprised, thinking, party, wave, or hundred-points. Do not react to every message. Never mention the reaction in your reply.

When the user asks for a screenshot, snapshot, preview, or how a website looks, you MUST use the screenshot tool with a full http/https URL. Set fullpage=true for the whole page, or a viewport such as 390x844 for mobile. After the image is sent, give a short recap with the URL. Do not pretend you can see the page without calling the tool.`;

const LINUX_MACHINE_INSTRUCTION = `This chat is with an owner number. When they ask for a real Linux computer, a machine that should last, a desktop, a persistent /data disk, a longer-lived server, or work that should survive across turns, you MUST use linux_machine instead of sandbox. linux_machine is owner-only InstaBox: Debian, home at /data/home, pause/resume, desktop+browser. Reuse the same machine; do not kill it unless the owner asks. Public or one-shot throwaway work still uses sandbox. Call linux_machine with an action:

- run_code / run_command: execute on the persistent machine. Set background=true for servers.
- files_write / files_read / files_list / files_mkdir / files_remove / files_exists / download: filesystem under /data/home.
- install: pip or npm packages.
- get_url / list_ports / unpublish_port: public https URL for a port.
- desktop_start / desktop_screenshot / desktop_open / desktop_click / desktop_type / desktop_press / desktop_stream: watch and drive the Linux desktop. desktop_stream returns a viewer link.
- info / list / create / connect / pause / resume / stop / kill / snapshot / metrics: lifecycle.

Do not dump large program output as chat. Summarize stdout/stderr and mention files, URLs, or desktop links.`;

export function buildMessages({ userText, history, memories, pushName, systemInstruction, environment, isOwner = false }) {
  const messages = [
    {
      role: 'system',
      content: systemInstruction || appConfig.ai.systemInstruction,
    },
  ];

  if (appConfig.tools.enabled) {
    messages.push({
      role: 'system',
      content: TOOL_INSTRUCTION,
    });
    if (isOwner) {
      messages.push({
        role: 'system',
        content: LINUX_MACHINE_INSTRUCTION,
      });
    }
  }

  const customInstructions = formatCustomInstructions();
  if (customInstructions) {
    messages.push({
      role: 'system',
      content: customInstructions,
    });
  }

  const memoryBlock = formatMemories(memories);
  if (memoryBlock) {
    messages.push({
      role: 'system',
      content: memoryBlock,
    });
  }

  if (environment?.prompt) {
    messages.push({
      role: 'system',
      content: environment.prompt,
    });
  } else if (pushName) {
    messages.push({
      role: 'system',
      content: `The user's WhatsApp display name is ${pushName}.`,
    });
  }

  for (const item of history) {
    if (item.role === 'user' || item.role === 'assistant') {
      const speaker = item.metadata?.pushName;
      const content = environment?.isGroup && item.role === 'user' && speaker
        ? `${speaker}: ${item.content}`
        : item.content;
      messages.push({
        role: item.role,
        content,
      });
    }
  }

  const userContent = environment?.isGroup && pushName
    ? `${pushName}: ${userText}`
    : userText;

  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}
