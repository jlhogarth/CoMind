import { AssistantProvider } from './assistant.js';
import { env } from './env.js';
import { createOpenAIAssistantProvider } from './providers/openai.js';

export function createConfiguredAssistantProvider(): AssistantProvider | null {
  if (env.ASSISTANT_PROVIDER === 'disabled') return null;

  return createOpenAIAssistantProvider(env.OPENAI_API_KEY!, {
    model: env.OPENAI_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}
