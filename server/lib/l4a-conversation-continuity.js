const CONTINUITY_STATUS = Object.freeze({
  RECOVERY_INCOMPLETE: 'RECOVERY_INCOMPLETE',
  ORIGINAL_RETURN_PENDING: 'ORIGINAL_RETURN_PENDING',
  ORIGINAL_ACTIVE: 'ORIGINAL_ACTIVE',
  SUCCESSOR_REQUIRED: 'SUCCESSOR_REQUIRED',
  SUCCESSOR_PENDING: 'SUCCESSOR_PENDING',
  SUCCESSOR_ACTIVE: 'SUCCESSOR_ACTIVE',
  CONTINUITY_BLOCKED: 'CONTINUITY_BLOCKED',
});

const CONTINUITY_REASON_EXPLANATIONS = Object.freeze({
  semantic_progress_unverified: 'Recovery has not yet been proven by a new accepted semantic progress event.',
  original_return_pending: 'The canonical originating conversation return is still in progress.',
  original_returned: 'The canonical originating conversation resumed successfully.',
  continuity_state_insufficient: 'Authoritative durable state is insufficient to reconstruct the lane safely in a successor conversation.',
  successor_actuator_unavailable: 'The original conversation could not be resumed and no governed successor-conversation actuator is currently available.',
  successor_required: 'The original conversation did not resume, but authoritative durable state is sufficient for successor reconstruction.',
  successor_creation_failed: 'The governed successor-conversation actuator failed before a successor conversation could be verified.',
  successor_active: 'A successor conversation was created, reconstructed from authoritative durable state, and response generation was observed.',
});

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function explainContinuityReason(reason) {
  const code = nonEmpty(reason) ? reason : 'continuity_state_insufficient';
  return CONTINUITY_REASON_EXPLANATIONS[code] || `Conversation continuity requires attention: ${code}.`;
}

function returnStatus(outcome = {}) {
  return outcome.status || outcome.returnStatus || outcome.recoveryStatus || null;
}

function continuityVerified(state = {}) {
  const verified = state.verified === true || state.continuityVerified === true || state.continuity_verified === true;
  return verified
    && nonEmpty(state.workKey || state.work_key)
    && nonEmpty(state.nextAction || state.next_action)
    && nonEmpty(state.verifiedCheckpoint || state.verified_checkpoint);
}

function buildSuccessorCapsule(recovery = {}, state = {}) {
  return Object.freeze({
    continuityId: recovery.recoveryId || recovery.recovery_id || state.continuityId || state.continuity_id || null,
    laneId: state.laneId || state.lane_id || state.workKey || state.work_key || null,
    workKey: state.workKey || state.work_key || recovery.workKey || recovery.work_key || null,
    verifiedCheckpoint: state.verifiedCheckpoint || state.verified_checkpoint || recovery.verifiedState || recovery.verified_state || null,
    nextAction: state.nextAction || state.next_action || recovery.nextAction || recovery.next_action || null,
    authorityRef: state.authorityRef || state.authority_ref || recovery.authorityRef || recovery.authority_ref || null,
    issue: state.issue || recovery.issue || null,
    branch: state.branch || recovery.branch || null,
    pullRequest: state.pullRequest || state.pull_request || recovery.pullRequest || recovery.pull_request || null,
    headSha: state.headSha || state.head_sha || recovery.headSha || recovery.head_sha || null,
    predecessorRefSha256: state.predecessorRefSha256 || state.predecessor_ref_sha256 || null,
    provenanceRefs: Array.isArray(state.provenanceRefs || state.provenance_refs)
      ? Object.freeze([...(state.provenanceRefs || state.provenance_refs)])
      : Object.freeze([]),
  });
}

