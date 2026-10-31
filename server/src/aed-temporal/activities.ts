import { heartbeat } from '@temporalio/activity';
import type { AedHeartbeatProbeInput, AedHeartbeatProbeResult } from './contracts.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function heartbeatProbe(input: AedHeartbeatProbeInput): Promise<AedHeartbeatProbeResult> {
  const iterations = Math.max(1, Math.min(20, Math.trunc(input.iterations)));
  const intervalMs = Math.max(0, Math.min(5_000, Math.trunc(input.intervalMs)));
  let lastObservedAt = new Date().toISOString();

  for (let sequence = 1; sequence <= iterations; sequence += 1) {
    lastObservedAt = new Date().toISOString();
    heartbeat({
      laneId: input.laneId,
      sequence,
      lastObservedAt,
      semanticLastProgressAt: input.semanticLastProgressAt,
    });
    if (sequence < iterations && intervalMs > 0) await sleep(intervalMs);
  }

  return {
    heartbeatCount: iterations,
    semanticLastProgressAt: input.semanticLastProgressAt,
    lastObservedAt,
    semanticProgressMutated: false,
  };
}
