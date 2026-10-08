import OpenAI from 'openai';
import {
  AssistantProvider,
  AssistantResponse,
  AssistantResponseRequest,
} from '../assistant.js';
import { GovernedProviderExecutionReceipt } from './governed-provider-execution.js';
import {
  OpenAIExecutionOptions,
  OpenAIInputTokenCounter,
  OpenAIInputTokensClient,
  OpenAIProviderExecutionEnvelope,
  OpenAIResponseCreateRequest,
  buildOpenAIProviderExecutionEnvelope,
  executeOpenAIProviderExecutionEnvelope,
} from './openai-execution.js';
import {
  OpenAIProviderExposureQuote,
  estimateOpenAICost,
} from './openai-rate-card.js';

export type {
  OpenAIReasoningEffort,
  OpenAIResponseCreateRequest,
} from './openai-execution.js';
export { OpenAIInputTokenCounter } from './openai-execution.js';

export interface OpenAIResponseLike {
  id: string;
  model?: string;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    prompt_tokens?: number;
    cached_input_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    output_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
    } | null;
    output_tokens_details?: {
      reasoning_tokens?: number;
    } | null;
  } | null;
}

export interface OpenAIResponsesClient {
  create(request: OpenAIResponseCreateRequest): Promise<OpenAIResponseLike>;
}

export interface OpenAIAssistantProviderOptions extends OpenAIExecutionOptions {}

