import { env } from '../config/env.js';
import { appConfig } from '../config/load-config.js';
import { logger } from '../utils/logger.js';

export class AiClientError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'AiClientError';
    this.status = status;
    this.body = body;
  }
}

export async function createChatCompletion({ messages, tools, toolChoice, temperature }) {
  const payload = {
    model: appConfig.ai.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : appConfig.ai.temperature,
    max_tokens: appConfig.ai.maxTokens,
    top_p: appConfig.ai.topP,
    stream: Boolean(appConfig.ai.stream),
  };

  if (appConfig.tools.enabled && tools?.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice || 'auto';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  try {
    logger.info({ model: payload.model, stream: payload.stream }, 'calling AI chat completions');
    const response = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AiClientError(
        `AI request failed with status ${response.status}`,
        response.status,
        body,
      );
    }

    return body;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AiClientError(`AI request timed out after ${env.AI_TIMEOUT_MS}ms`, 408);
    }
    logger.error({ err: error }, 'AI request error');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
