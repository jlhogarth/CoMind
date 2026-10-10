import type { QueryFunction } from '../db.js';
import type { ContinuityState } from './checkpoint.js';
import { saveCheckpoint } from './repository.js';

export interface CheckpointScheduler {
  schedule(state: ContinuityState): boolean;
  drain(): Promise<void>;
  close(): Promise<void>;
}

export function createCheckpointScheduler(
  query: QueryFunction,
  options: { enabled: boolean; capacity?: number; onFailure?: (reason: string) => void }
): CheckpointScheduler {
  const capacity = options.capacity ?? 32;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1024) {
    throw new Error('Invalid checkpoint queue capacity');
  }
  const pending = new Map<string, ContinuityState>();
  let scheduled = false;
  let running: Promise<void> | null = null;
  let closed = false;

  const flush = async () => {
    while (pending.size) {
      const first = pending.entries().next().value as [string, ContinuityState];
      pending.delete(first[0]);
      try {
        await saveCheckpoint(query, first[1], new Date().toISOString());
      } catch {
        options.onFailure?.('checkpoint_write_failed');
      }
    }
  };

  const start = () => {
    scheduled = false;
    if (running) return;
    running = flush().finally(() => {
      running = null;
      if (pending.size) enqueue();
    });
  };

  const enqueue = () => {
    if (!scheduled && !running) {
      scheduled = true;
      setImmediate(start);
    }
  };

  return {
    schedule(state) {
      if (!options.enabled || closed) return false;
      if (!pending.has(state.conversationId) && pending.size >= capacity) {
        options.onFailure?.('checkpoint_queue_full');
        return false;
      }
      pending.set(state.conversationId, structuredClone(state));
      enqueue();
      return true;
    },
    async drain() {
      while (scheduled || running || pending.size) {
        if (scheduled && !running) start();
        if (running) await running;
      }
    },
    async close() {
      closed = true;
      await this.drain();
    },
  };
}
