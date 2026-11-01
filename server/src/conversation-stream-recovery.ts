import type { DeliveryReceipt } from './conversation-stream-gateway.js';

export type RecoveryInterruption =
  | 'client_disconnect'
  | 'provider_interruption'
  | 'server_restart'
  | 'duplicate_replay'
  | 'out_of_order_replay'
  | 'unrecoverable_gap';

export type DurableReplayReader = (input: {
  generationId: string;
  afterLocalSequence: number;
}) => Promise<DeliveryReceipt[]>;

export type RecoveryResult = {
  generationId: string;
  afterLocalSequence: number;
  receipts: DeliveryReceipt[];
  interruption: RecoveryInterruption | null;
  nextLocalSequence: number;
};

/**
 * CFR-002C replay boundary. Recovery reads only already durable gateway receipts.
 * It does not rerun inference and does not infer missing events across a durable gap.
 */
export class DurableConversationRecovery {
  constructor(private readonly readDurable: DurableReplayReader) {}

  async resume(generationId: string, afterLocalSequence: number): Promise<RecoveryResult> {
    const raw = await this.readDurable({ generationId, afterLocalSequence });
    const ordered = [...raw].sort((a, b) => a.localSequence - b.localSequence);
    const receipts: DeliveryReceipt[] = [];
    let expected = afterLocalSequence + 1;
    let interruption: RecoveryInterruption | null = null;

    for (const receipt of ordered) {
      if (receipt.generationId !== generationId) continue;
      if (receipt.localSequence <= afterLocalSequence) continue;
      if (receipt.localSequence < expected) {
        interruption ??= 'duplicate_replay';
        continue;
      }
      if (receipt.localSequence > expected) {
        interruption = 'unrecoverable_gap';
        break;
      }
      receipts.push(receipt);
      expected += 1;
    }

    return {
      generationId,
      afterLocalSequence,
      receipts,
      interruption,
      nextLocalSequence: expected,
    };
  }
}
