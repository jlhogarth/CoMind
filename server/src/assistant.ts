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

export interface AssistantProviderEvent {
  provider: string;
  providerEndpoint?: string;
  providerEventType: string;
  providerSequenceNumber?: number;
  providerResponseId?: string;
  observedAt: string;
  stage: AssistantObservationStage;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AssistantResponseObserver {
  readonly stage: AssistantObservationStage;
  onTextDelta(event: AssistantTextDelta): void | Promise<void>;
  onProviderEvent?(event: AssistantProviderEvent): void | Promise<void>;
}

export function withAssistantObservationStage(
  observer: AssistantResponseObserver | undefined,
  stage: AssistantObservationStage
): AssistantResponseObserver | undefined {
  if (!observer) return undefined;
  const stagedObserver: AssistantResponseObserver = {
    stage,
    onTextDelta: observer.onTextDelta.bind(observer),
  };
  if (observer.onProviderEvent) {
    stagedObserver.onProviderEvent = observer.onProviderEvent.bind(observer);
  }
  return stagedObserver;
}

export interface AssistantProvider {
  readonly name: string;
  generateResponse(
    request: AssistantResponseRequest,
    observer?: AssistantResponseObserver
  ): Promise<AssistantResponse>;
}
