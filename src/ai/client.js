import { getAiRuntime } from '../config/providers.js';
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

export async function createChatCompletion({ messages, tools, toolChoice, temperature, runtime }) {
  const ai = runtime || getAiRuntime();
  const payload = {
    model: ai.modelId,
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

  const headers = {
    'Content-Type': 'application/json',
  };
  if (ai.apiKey) {
    headers.Authorization = `Bearer ${ai.apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ai.timeoutMs);

  try {
    logger.info({ provider: ai.providerId, model: payload.model, stream: payload.stream }, 'calling AI chat completions');
    const response = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
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
      throw new AiClientError(`AI request timed out after ${ai.timeoutMs}ms`, 408);
    }
    logger.error({ err: error }, 'AI request error');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
