import { AssistantProvider } from './assistant.js';
import { MeteredQualityGateProvider } from './assistant-quality-gate.js';
import {
  ProviderBackedQualityRepairer,
  ProviderBackedQualityVerifier,
} from './assistant-quality-provider.js';
import { env } from './env.js';
import { ProviderExecutionRole } from './providers/provider-execution-envelope.js';
import { createOpenAIAssistantProvider } from './providers/openai.js';

function openAIProvider(
  executionRole: ProviderExecutionRole,
  maxOutputTokens = env.OPENAI_MAX_OUTPUT_TOKENS
): AssistantProvider {
  return createOpenAIAssistantProvider(env.OPENAI_API_KEY!, {
    model: env.OPENAI_MODEL,
    processingMode: 'standard',
    executionRole,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    maxOutputTokens,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}

export function createConfiguredAssistantProvider(): AssistantProvider | null {
  if (env.ASSISTANT_PROVIDER === 'disabled') return null;

  if (env.ASSISTANT_QUALITY_GATE === 'disabled') return openAIProvider('root');

  const draftProvider = openAIProvider('draft');
  const verifierProvider = openAIProvider(
    'verifier',
    env.ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS
  );
  const repairProvider = openAIProvider('repair');

  return new MeteredQualityGateProvider(
    draftProvider,
    new ProviderBackedQualityVerifier(verifierProvider),
    new ProviderBackedQualityRepairer(repairProvider),
    {
      verifierFailureFallback: env.ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK,
    }
  );
}
