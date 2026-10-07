import OpenAI from 'openai';
import {
  AssistantProvider,
  AssistantResponse,
  AssistantResponseRequest,
  ConversationMessage,
} from '../assistant.js';

export type OpenAIReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface OpenAIResponseCreateRequest {
  model: string;
  input: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  store: false;
  reasoning: {
    effort: OpenAIReasoningEffort;
  };
  max_output_tokens: number;
}

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

export interface OpenAIAssistantProviderOptions {
  model: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

function mapConversationMessage(message: ConversationMessage) {
  if (message.role === 'tool') {
    throw new Error('OpenAI assistant provider does not accept tool-role history when tools are disabled');
  }

  return {
    role: message.role,
    content: message.content,
  } as const;
}

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

function usageCostMetadata() {
  return {
    estimated_cost_usd: null,
    currency: 'USD',
    rate_card_version: 'not_configured',
    pricing_assumption:
      'Token usage is captured, but no committed OpenAI rate card is configured for USD estimation.',
  };
}

function sanitizeRawUsage(usage: OpenAIResponseLike['usage']) {
  const metadata = usageMetadata(usage);
  return metadata ? { ...metadata } : undefined;
}

function errorDiagnosticValue(error: unknown, key: string) {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function failedCallMetadata(
  error: unknown,
  model: string,
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
    model,
    endpoint: 'responses.create',
    status: 'failed',
    duration_ms: durationMs,
    error_code: String(code),
    ...(typeof status === 'number' ? { http_status: status } : {}),
    ...(requestId ? { request_id: String(requestId) } : {}),
    retry_attempt: null,
  };
}

function failedResponseMetadata(
  response: OpenAIResponseLike,
  model: string,
  durationMs: number
): Record<string, unknown> {
  const usage = usageMetadata(response.usage);
  const rawProviderUsage = sanitizeRawUsage(response.usage);

  return {
    provider: 'openai',
    model: response.model ?? model,
    endpoint: 'responses.create',
    response_id: response.id,
    status: 'failed',
    duration_ms: durationMs,
    error_code: 'openai_empty_output',
    retry_attempt: null,
    cost: usageCostMetadata(),
    ...(usage ? { usage } : {}),
    ...(rawProviderUsage ? { raw_provider_usage: rawProviderUsage } : {}),
  };
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

export class OpenAIAssistantProvider implements AssistantProvider {
  readonly name = 'openai';

  constructor(
    private readonly responses: OpenAIResponsesClient,
    private readonly options: OpenAIAssistantProviderOptions
  ) {}

  async generateResponse(request: AssistantResponseRequest): Promise<AssistantResponse> {
    const startedAt = Date.now();
    let response: OpenAIResponseLike;
    try {
      response = await this.responses.create({
        model: this.options.model,
        input: request.messages.map(mapConversationMessage),
        store: false,
        reasoning: { effort: this.options.reasoningEffort },
        max_output_tokens: this.options.maxOutputTokens,
      });
    } catch (error) {
      attachProviderMetadata(
        error,
        failedCallMetadata(error, this.options.model, Date.now() - startedAt)
      );
      throw error;
    }

    const content = response.output_text?.trim();
    if (!content) {
      const error = emptyOutputError();
      attachProviderMetadata(
        error,
        failedResponseMetadata(response, this.options.model, Date.now() - startedAt)
      );
      throw error;
    }

    const usage = usageMetadata(response.usage);
    const rawProviderUsage = sanitizeRawUsage(response.usage);
    return {
      content,
      metadata: {
        provider: this.name,
        model: response.model ?? this.options.model,
        endpoint: 'responses.create',
        response_id: response.id,
        status: 'succeeded',
        duration_ms: Date.now() - startedAt,
        cost: usageCostMetadata(),
        ...(usage ? { usage } : {}),
        ...(rawProviderUsage ? { raw_provider_usage: rawProviderUsage } : {}),
      },
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

export function openAIClientOptions(apiKey: string, options: OpenAIAssistantProviderOptions) {
  return {
    apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  };
}
