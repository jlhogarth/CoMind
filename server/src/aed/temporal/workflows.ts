import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from './activities.js';
import {
  isSemanticallyStalled,
  projectLaneResult,
  type ExternalWake,
  type LaneTransition,
  type LaneWorkflowInput,
  type LaneWorkflowResult,
  type WakeCause,
} from './contracts.js';

export const externalWakeSignal = defineSignal<[ExternalWake]>('aed003ExternalWake');

const {
  recordTransition,
  observeHeartbeat,
  recoverLane,
  verifyRecovery,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: 10_000,
  heartbeatTimeout: 1_000,
  retry: {
    maximumAttempts: 3,
    initialInterval: 100,
    maximumInterval: 500,
  },
});

export async function aed003LaneController(
  input: LaneWorkflowInput
): Promise<LaneWorkflowResult> {
  let externalWake: ExternalWake | null = null;
  let sequence = 0;
  const transitions: LaneTransition[] = [];
  let lastObservedAt = input.lastObservedAt;
  let lastProgressAt = input.lastProgressAt;

  setHandler(externalWakeSignal, (wake) => {
    externalWake = wake;
  });

  const externalWakeReason = (): string => externalWake?.reason ?? 'external event received';

  const addTransition = async (
    type: LaneTransition['type'],
    detail: string,
    wakeCause: WakeCause | null = null,
    at = new Date(Date.now()).toISOString()
  ): Promise<void> => {
    sequence += 1;
    const transition: LaneTransition = {
      sequence,
      type,
      at,
      wakeCause,
      semanticProgressAt: lastProgressAt,
      observedAt: lastObservedAt,
      detail,
    };
    transitions.push(transition);
    await recordTransition(transition);
  };

  await addTransition(
    'waiting',
    `event preferred with adaptive durable fallback of ${input.wakeDelayMs}ms`
  );

  const eventArrived = await condition(() => externalWake !== null, input.wakeDelayMs);
  const wakeCause: WakeCause = eventArrived ? 'event' : 'durable_timer';
  await addTransition(
    'wake',
    eventArrived
      ? `external event: ${externalWakeReason()}`
      : 'adaptive durable timer elapsed',
    wakeCause
  );

  const heartbeatObservation = await observeHeartbeat({
    laneId: input.laneId,
    semanticProgressAt: lastProgressAt,
    heartbeatCount: 3,
    heartbeatIntervalMs: 75,
  });
  lastObservedAt = heartbeatObservation.observedAt;
  await addTransition(
    'heartbeat_observed',
    `${heartbeatObservation.heartbeatCount} activity heartbeats observed without semantic progress`,
    wakeCause
  );

  const stalled = isSemanticallyStalled({
    lastProgressAt,
    nowMs: Date.now(),
    stallThresholdMs: input.stallThresholdMs,
  });

  if (!stalled) {
    await addTransition('healthy', 'semantic progress remains within the stall threshold', wakeCause);
    const result: LaneWorkflowResult = {
      laneId: input.laneId,
      outcome: 'healthy',
      wakeCause,
      initialProgressAt: input.lastProgressAt,
      finalProgressAt: lastProgressAt,
      finalObservedAt: lastObservedAt,
      escalation: null,
      timingModel: input.timingModel,
      transitions,
    };
    projectLaneResult(result);
    return result;
  }

  await addTransition(
    'diagnosed_stall',
    'semantic progress exceeded the governed stall threshold despite activity heartbeats',
    wakeCause
  );

  if (!input.clearAuthorized) {
    await addTransition(
      'escalated',
      'CLEAR_REQUIRED: recovery mutation not authorized',
      wakeCause
    );
    const result: LaneWorkflowResult = {
      laneId: input.laneId,
      outcome: 'escalated',
      wakeCause,
      initialProgressAt: input.lastProgressAt,
      finalProgressAt: lastProgressAt,
      finalObservedAt: lastObservedAt,
      escalation: 'CLEAR_REQUIRED',
      timingModel: input.timingModel,
      transitions,
    };
    projectLaneResult(result);
    return result;
  }

  await addTransition('clear_authorized', 'CLEAR authorizes bounded Test recovery', wakeCause);
  const recovery = await recoverLane({
    laneId: input.laneId,
    clearAuthorized: input.clearAuthorized,
    priorProgressAt: lastProgressAt,
  });
  lastProgressAt = recovery.semanticProgressAt;
  await addTransition(
    'recovery_mutation',
    'bounded Test recovery mutation completed',
    wakeCause,
    recovery.recoveredAt
  );

  const verification = await verifyRecovery({
    priorProgressAt: input.lastProgressAt,
    recoveredProgressAt: lastProgressAt,
  });
  await addTransition(
    'recovery_verified',
    'semantic progress advanced after recovery',
    wakeCause,
    verification.verifiedAt
  );

  const result: LaneWorkflowResult = {
    laneId: input.laneId,
    outcome: 'recovered',
    wakeCause,
    initialProgressAt: input.lastProgressAt,
    finalProgressAt: lastProgressAt,
    finalObservedAt: lastObservedAt,
    escalation: null,
    timingModel: input.timingModel,
    transitions,
  };
  projectLaneResult(result);
  return result;
}
