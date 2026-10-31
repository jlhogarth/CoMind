import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type {
  AedExternalWake,
  AedTemporalWorkflowInput,
  AedTemporalWorkflowResult,
} from './contracts.js';

const { heartbeatProbe } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15s',
  heartbeatTimeout: '2s',
  retry: { maximumAttempts: 1 },
});

export const externalWakeSignal = defineSignal<[AedExternalWake]>('externalWake');
export const aedStatusQuery = defineQuery<{
  waiting: boolean;
  externalWakeReceived: boolean;
  semanticLastProgressAt: string;
}>('aedStatus');

export async function aedLivenessWorkflow(input: AedTemporalWorkflowInput): Promise<AedTemporalWorkflowResult> {
  let externalWake: AedExternalWake | undefined;
  let waiting = true;

  setHandler(externalWakeSignal, (event) => {
    externalWake = event;
  });
  setHandler(aedStatusQuery, () => ({
    waiting,
    externalWakeReceived: externalWake !== undefined,
    semanticLastProgressAt: input.semanticLastProgressAt,
  }));

  const fallbackDelayMs = Math.max(1, Math.trunc(input.plan.delayMs));
  const eventWon = await condition(() => externalWake !== undefined, fallbackDelayMs);
  waiting = false;

  const heartbeat = await heartbeatProbe({
    laneId: input.laneId,
    semanticLastProgressAt: input.semanticLastProgressAt,
    iterations: input.heartbeatProbeIterations ?? 3,
    intervalMs: input.heartbeatProbeIntervalMs ?? 25,
  });

  return {
    laneId: input.laneId,
    lifecycleState: input.lifecycleState,
    wakeSource: eventWon ? 'event' : 'durable_timer',
    externalWake: externalWake ?? null,
    semanticLastProgressAt: input.semanticLastProgressAt,
    heartbeat,
    plan: input.plan,
  };
}
