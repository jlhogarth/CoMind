const LIVENESS = Object.freeze({
  ACTIVE: 'ACTIVE',
  WAITING: 'WAITING',
  BLOCKED: 'BLOCKED',
  STALLED: 'STALLED',
  ABANDONED: 'ABANDONED',
  ESCALATED: 'ESCALATED'
});

const AED_LEVEL = Object.freeze({
  MONITOR: 'AED-0',
  NUDGE: 'AED-1',
  RECOVER: 'AED-2',
  RESUSCITATE: 'AED-3',
  ESCALATE: 'AED-4'
});

const NON_PROGRESS_TYPES = new Set([
  'controller_heartbeat',
  'poll',
  'state_readback',
  'conversation_activity',
  'idle_status_rewrite',
  'unverified_recovery_attempt'
]);

const PROGRESS_TYPES = new Set([
  'implementation_commit',
  'required_evidence_commit',
  'pr_transition',
  'acceptance_ci_advance',
  'evidence_backed_lifecycle_transition',
  'dependency_completed',
  'required_artifact_created',
  'authorized_mutation_verified',
  'acceptance_proof_verified',
  'bounded_wait_entered'
]);

function isProgressEvent(event) {
  if (!event || typeof event.type !== 'string') return false;
  if (NON_PROGRESS_TYPES.has(event.type)) return false;
  return PROGRESS_TYPES.has(event.type) && event.verified === true;
}

function latestProgressAt(events) {
  const progress = (events || [])
    .filter(isProgressEvent)
    .map((event) => Date.parse(event.at))
    .filter(Number.isFinite);
  return progress.length ? new Date(Math.max(...progress)).toISOString() : null;
}

function requireBoundedReason(lane, state) {
  if (state === LIVENESS.WAITING && !lane.wakeCondition) {
    return { state: LIVENESS.STALLED, level: AED_LEVEL.NUDGE, reason: 'WAITING lacks a concrete wake condition' };
  }
  if (state === LIVENESS.BLOCKED && (!lane.blocker || !lane.blockerOwner)) {
    return { state: LIVENESS.STALLED, level: AED_LEVEL.NUDGE, reason: 'BLOCKED lacks named blocker or responsible owner' };
  }
  return null;
}

function classifyLane(lane, now = new Date()) {
  if (!lane || lane.terminal === true) {
    return { state: null, level: AED_LEVEL.MONITOR, reason: 'terminal or absent lane' };
  }
  if (lane.mandatoryStop === true) {
    return { state: LIVENESS.ESCALATED, level: AED_LEVEL.ESCALATE, reason: lane.stopReason || 'mandatory stop boundary' };
  }
  if (lane.waiting === true) {
    return requireBoundedReason(lane, LIVENESS.WAITING) || { state: LIVENESS.WAITING, level: AED_LEVEL.MONITOR, reason: 'bounded wait' };
  }
  if (lane.blocked === true) {
    return requireBoundedReason(lane, LIVENESS.BLOCKED) || { state: LIVENESS.BLOCKED, level: AED_LEVEL.MONITOR, reason: 'named dependency block' };
  }

  const progressAt = latestProgressAt(lane.events);
  const deadline = lane.expectedProgressBy ? Date.parse(lane.expectedProgressBy) : NaN;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  if (Number.isFinite(deadline) && nowMs > deadline) {
    return {
      state: LIVENESS.STALLED,
      level: AED_LEVEL.RECOVER,
      reason: 'expected progress deadline passed without a bounded wait/block',
      lastProgressAt: progressAt
    };
  }

  if (!lane.owner && lane.actionable === true) {
    return { state: LIVENESS.ABANDONED, level: AED_LEVEL.RECOVER, reason: 'actionable lane has no owner or lease', lastProgressAt: progressAt };
  }

  return { state: LIVENESS.ACTIVE, level: AED_LEVEL.MONITOR, reason: 'within expected progress window', lastProgressAt: progressAt };
}

function clearForShock(input) {
  const requiredTrue = ['l4aAuthorized', 'oneIssueOneBranchOnePr', 'noPlaceholder', 'collisionClear', 'freshnessClear', 'dependencyValid', 'costGuardrailClear'];
  const failed = requiredTrue.filter((key) => input[key] !== true);
  if (input.productionChange === true && input.productionAuthorized !== true) failed.push('productionAuthorized');
  if (input.secretsPresent === true) failed.push('secretsPresent');
  return { clear: failed.length === 0, failed };
}

export {
  LIVENESS,
  AED_LEVEL,
  NON_PROGRESS_TYPES,
  PROGRESS_TYPES,
  isProgressEvent,
  latestProgressAt,
  classifyLane,
  clearForShock,
};
