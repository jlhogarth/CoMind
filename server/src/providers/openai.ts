import OpenAI from 'openai';
import {
  AssistantProvider,
  AssistantResponse,
  AssistantResponseObserver,
  AssistantResponseRequest,
} from '../assistant.js';
import { GovernedProviderExecutionReceipt } from './governed-provider-execution.js';
import {
  OpenAIExecutionOptions,
  OpenAIInputTokenCounter,
  OpenAIInputTokensClient,
  OpenAIProviderExecutionEnvelope,
  OpenAIResponseCreateRequest,
  OpenAIResponseStreamingCreateRequest,
  buildOpenAIProviderExecutionEnvelope,
  executeOpenAIProviderExecutionEnvelope,
  executeOpenAIProviderStreamingEnvelope,
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
  status?: string;
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

export interface OpenAIResponseStreamEventLike {
  type: string;
  sequence_number?: number;
  delta?: string;
  response?: OpenAIResponseLike;
  error?: unknown;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface OpenAIResponseStreamLike extends AsyncIterable<OpenAIResponseStreamEventLike> {}

export interface OpenAIResponsesClient {
  create(request: OpenAIResponseCreateRequest): Promise<OpenAIResponseLike>;
  create(request: OpenAIResponseStreamingCreateRequest): Promise<OpenAIResponseStreamLike>;
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
  durationMs: number,
  errorCode = 'openai_empty_output'
): Record<string, unknown> {
  const usage = usageMetadata(response.usage);
  const rawProviderUsage = sanitizeRawUsage(response.usage);
  const responseModel = response.model ?? envelope.requested_model;

  return {
    provider: 'openai',
    model: responseModel,
    endpoint: 'responses.create',
    response_id: response.id,
    status: response.status ?? 'failed',
    duration_ms: durationMs,
    error_code: errorCode,
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

function existingProviderMetadata(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const metadata = (error as Record<string, unknown>).providerMetadata;
  return metadata && typeof metadata === 'object'
    ? metadata as Record<string, unknown>
    : undefined;
}

function attachProviderMetadata(error: unknown, metadata: Record<string, unknown>) {
  if (error && typeof error === 'object' && !existingProviderMetadata(error)) {
    (error as Record<string, unknown>).providerMetadata = metadata;
  }
}

function providerError(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function emptyOutputError() {
  return providerError('OpenAI response did not contain assistant text', 'openai_empty_output');
}

function streamTerminalError(
  response: OpenAIResponseLike,
  envelope: OpenAIProviderExecutionEnvelope,
  durationMs: number,
  eventType: string
) {
  const code = eventType === 'response.incomplete'
    ? 'openai_stream_incomplete'
    : 'openai_stream_failed';
  const error = providerError(`OpenAI stream terminated with ${eventType}`, code);
  attachProviderMetadata(
    error,
    failedResponseMetadata(response, envelope, durationMs, code)
  );
  return error;
}

function incompleteStreamError(
  envelope: OpenAIProviderExecutionEnvelope,
  durationMs: number,
  responseId: string | null
) {
  const error = providerError(
    'OpenAI stream ended before a completed response event',
    'openai_stream_incomplete'
  );
  attachProviderMetadata(error, {
    provider: 'openai',
    model: envelope.requested_model,
    endpoint: 'responses.create',
    status: 'incomplete',
    duration_ms: durationMs,
    error_code: 'openai_stream_incomplete',
    ...(responseId ? { response_id: responseId } : {}),
    ...executionMetadata(envelope),
    retry_attempt: null,
  });
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
    private readonly options: OpenAIAssistantProviderOptions,
    private readonly streamingObservationsEnabled = false
  ) {}

  private async generateStreamingResponse(
    request: AssistantResponseRequest,
    observer: AssistantResponseObserver
  ): Promise<AssistantResponse> {
    const envelope = buildOpenAIProviderExecutionEnvelope(request, this.options);
    const startedAt = Date.now();
    let stream: OpenAIResponseStreamLike;

    try {
      stream = await executeOpenAIProviderStreamingEnvelope(this.responses, envelope);
    } catch (error) {
      attachProviderMetadata(error, failedCallMetadata(error, envelope, Date.now() - startedAt));
      throw error;
    }

    let content = '';
    let responseId: string | null = null;
    let completedResponse: OpenAIResponseLike | null = null;

    try {
      for await (const event of stream) {
        if (event.response?.id) responseId = event.response.id;

        if (event.type === 'response.output_text.delta') {
          if (typeof event.delta !== 'string' || event.delta.length === 0) continue;
          content += event.delta;
          await observer.onTextDelta({
            delta: event.delta,
            stage: observer.stage,
            providerEventType: event.type,
            ...(typeof event.sequence_number === 'number'
              ? { providerSequenceNumber: event.sequence_number }
              : {}),
            ...(responseId ? { providerResponseId: responseId } : {}),
            metadata: {
              ...(event.item_id ? { item_id: event.item_id } : {}),
              ...(typeof event.output_index === 'number'
                ? { output_index: event.output_index }
                : {}),
              ...(typeof event.content_index === 'number'
                ? { content_index: event.content_index }
                : {}),
            },
          });
          continue;
        }

        if (event.type === 'response.completed' && event.response) {
          completedResponse = event.response;
          responseId = event.response.id;
          continue;
        }

        if (
          (event.type === 'response.failed' || event.type === 'response.incomplete')
          && event.response
        ) {
          throw streamTerminalError(
            event.response,
            envelope,
            Date.now() - startedAt,
            event.type
          );
        }

        if (event.type === 'error') {
          const error = providerError('OpenAI stream emitted an error event', 'openai_stream_error');
          attachProviderMetadata(error, {
            ...failedCallMetadata(event.error, envelope, Date.now() - startedAt),
            ...(responseId ? { response_id: responseId } : {}),
            error_code: 'openai_stream_error',
          });
          throw error;
        }
      }
    } catch (error) {
      attachProviderMetadata(error, failedCallMetadata(error, envelope, Date.now() - startedAt));
      throw error;
    }

    if (!completedResponse) {
      throw incompleteStreamError(envelope, Date.now() - startedAt, responseId);
    }

    const finalContent = content.trim();
    if (!finalContent) {
      const error = emptyOutputError();
      attachProviderMetadata(
        error,
        failedResponseMetadata(completedResponse, envelope, Date.now() - startedAt)
      );
      throw error;
    }

    return {
      content: finalContent,
      metadata: openAIProviderSuccessMetadata(
        completedResponse,
        envelope,
        Date.now() - startedAt
      ),
    };
  }

  async generateResponse(
    request: AssistantResponseRequest,
    observer?: AssistantResponseObserver
  ): Promise<AssistantResponse> {
    if (observer && this.streamingObservationsEnabled) {
      return this.generateStreamingResponse(request, observer);
    }

    const envelope = buildOpenAIProviderExecutionEnvelope(request, this.options);
    const startedAt = Date.now();
    let response: OpenAIResponseLike;
    try {
      response = await executeOpenAIProviderExecutionEnvelope(this.responses, envelope);
    } catch (error) {
      attachProviderMetadata(error, failedCallMetadata(error, envelope, Date.now() - startedAt));
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
    options,
    true
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
