export type ConversationRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

export interface AssistantResponseRequest {
  conversationId: string;
  messages: ConversationMessage[];
}

export interface AssistantResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

export type AssistantObservationStage = 'direct' | 'draft' | 'repair';

export interface AssistantTextDelta {
  delta: string;
  stage: AssistantObservationStage;
  providerEventType?: string;
  providerSequenceNumber?: number;
  providerResponseId?: string;
  metadata?: Record<string, unknown>;
}

export interface AssistantResponseObserver {
  readonly stage: AssistantObservationStage;
  onTextDelta(event: AssistantTextDelta): void | Promise<void>;
}

export function withAssistantObservationStage(
  observer: AssistantResponseObserver | undefined,
  stage: AssistantObservationStage
): AssistantResponseObserver | undefined {
  if (!observer) return undefined;
  return {
    stage,
    onTextDelta: observer.onTextDelta.bind(observer),
  };
}

export interface AssistantProvider {
  readonly name: string;
  generateResponse(
    request: AssistantResponseRequest,
    observer?: AssistantResponseObserver
  ): Promise<AssistantResponse>;
}
