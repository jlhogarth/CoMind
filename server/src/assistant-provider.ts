import OpenAI from 'openai';
import { AssistantProvider } from './assistant.js';
import { MeteredQualityGateProvider } from './assistant-quality-gate.js';
import {
  ProviderBackedQualityRepairer,
  ProviderBackedQualityVerifier,
} from './assistant-quality-provider.js';
import { QueryFunction, query } from './db.js';
import { env } from './env.js';
import { CurrentRuntimePaidApiLedger } from './providers/current-runtime-paid-api-ledger.js';
import { CurrentRuntimeProviderBudgetAuthority } from './providers/current-runtime-provider-budget-authority.js';
import { GovernedOpenAIAssistantProvider } from './providers/governed-openai-assistant.js';
import {
  OpenAIAssistantProviderOptions,
  OpenAIInputTokenCounter,
  OpenAIResponsesClient,
  openAIClientOptions,
} from './providers/openai.js';
import { OpenAIInputTokensClient } from './providers/openai-execution.js';
import { ProviderExecutionRole } from './providers/provider-execution-envelope.js';

interface GovernedProviderFactoryInput {
  readonly queryFn: QueryFunction;
  readonly executionRole: ProviderExecutionRole;
  readonly maxOutputTokens: number;
}

export interface ConfiguredAssistantProviderDependencies {
  readonly queryFn?: QueryFunction;
  readonly governedProviderFactory?: (
    input: GovernedProviderFactoryInput
  ) => AssistantProvider;
}

function requiredRuntimeAuthorityId(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for governed assistant execution`);
  }
  return value;
}

function providerOptions(
  executionRole: ProviderExecutionRole,
  maxOutputTokens: number
): OpenAIAssistantProviderOptions {
  return {
    model: env.OPENAI_MODEL,
    processingMode: 'standard',
    executionRole,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    maxOutputTokens,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  };
}

function createCurrentRuntimeGovernedOpenAIProvider(
  input: GovernedProviderFactoryInput
): AssistantProvider {
  const apiKey = requiredRuntimeAuthorityId(env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const bindingId = requiredRuntimeAuthorityId(
    env.OPENAI_PAID_API_BINDING_ID,
    'OPENAI_PAID_API_BINDING_ID'
  );
  const proposalId = requiredRuntimeAuthorityId(
    env.OPENAI_PAID_API_PROPOSAL_ID,
    'OPENAI_PAID_API_PROPOSAL_ID'
  );
  const options = providerOptions(input.executionRole, input.maxOutputTokens);
  if (options.maxRetries !== 0) {
    throw new Error('Governed assistant execution requires OPENAI_MAX_RETRIES=0');
  }

  const client = new OpenAI(openAIClientOptions(apiKey, options));
  return new GovernedOpenAIAssistantProvider(
    {
      queryFn: input.queryFn,
      responses: client.responses as unknown as OpenAIResponsesClient,
      inputTokenCounter: new OpenAIInputTokenCounter(
        client.responses.inputTokens as unknown as OpenAIInputTokensClient
      ),
      budgetAuthority: new CurrentRuntimeProviderBudgetAuthority(input.queryFn, bindingId),
      paidExecutionLedger: new CurrentRuntimePaidApiLedger(input.queryFn, {
        proposalId,
        bindingId,
      }),
    },
    options
  );
}

function governedOpenAIProvider(
  dependencies: Required<ConfiguredAssistantProviderDependencies>,
  executionRole: ProviderExecutionRole,
  maxOutputTokens = env.OPENAI_MAX_OUTPUT_TOKENS
): AssistantProvider {
  return dependencies.governedProviderFactory({
    queryFn: dependencies.queryFn,
    executionRole,
    maxOutputTokens,
  });
}

export function createConfiguredAssistantProvider(
  input: ConfiguredAssistantProviderDependencies = {}
): AssistantProvider | null {
  if (env.ASSISTANT_PROVIDER === 'disabled') return null;

  const dependencies: Required<ConfiguredAssistantProviderDependencies> = {
    queryFn: input.queryFn ?? query,
    governedProviderFactory:
      input.governedProviderFactory ?? createCurrentRuntimeGovernedOpenAIProvider,
  };

  if (env.ASSISTANT_QUALITY_GATE === 'disabled') {
    return governedOpenAIProvider(dependencies, 'root');
  }

  const draftProvider = governedOpenAIProvider(dependencies, 'draft');
  const verifierProvider = governedOpenAIProvider(
    dependencies,
    'verifier',
    env.ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS
  );
  const repairProvider = governedOpenAIProvider(dependencies, 'repair');

  return new MeteredQualityGateProvider(
    draftProvider,
    new ProviderBackedQualityVerifier(verifierProvider),
    new ProviderBackedQualityRepairer(repairProvider),
    {
      verifierFailureFallback: env.ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK,
    }
  );
}