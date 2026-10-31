export type WakeCause = 'event' | 'durable_timer';
export type LaneOutcome = 'healthy' | 'recovered' | 'escalated';
export type TransitionType =
  | 'waiting'
  | 'wake'
  | 'heartbeat_observed'
  | 'diagnosed_stall'
  | 'healthy'
  | 'clear_authorized'
  | 'recovery_mutation'
  | 'recovery_verified'
  | 'escalated';

export type TimingModelEvidence = {
  source: string;
  samples: number;
  p50: number;
  p90: number;
  p95: number;
  delayMs: number;
  band: string;
};

export type LaneWorkflowInput = {
  laneId: string;
  lastProgressAt: string;
  lastObservedAt: string;
  stallThresholdMs: number;
  wakeDelayMs: number;
  clearAuthorized: boolean;
  timingModel: TimingModelEvidence;
};

export type ExternalWake = {
  at: string;
  reason: string;
};

export type LaneTransition = {
  sequence: number;
  type: TransitionType;
  at: string;
  wakeCause: WakeCause | null;
  semanticProgressAt: string;
  observedAt: string | null;
  detail: string;
};

export type HeartbeatObservation = {
  observedAt: string;
  heartbeatCount: number;
};

export type RecoveryResult = {
  recoveredAt: string;
  semanticProgressAt: string;
};

export type LaneWorkflowResult = {
  laneId: string;
  outcome: LaneOutcome;
  wakeCause: WakeCause;
  initialProgressAt: string;
  finalProgressAt: string;
  finalObservedAt: string;
  escalation: string | null;
  timingModel: TimingModelEvidence;
  transitions: LaneTransition[];
};

export type OperatorLaneProjection = {
  laneId: string;
  status: LaneOutcome;
  wakeCause: WakeCause;
  lastProgressAt: string;
  lastObservedAt: string;
  escalation: string | null;
  timingSource: string;
  transitionCount: number;
  causality: Array<{
    sequence: number;
    type: TransitionType;
    at: string;
    detail: string;
  }>;
};

export function isSemanticallyStalled(input: {
  lastProgressAt: string;
  nowMs: number;
  stallThresholdMs: number;
}): boolean {
  const lastProgressMs = Date.parse(input.lastProgressAt);
  if (!Number.isFinite(lastProgressMs)) {
    throw new Error('lastProgressAt must be a valid timestamp');
  }
  if (!Number.isFinite(input.nowMs)) {
    throw new Error('nowMs must be finite');
  }
  if (!Number.isFinite(input.stallThresholdMs) || input.stallThresholdMs <= 0) {
    throw new Error('stallThresholdMs must be positive');
  }
  return input.nowMs - lastProgressMs >= input.stallThresholdMs;
}

export function assertRecoveryAuthorized(clearAuthorized: boolean): void {
  if (!clearAuthorized) {
    throw new Error('CLEAR_REQUIRED');
  }
}

export function projectLaneResult(result: LaneWorkflowResult): OperatorLaneProjection {
  return {
    laneId: result.laneId,
    status: result.outcome,
    wakeCause: result.wakeCause,
    lastProgressAt: result.finalProgressAt,
    lastObservedAt: result.finalObservedAt,
    escalation: result.escalation,
    timingSource: result.timingModel.source,
    transitionCount: result.transitions.length,
    causality: result.transitions.map((transition) => ({
      sequence: transition.sequence,
      type: transition.type,
      at: transition.at,
      detail: transition.detail,
    })),
  };
}
