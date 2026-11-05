import { condition, defineQuery, defineSignal, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type {
  AedExternalWake,
  AedTemporalWorkflowInput,
  AedTemporalWorkflowResult,
} from './contracts.js';
import type {
  AedRecoveryProjection,
  AedRecoveryWorkflowInput,
  AedRecoveryWorkflowResult,
} from './recovery-contracts.js';

const { heartbeatProbe } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15s',
  heartbeatTimeout: '2s',
  retry: { maximumAttempts: 1 },
});

const { assessRecovery, executeFencedRecovery, verifyRecoveryProgress } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20s',
  retry: { maximumAttempts: 1 },
});

const { observeLiveTestProgress, continueLiveTestWorkload } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10s', retry: { maximumAttempts: 1 },
});

export const liveAcceptanceStatusQuery = defineQuery<{
  healthyObservations: number; recoveryTriggered: boolean; lastProgressAt: string | null;
}>('liveAcceptanceStatus');

export async function aedLiveAcceptanceWorkflow(input: {
  sourceRef: string; taskId: string; controller: string;
  observationIntervalMs: number; stallThresholdMs: number;
  safety: AedRecoveryWorkflowInput['safety'];
}): Promise<{ outcome: string; healthyObservations: number; lastProgressAt: string; continuedAt: string }> {
  if (input.observationIntervalMs < 10 || input.stallThresholdMs <= input.observationIntervalMs)
    throw new Error('invalid measured liveness timing');
  let healthyObservations = 0;
  let recoveryTriggered = false;
  let lastProgressAt: string | null = null;
  setHandler(liveAcceptanceStatusQuery, () => ({ healthyObservations, recoveryTriggered, lastProgressAt }));
  for (;;) {
    const observed = await observeLiveTestProgress({ sourceRef: input.sourceRef });
    if (observed && (!lastProgressAt || observed > lastProgressAt)) lastProgressAt = observed;
    const now = Date.now();
    if (lastProgressAt && now - Date.parse(lastProgressAt) >= input.stallThresholdMs) {
      recoveryTriggered = true;
      const recovered = await aedRecoveryWorkflow({
        caseId: input.sourceRef, taskId: input.taskId, controller: input.controller,
        now: new Date(now).toISOString(), recoveryProgressAt: new Date(now + 1).toISOString(),
        mode: 'recover', safety: input.safety,
        lane: { workKey: input.sourceRef, status: 'in_progress', actionable: true,
          dependenciesValid: true, expectedProgressBy: new Date(Date.parse(lastProgressAt) + input.stallThresholdMs).toISOString(),
          nextAction: 'resume bounded synthetic Test task',
          events: [{ type: 'implementation_commit', at: lastProgressAt, verified: true }],
          productionChange: false, josephActionRequired: false },
      });
      if (recovered.outcome !== 'RECOVERED' || recovered.verification?.advanced !== true)
        throw new Error('AED recovery did not verify semantic progress');
      const continuedAt = await continueLiveTestWorkload({ sourceRef: input.sourceRef, taskId: input.taskId });
      return { outcome: recovered.outcome, healthyObservations, lastProgressAt, continuedAt };
    }
    if (lastProgressAt) healthyObservations += 1;
    await sleep(input.observationIntervalMs);
  }
}

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

function recoveryProjection(input: {
  workflow: AedRecoveryWorkflowInput;
  liveness: string | null;
  aedLevel: string;
  diagnosis: string;
  fencingEpoch: number | null;
  lastProgressAt: string | null;
  intervention: string | null;
  verification: AedRecoveryProjection['verification'];
  outcome: AedRecoveryProjection['outcome'];
  escalationReason: string | null;
}): AedRecoveryProjection {
  return {
    caseId: input.workflow.caseId,
    workKey: input.workflow.lane.workKey,
    liveness: input.liveness,
    aedLevel: input.aedLevel,
    controller: input.workflow.controller,
    taskId: input.workflow.taskId,
    fencingEpoch: input.fencingEpoch,
    lastObservedAt: input.workflow.now,
    lastProgressAt: input.lastProgressAt,
    diagnosis: input.diagnosis,
    intervention: input.intervention,
    verification: input.verification,
    outcome: input.outcome,
    escalationReason: input.escalationReason,
    josephActionRequired: input.workflow.lane.josephActionRequired === true,
    productionChange: input.workflow.lane.productionChange === true,
  };
}

export async function aedRecoveryWorkflow(
  input: AedRecoveryWorkflowInput
): Promise<AedRecoveryWorkflowResult> {
  const assessment = await assessRecovery({
    lane: input.lane,
    safety: input.safety,
    controller: input.controller,
    now: input.now,
  });

  if (assessment.action !== 'RECOVER') {
    const reason = assessment.failedSafety.length
      ? `CLEAR failed: ${assessment.failedSafety.join(',')}`
      : assessment.reason ?? assessment.diagnosis;
    return {
      outcome: 'ESCALATED_OR_HOLD',
      assessment,
      shock: null,
      verification: null,
      projection: recoveryProjection({
        workflow: input,
        liveness: assessment.liveness,
        aedLevel: assessment.aedLevel,
        diagnosis: assessment.diagnosis,
        fencingEpoch: null,
        lastProgressAt: assessment.lastProgressAt,
        intervention: null,
        verification: 'not_attempted',
        outcome: 'ESCALATED_OR_HOLD',
        escalationReason: reason,
      }),
    };
  }

  const shock = await executeFencedRecovery({
    taskId: input.taskId,
    workerInstanceId: input.controller,
    progressAt: input.recoveryProgressAt,
    mode: input.mode,
  });
  if (shock.status !== 'recovered'
      || shock.mutationApplied !== true
      || shock.leaseCompleted !== true
      || !shock.progressEvent) {
    return {
      outcome: 'ESCALATED_OR_HOLD',
      assessment,
      shock,
      verification: null,
      projection: recoveryProjection({
        workflow: input,
        liveness: assessment.liveness,
        aedLevel: assessment.aedLevel,
        diagnosis: assessment.diagnosis,
        fencingEpoch: shock.currentFencingEpoch ?? shock.fencingEpoch,
        lastProgressAt: assessment.lastProgressAt,
        intervention: assessment.nextAction,
        verification: 'not_attempted',
        outcome: 'ESCALATED_OR_HOLD',
        escalationReason: shock.reason,
      }),
    };
  }

  const verification = await verifyRecoveryProgress({
    before: input.lane,
    progressEvent: shock.progressEvent,
  });
  if (!verification.advanced) {
    return {
      outcome: 'ESCALATED_OR_HOLD',
      assessment,
      shock,
      verification,
      projection: recoveryProjection({
        workflow: input,
        liveness: assessment.liveness,
        aedLevel: assessment.aedLevel,
        diagnosis: assessment.diagnosis,
        fencingEpoch: shock.fencingEpoch,
        lastProgressAt: verification.afterAt,
        intervention: assessment.nextAction,
        verification: 'not_advanced',
        outcome: 'ESCALATED_OR_HOLD',
        escalationReason: 'recovery mutation did not advance semantic progress',
      }),
    };
  }

  return {
    outcome: 'RECOVERED',
    assessment,
    shock,
    verification,
    projection: recoveryProjection({
      workflow: input,
      liveness: assessment.liveness,
      aedLevel: assessment.aedLevel,
      diagnosis: assessment.diagnosis,
      fencingEpoch: shock.fencingEpoch,
      lastProgressAt: verification.afterAt,
      intervention: assessment.nextAction,
      verification: 'advanced',
      outcome: 'RECOVERED',
      escalationReason: null,
    }),
  };
}
