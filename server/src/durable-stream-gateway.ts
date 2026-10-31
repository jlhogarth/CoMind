import type { AssistantProviderEvent } from './assistant.js';
import type {
  ProviderAcquisitionWriteInput,
  ProviderAcquisitionWriteResult,
  ProviderAcquisitionWriter,
} from './conversation-acquisition-store.js';

export interface DurableStreamDelivery {
  event: AssistantProviderEvent;
  receipt: ProviderAcquisitionWriteResult;
  localSequence: number;
}

export type DurableStreamDeliverer = (delivery: DurableStreamDelivery) => void | Promise<void>;

export interface DurableStreamGatewayInput {
  conversationId: string;
  generationId: string;
  event: AssistantProviderEvent;
}

/**
 * CFR-002B durability boundary.
 *
 * A provider event is not eligible for downstream delivery until the existing
 * CFR-002A acquisition writer has durably returned its persistence receipt.
 * Delivery failure never rolls back or disguises that accepted evidence.
 *
 * Sequence allocation is gateway-local and monotonic. Provider sequence and
 * identity remain inside the source event and are persisted by CFR-002A, so
 * duplicates and out-of-order provider events remain source-distinct evidence.
 */
export class DurableStreamGateway {
  #nextLocalSequence = 1;

  constructor(
    private readonly persist: ProviderAcquisitionWriter,
    private readonly deliver: DurableStreamDeliverer
  ) {}

  async accept(input: DurableStreamGatewayInput): Promise<ProviderAcquisitionWriteResult> {
    const localSequence = this.#nextLocalSequence++;
    const write: ProviderAcquisitionWriteInput = {
      conversationId: input.conversationId,
      generationId: input.generationId,
      localSequence,
      event: input.event,
    };

    const receipt = await this.persist(write);
    await this.deliver({ event: input.event, receipt, localSequence });
    return receipt;
  }
}

export function createPersistenceOnlyStreamGateway(
  persist: ProviderAcquisitionWriter
): DurableStreamGateway {
  return new DurableStreamGateway(persist, async () => undefined);
}