function usageMetadata(usage: OpenAIResponseLike['usage']) {
  if (!usage) return undefined;

  const inputTokens = firstNumber(usage.input_tokens, usage.prompt_tokens);
  const cachedInputTokens = firstNumber(
    usage.cached_input_tokens,
    usage.cache_read_tokens,
    usage.input_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cache_read_tokens
  );
  const cacheWriteTokens = firstNumber(
    usage.cache_write_tokens,
    usage.input_tokens_details?.cache_write_tokens
  );
  const outputTokens = firstNumber(usage.output_tokens, usage.completion_tokens);
  const reasoningTokens = firstNumber(
    usage.reasoning_tokens,
    usage.output_tokens_details?.reasoning_tokens
  );

  const metadata: Record<string, number> = {};
  if (inputTokens !== undefined) {
    metadata.input_tokens = inputTokens;
    metadata.prompt_tokens = inputTokens;
  }
  if (cachedInputTokens !== undefined) {
    metadata.cached_input_tokens = cachedInputTokens;
    metadata.cache_read_tokens = cachedInputTokens;
  }
  if (cacheWriteTokens !== undefined) metadata.cache_write_tokens = cacheWriteTokens;
  if (outputTokens !== undefined) {
    metadata.output_tokens = outputTokens;
    metadata.completion_tokens = outputTokens;
  }
  if (reasoningTokens !== undefined) metadata.reasoning_tokens = reasoningTokens;
  if (typeof usage.total_tokens === 'number') metadata.total_tokens = usage.total_tokens;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function firstNumber(...values: Array<number | undefined | null>) {
  return values.find((value): value is number => typeof value === 'number');
}

function usageCostMetadata(
  model: string,
  processingMode: OpenAIAssistantProviderOptions['processingMode'],
  usage: ReturnType<typeof usageMetadata>
) {
  return estimateOpenAICost(model, processingMode, {
    input_tokens: usage?.input_tokens,
    cached_input_tokens: usage?.cached_input_tokens,
    cache_write_tokens: usage?.cache_write_tokens,
    output_tokens: usage?.output_tokens,
  });
}

function sanitizeRawUsage(usage: OpenAIResponseLike['usage']) {
  const metadata = usageMetadata(usage);
  return metadata ? { ...metadata } : undefined;
}

function executionMetadata(envelope: OpenAIProviderExecutionEnvelope) {
  return {
    requested_model: envelope.requested_model,
    canonical_model: envelope.canonical_model,
    processing_mode: envelope.processing_mode,
    execution_role: envelope.execution_role,
    attempt_number: envelope.attempt_number,
    request_fingerprint: envelope.fingerprint,
    timeout_ms: envelope.timeout_ms,
    max_retries: envelope.max_retries,
  };
}

function errorDiagnosticValue(error: unknown, key: string) {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function failedCallMetadata(
  error: unknown,
  envelope: OpenAIProviderExecutionEnvelope,
  durationMs: number
): Record<string, string | number | null> {
  const status = errorDiagnosticValue(error, 'status');
  const code =
    errorDiagnosticValue(error, 'code') ??
    errorDiagnosticValue(error, 'type') ??
    errorDiagnosticValue(error, 'name') ??
    'openai_provider_error';
  const requestId =
    errorDiagnosticValue(error, 'request_id') ?? errorDiagnosticValue(error, 'requestId');

  return {
    provider: 'openai',
    model: envelope.requested_model,
    endpoint: 'responses.create',
    status: 'failed',
    duration_ms: durationMs,
    error_code: String(code),
    ...executionMetadata(envelope),
    ...(typeof status === 'number' ? { http_status: status } : {}),
    ...(requestId ? { request_id: String(requestId) } : {}),
    retry_attempt: null,
  };
}

function failedResponseMetadata(
  response: OpenAIResponseLike,
  envelope: OpenAIProviderExecutionEnvelope,
  durationMs: number
): Record<string, unknown> {
  const usage = usageMetadata(response.usage);
  const rawProviderUsage = sanitizeRawUsage(response.usage);
  const responseModel = response.model ?? envelope.requested_model;

  return {
    provider: 'openai',
    model: responseModel,
    endpoint: 'responses.create',
    response_id: response.id,
    status: 'failed',
    duration_ms: durationMs,
    error_code: 'openai_empty_output',
    retry_attempt: null,
    ...executionMetadata(envelope),
    cost: usageCostMetadata(responseModel, thisProcessingMode(envelope), usage),
    ...(usage ? { usage } : {}),
    ...(rawProviderUsage ? { raw_provider_usage: rawProviderUsage } : {}),
  };
}

function thisProcessingMode(envelope: OpenAIProviderExecutionEnvelope) {
  return envelope.processing_mode as OpenAIAssistantProviderOptions['processingMode'];
}

function attachProviderMetadata(error: unknown, metadata: Record<string, unknown>) {
  if (error && typeof error === 'object') {
    (error as Record<string, unknown>).providerMetadata = metadata;
  }
}

function emptyOutputError() {
  const error = new Error('OpenAI response did not contain assistant text') as Error & {
    code?: string;
  };
  error.code = 'openai_empty_output';
  return error;
}

export function openAIProviderSuccessMetadata(
  response: OpenAIResponseLike,
  envelope: OpenAIProviderExecutionEnvelope,
  durationMs: number,
  governedExecution?: GovernedProviderExecutionReceipt<OpenAIProviderExposureQuote>
): Record<string, unknown> {
  const usage = usageMetadata(response.usage);
  const rawProviderUsage = sanitizeRawUsage(response.usage);
  const responseModel = response.model ?? envelope.requested_model;

  return {
    provider: 'openai',
    model: responseModel,
    endpoint: 'responses.create',
    response_id: response.id,
    status: 'succeeded',
    duration_ms: durationMs,
    ...executionMetadata(envelope),
    cost: usageCostMetadata(responseModel, thisProcessingMode(envelope), usage),
    ...(usage ? { usage } : {}),
    ...(rawProviderUsage ? { raw_provider_usage: rawProviderUsage } : {}),
    ...(governedExecution ? { governed_execution: governedExecution } : {}),
  };
}

export class OpenAIAssistantProvider implements AssistantProvider {
  readonly name = 'openai';

  constructor(
    private readonly responses: OpenAIResponsesClient,
    private readonly options: OpenAIAssistantProviderOptions
  ) {}

  async generateResponse(request: AssistantResponseRequest): Promise<AssistantResponse> {
    const envelope = buildOpenAIProviderExecutionEnvelope(request, this.options);
    const startedAt = Date.now();
    let response: OpenAIResponseLike;
    try {
      response = await executeOpenAIProviderExecutionEnvelope(this.responses, envelope);
    } catch (error) {
      attachProviderMetadata(
        error,
        failedCallMetadata(error, envelope, Date.now() - startedAt)
      );
      throw error;
    }

    const content = response.output_text?.trim();
    if (!content) {
      const error = emptyOutputError();
      attachProviderMetadata(
        error,
        failedResponseMetadata(response, envelope, Date.now() - startedAt)
      );
      throw error;
    }

    return {
      content,
      metadata: openAIProviderSuccessMetadata(
        response,
        envelope,
        Date.now() - startedAt
      ),
    };
  }
}

export function createOpenAIAssistantProvider(
  apiKey: string,
  options: OpenAIAssistantProviderOptions
): OpenAIAssistantProvider {
  const client = new OpenAI(openAIClientOptions(apiKey, options));
  return new OpenAIAssistantProvider(
    client.responses as unknown as OpenAIResponsesClient,
    options
  );
}

export function createOpenAIInputTokenCounter(
  apiKey: string,
  options: OpenAIAssistantProviderOptions
): OpenAIInputTokenCounter {
  const client = new OpenAI(openAIClientOptions(apiKey, options));
  return new OpenAIInputTokenCounter(
    client.responses.inputTokens as unknown as OpenAIInputTokensClient
  );
}

export function openAIClientOptions(apiKey: string, options: OpenAIAssistantProviderOptions) {
  return {
    apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  };
}
