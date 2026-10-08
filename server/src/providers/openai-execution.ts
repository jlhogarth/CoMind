import { AssistantResponseRequest, ConversationMessage } from '../assistant.js';
import {
  ProviderExecutionEnvelope,
  ProviderExecutionRole,
  ProviderInputTokenCounter,
  assertProviderExecutionEnvelopeIntegrity,
  createProviderExecutionEnvelope,
} from './provider-execution-envelope.js';
import {
  OpenAIProcessingMode,
  quoteOpenAIProviderExposure,
} from './openai-rate-card.js';

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

export interface OpenAIExecutionOptions {
  model: string;
  processingMode: OpenAIProcessingMode;
  executionRole: ProviderExecutionRole;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export type OpenAIProviderExecutionEnvelope =
  ProviderExecutionEnvelope<OpenAIResponseCreateRequest>;

export interface OpenAIResponseCreateClient<TResponse> {
  create(request: OpenAIResponseCreateRequest): Promise<TResponse>;
}

export interface OpenAIInputTokenCountRequest {
  model: string;
  input: OpenAIResponseCreateRequest['input'];
  reasoning: OpenAIResponseCreateRequest['reasoning'];
}

export interface OpenAIInputTokenCountResponse {
  input_tokens: number;
  object?: string;
}

export interface OpenAIInputTokensClient {
  count(request: OpenAIInputTokenCountRequest): Promise<OpenAIInputTokenCountResponse>;
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

function canonicalModelIdentity(model: string, processingMode: OpenAIProcessingMode) {
  return quoteOpenAIProviderExposure({
    model,
    processing_mode: processingMode,
    max_input_tokens: 0,
    max_output_tokens: 1,
  }).canonical_model;
}

export function buildOpenAIProviderExecutionEnvelope(
  request: AssistantResponseRequest,
  options: OpenAIExecutionOptions
): OpenAIProviderExecutionEnvelope {
  const providerRequest: OpenAIResponseCreateRequest = {
    model: options.model,
    input: request.messages.map(mapConversationMessage),
    store: false,
    reasoning: { effort: options.reasoningEffort },
    max_output_tokens: options.maxOutputTokens,
  };

  return createProviderExecutionEnvelope({
    provider: 'openai',
    requestedModel: options.model,
    canonicalModel: canonicalModelIdentity(options.model, options.processingMode),
    processingMode: options.processingMode,
    executionRole: options.executionRole,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    request: providerRequest,
  });
}

export function executeOpenAIProviderExecutionEnvelope<TResponse>(
  responses: OpenAIResponseCreateClient<TResponse>,
  envelope: OpenAIProviderExecutionEnvelope
) {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  return responses.create(envelope.request);
}

export function openAIInputTokenCountRequest(
  envelope: OpenAIProviderExecutionEnvelope
): Readonly<OpenAIInputTokenCountRequest> {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  if (envelope.provider !== 'openai') {
    throw new Error('OpenAI input-token counter requires an OpenAI execution envelope');
  }

  return Object.freeze({
    model: envelope.request.model,
    input: envelope.request.input,
    reasoning: envelope.request.reasoning,
  });
}

export class OpenAIInputTokenCounter
  implements ProviderInputTokenCounter<OpenAIResponseCreateRequest>
{
  readonly name = 'openai.responses.inputTokens.count';

  constructor(private readonly inputTokens: OpenAIInputTokensClient) {}

  async countInputTokens(envelope: OpenAIProviderExecutionEnvelope) {
    const response = await this.inputTokens.count(openAIInputTokenCountRequest(envelope));
    return response.input_tokens;
  }
}