function planConversationContinuity(input = {}) {
  const recovery = input.recovery || {};
  const semanticProgressVerified = recovery.semanticProgressVerified === true
    || recovery.semantic_progress_verified === true;
  const workKey = recovery.workKey || recovery.work_key || input.continuityState?.workKey || input.continuity_state?.work_key || null;

  if (!semanticProgressVerified) {
    return Object.freeze({
      status: CONTINUITY_STATUS.RECOVERY_INCOMPLETE,
      workKey,
      reason: 'semantic_progress_unverified',
      why: explainContinuityReason('semantic_progress_unverified'),
      recoveryOwnershipReleased: false,
      controllerMayContinueRecovery: true,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: false,
      activeConversationMode: null,
    });
  }

  const originalOutcome = input.originalReturnOutcome || input.original_return_outcome || {};
  const originalStatus = returnStatus(originalOutcome);

  if (originalStatus === 'RETURNED') {
    return Object.freeze({
      status: CONTINUITY_STATUS.ORIGINAL_ACTIVE,
      workKey,
      reason: 'original_returned',
      why: explainContinuityReason('original_returned'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: false,
      activeConversationMode: 'original',
      predecessorSuperseded: false,
    });
  }

  if (originalStatus === 'RETURN_PENDING') {
    return Object.freeze({
      status: CONTINUITY_STATUS.ORIGINAL_RETURN_PENDING,
      workKey,
      reason: 'original_return_pending',
      why: explainContinuityReason('original_return_pending'),
      recoveryOwnershipReleased: false,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: true,
      activeConversationMode: null,
    });
  }

  const state = input.continuityState || input.continuity_state || {};
  if (!continuityVerified(state)) {
    return Object.freeze({
      status: CONTINUITY_STATUS.CONTINUITY_BLOCKED,
      workKey,
      reason: 'continuity_state_insufficient',
      why: explainContinuityReason('continuity_state_insufficient'),
      recoveryOwnershipReleased: false,
      controllerMayContinueRecovery: true,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: false,
      activeConversationMode: null,
    });
  }

  const capsule = buildSuccessorCapsule(recovery, state);
  const successorActuatorAvailable = input.successorActuatorAvailable === true
    || input.successor_actuator_available === true;

  if (!successorActuatorAvailable) {
    return Object.freeze({
      status: CONTINUITY_STATUS.SUCCESSOR_REQUIRED,
      workKey,
      reason: 'successor_actuator_unavailable',
      why: explainContinuityReason('successor_actuator_unavailable'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: true,
      activeConversationMode: null,
      successorRequired: true,
      capsule,
    });
  }

  return Object.freeze({
    status: CONTINUITY_STATUS.SUCCESSOR_PENDING,
    workKey,
    reason: 'successor_required',
    why: explainContinuityReason('successor_required'),
    recoveryOwnershipReleased: false,
    controllerMayContinueRecovery: false,
    controllerMayContinueImplementation: false,
    controllerMayRetryContinuity: true,
    activeConversationMode: null,
    successorRequired: true,
    capsule,
  });
}

function finalizeSuccessorContinuity(plan, successorResult = {}) {
  if (!plan || plan.status !== CONTINUITY_STATUS.SUCCESSOR_PENDING) return plan;

  if (successorResult.status === 'succeeded' && nonEmpty(successorResult.successorConversationUrl)) {
    return Object.freeze({
      ...plan,
      status: CONTINUITY_STATUS.SUCCESSOR_ACTIVE,
      reason: successorResult.reason || 'successor_active',
      why: explainContinuityReason('successor_active'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryContinuity: false,
      activeConversationMode: 'successor',
      successorRequired: false,
      predecessorSuperseded: true,
      successorConversationUrl: successorResult.successorConversationUrl,
    });
  }

  const reason = successorResult.reason || 'successor_creation_failed';
  return Object.freeze({
    ...plan,
    status: successorResult.recoverable === false
      ? CONTINUITY_STATUS.CONTINUITY_BLOCKED
      : CONTINUITY_STATUS.SUCCESSOR_REQUIRED,
    reason,
    why: CONTINUITY_REASON_EXPLANATIONS[reason] || explainContinuityReason('successor_creation_failed'),
    recoveryOwnershipReleased: true,
    controllerMayContinueRecovery: false,
    controllerMayContinueImplementation: false,
    controllerMayRetryContinuity: successorResult.recoverable !== false,
    activeConversationMode: null,
    successorRequired: successorResult.recoverable !== false,
    predecessorSuperseded: false,
  });
}

function founderVisibleContinuityReport(outcome = {}) {
  return Object.freeze({
    workKey: outcome.workKey || null,
    continuityStatus: outcome.status || null,
    laneContinuityRestored: [CONTINUITY_STATUS.ORIGINAL_ACTIVE, CONTINUITY_STATUS.SUCCESSOR_ACTIVE].includes(outcome.status),
    activeConversationMode: outcome.activeConversationMode || null,
    successorRequired: outcome.successorRequired === true,
    predecessorSuperseded: outcome.predecessorSuperseded === true,
    continuityReason: outcome.reason || null,
    continuityWhy: outcome.why || null,
    recoveryOwnershipReleased: outcome.recoveryOwnershipReleased === true,
    controllerMayContinueImplementation: outcome.controllerMayContinueImplementation === true,
    controllerMayRetryContinuity: outcome.controllerMayRetryContinuity === true,
  });
}

export {
  CONTINUITY_STATUS,
  CONTINUITY_REASON_EXPLANATIONS,
  explainContinuityReason,
  planConversationContinuity,
  finalizeSuccessorContinuity,
  founderVisibleContinuityReport,
};
