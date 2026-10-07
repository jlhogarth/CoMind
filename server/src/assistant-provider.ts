import { AssistantProvider } from './assistant.js';
import { MeteredQualityGateProvider } from './assistant-quality-gate.js';
import {
  ProviderBackedQualityRepairer,
  ProviderBackedQualityVerifier,
} from './assistant-quality-provider.js';
import { env } from './env.js';
import { createOpenAIAssistantProvider } from './providers/openai.js';

function openAIProvider(): AssistantProvider {
  return createOpenAIAssistantProvider(env.OPENAI_API_KEY!, {
    model: env.OPENAI_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}

export function createConfiguredAssistantProvider(): AssistantProvider | null {
  if (env.ASSISTANT_PROVIDER === 'disabled') return null;

  const draftProvider = openAIProvider();
  if (env.ASSISTANT_QUALITY_GATE === 'disabled') return draftProvider;

  const verifierProvider = openAIProvider();
  const repairProvider = openAIProvider();

  return new MeteredQualityGateProvider(
    draftProvider,
    new ProviderBackedQualityVerifier(verifierProvider),
    new ProviderBackedQualityRepairer(repairProvider),
    {
      verifierFailureFallback: env.ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK,
    }
  );
}
