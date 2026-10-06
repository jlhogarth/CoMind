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
    output_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface OpenAIResponsesClient {
  create(request: OpenAIResponseCreateRequest): Promise<OpenAIResponseLike>;
}

export interface OpenAIAssistantProviderOptions {
  model: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: number;
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

  const metadata: Record<string, number> = {};
  if (typeof usage.input_tokens === 'number') metadata.input_tokens = usage.input_tokens;
  if (typeof usage.output_tokens === 'number') metadata.output_tokens = usage.output_tokens;
  if (typeof usage.total_tokens === 'number') metadata.total_tokens = usage.total_tokens;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export class OpenAIAssistantProvider implements AssistantProvider {
  readonly name = 'openai';

  constructor(
    private readonly responses: OpenAIResponsesClient,
    private readonly options: OpenAIAssistantProviderOptions
  ) {}

  async generateResponse(request: AssistantResponseRequest): Promise<AssistantResponse> {
    const response = await this.responses.create({
      model: this.options.model,
      input: request.messages.map(mapConversationMessage),
      store: false,
      reasoning: { effort: this.options.reasoningEffort },
      max_output_tokens: this.options.maxOutputTokens,
    });

    const content = response.output_text?.trim();
    if (!content) {
      throw new Error('OpenAI response did not contain assistant text');
    }

    const usage = usageMetadata(response.usage);
    return {
      content,
      metadata: {
        provider: this.name,
        model: response.model ?? this.options.model,
        response_id: response.id,
        ...(usage ? { usage } : {}),
      },
    };
  }
}

export function createOpenAIAssistantProvider(
  apiKey: string,
  options: OpenAIAssistantProviderOptions
): OpenAIAssistantProvider {
  const client = new OpenAI({ apiKey });
  return new OpenAIAssistantProvider(
    client.responses as unknown as OpenAIResponsesClient,
    options
  );
}
