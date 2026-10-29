import { appConfig } from '../config/load-config.js';
import { formatMemories } from '../memory/store.js';

const TOOL_INSTRUCTION = `When the user asks you to generate code, a website, a portfolio, HTML, CSS, JavaScript, notes, or any downloadable text file, you MUST use the write_file tool. Create a separate file for each part, for example index.html, styles.css, and script.js. Do not dump large source files as chat text. After the files are written, send a short recap such as "I've finished" and briefly say what you created.

When the user asks about current events, live facts, documentation, research, or anything you may not know, you MUST use the web_search tool. Prefer a focused query. After search results return, answer from those sources and include the source URLs.`;

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
