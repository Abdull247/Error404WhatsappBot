import { appConfig } from '../config/load-config.js';
import { formatMemories } from '../memory/store.js';

export function buildMessages({ userText, history, memories, pushName }) {
  const messages = [
    {
      role: 'system',
      content: appConfig.ai.systemInstruction,
    },
  ];

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
