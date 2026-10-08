import type { ProviderExecutionRole } from './provider-execution.js';

export type ConversationRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

export interface AssistantResponseRequest {
  conversationId: string;
  messages: ConversationMessage[];
  executionRole?: ProviderExecutionRole;
}

export interface AssistantResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AssistantProvider {
  readonly name: string;
  generateResponse(request: AssistantResponseRequest): Promise<AssistantResponse>;
}
