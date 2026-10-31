import type { AssistantProviderEvent } from './assistant.js';

export type DurableProviderEvent = {
  generationId: string;
  localSequence: number;
  event: AssistantProviderEvent;
};

export type DeliveryReceipt = {
  generationId: string;
  localSequence: number;
  providerEventType: string;
  providerSequenceNumber: number | null;
  providerResponseId: string | null;
};

export interface DurableProviderEventWriter {
  (input: DurableProviderEvent): Promise<void>;
}

export interface DownstreamProviderEventConsumer {
  (receipt: DeliveryReceipt): void | Promise<void>;
}

/**
 * CFR-002B ordering boundary. A provider event is never eligible for downstream
 * delivery until its durable acquisition write has completed successfully.
 * Delivery is deliberately best-effort: a disconnected consumer cannot roll
 * back accepted acquisition evidence and a restarted process can resume from
 * the durable provider-event ledger rather than this in-memory gateway.
 */
export class DurableConversationStreamGateway {
  constructor(
    private readonly persist: DurableProviderEventWriter,
    private readonly deliver?: DownstreamProviderEventConsumer
  ) {}

  async accept(input: DurableProviderEvent): Promise<DeliveryReceipt> {
    await this.persist(input);
    const receipt: DeliveryReceipt = {
      generationId: input.generationId,
      localSequence: input.localSequence,
      providerEventType: input.event.providerEventType,
      providerSequenceNumber: input.event.providerSequenceNumber ?? null,
      providerResponseId: input.event.providerResponseId ?? null,
    };

    if (this.deliver) {
      try {
        await this.deliver(receipt);
      } catch {
        // Persistence is the authoritative boundary. Downstream disconnects
        // must not convert an accepted provider event into acquisition failure.
      }
    }
    return receipt;
  }
}
