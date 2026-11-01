const RETURN_STATUS = Object.freeze({
  RECOVERY_INCOMPLETE: 'RECOVERY_INCOMPLETE',
  RETURN_PENDING: 'RETURN_PENDING',
  RETURNED: 'RETURNED',
  RETURN_FAILED: 'RETURN_FAILED',
  RETURN_UNAVAILABLE: 'RETURN_UNAVAILABLE',
});

const RETURN_REASON_EXPLANATIONS = Object.freeze({
  semantic_progress_unverified: 'Recovery has not yet been proven by a new accepted semantic progress event.',
  conversation_binding_missing: 'No canonical originating-conversation binding exists for this lane.',
  conversation_binding_inactive: 'The canonical originating-conversation binding exists but is not active.',
  conversation_binding_invalid: 'The canonical originating-conversation binding does not contain a usable stable ChatGPT conversation reference.',
  conversation_actuator_unavailable: 'No governed conversation-return actuator is currently available for the registered execution surface.',
  clear_required: 'The return action was not authorized by the required CLEAR decision.',
  missing_lease_reference: 'The return action lacks the canonical lease reference required to prevent duplicate or stale delivery.',
  invalid_lease_reference: 'The canonical lease reference is malformed or invalid.',
  lease_verification_failed: 'The canonical lease could not be verified at return time.',
  fencing_epoch_mismatch: 'The return attempt presented a stale fencing epoch and was rejected.',
  lease_expired: 'The canonical recovery lease expired before the return could be verified.',
  invalid_registered_conversation: 'The registered conversation reference is not a supported stable ChatGPT conversation URL.',
  invalid_target_conversation: 'The requested return target is not a supported stable ChatGPT conversation URL.',
  conversation_binding_mismatch: 'The requested conversation does not match the canonical registered conversation for this lane.',
  conversation_identity_mismatch: 'The browser reached a different conversation than the canonical registered conversation.',
  authentication_required: 'The governed browser profile is not currently authenticated to ChatGPT.',
  browser_start_failed: 'The governed browser actuator could not start.',
  browser_timeout: 'The governed browser actuator timed out before return verification completed.',
  browser_interrupted: 'The governed browser actuator was interrupted before return verification completed.',
  composer_not_found: 'The registered conversation opened, but a usable ChatGPT composer could not be verified.',
  handoff_not_observed: 'The recovery handoff was submitted but could not be verified in the originating conversation.',
  response_not_observed: 'The handoff appeared in the originating conversation, but resumed ChatGPT response generation was not observed.',
  handoff_verification_failed: 'The handoff could not be fully verified as posted and resumed in the originating conversation.',
  browser_observation_missing: 'The browser actuator returned without the observation required to verify conversation return.',
  browser_cleanup_failed: 'The return action completed incompletely because the browser execution boundary could not be closed cleanly.',
  invalid_handoff: 'The bounded recovery handoff is incomplete or malformed.',
  handoff_too_large: 'The bounded recovery handoff exceeds the configured safe message size.',
  return_execution_failed: 'The governed conversation-return actuator failed without a more specific reason.',
});

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function explainReturnReason(reason) {
  const code = nonEmpty(reason) ? reason : 'return_execution_failed';
  return RETURN_REASON_EXPLANATIONS[code] || `Conversation return failed with explicit reason code: ${code}.`;
}

function stableConversationRef(binding = {}) {
  return binding.registeredConversationUrl
    || binding.registered_conversation_url
    || binding.conversationUrl
    || binding.conversation_url
    || binding.externalRef
    || binding.external_ref
    || null;
}

function planRepairReturn(input = {}) {
  const recovery = input.recovery || {};
  const binding = input.conversationBinding || input.conversation_binding || null;
  const workKey = recovery.workKey || recovery.work_key || null;
  const semanticProgressVerified = recovery.semanticProgressVerified === true
    || recovery.semantic_progress_verified === true;

  if (!semanticProgressVerified) {
    return {
      status: RETURN_STATUS.RECOVERY_INCOMPLETE,
      workKey,
      reason: 'semantic_progress_unverified',
      why: explainReturnReason('semantic_progress_unverified'),
      recoveryOwnershipReleased: false,
      controllerMayContinueRecovery: true,
      controllerMayContinueImplementation: false,
      conversationReturnRequired: false,
    };
  }

  if (!binding) {
    return {
      status: RETURN_STATUS.RETURN_UNAVAILABLE,
      workKey,
      reason: 'conversation_binding_missing',
      why: explainReturnReason('conversation_binding_missing'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryReturn: false,
      conversationReturnRequired: true,
    };
  }

  if (binding.active === false) {
    return {
      status: RETURN_STATUS.RETURN_UNAVAILABLE,
      workKey,
      reason: 'conversation_binding_inactive',
      why: explainReturnReason('conversation_binding_inactive'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryReturn: false,
      conversationReturnRequired: true,
    };
  }

  const conversationRef = stableConversationRef(binding);
  if (!nonEmpty(conversationRef)) {
    return {
      status: RETURN_STATUS.RETURN_UNAVAILABLE,
      workKey,
      reason: 'conversation_binding_invalid',
      why: explainReturnReason('conversation_binding_invalid'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryReturn: false,
      conversationReturnRequired: true,
    };
  }

  const actuatorAvailable = input.conversationActuatorAvailable === true
    || input.conversation_actuator_available === true;
  if (!actuatorAvailable) {
    return {
      status: RETURN_STATUS.RETURN_UNAVAILABLE,
      workKey,
      reason: 'conversation_actuator_unavailable',
      why: explainReturnReason('conversation_actuator_unavailable'),
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryReturn: true,
      conversationReturnRequired: true,
    };
  }

  return {
    status: RETURN_STATUS.RETURN_PENDING,
    workKey,
    reason: 'conversation_return_required',
    why: 'Recovery is verified and must now be returned to the canonical originating conversation.',
    recoveryOwnershipReleased: false,
    controllerMayContinueRecovery: false,
    controllerMayContinueImplementation: false,
    controllerMayRetryReturn: true,
    conversationReturnRequired: true,
    conversationRef,
    handoff: {
      recoveryId: recovery.recoveryId || recovery.recovery_id || null,
      workKey,
      reasonCode: recovery.reasonCode || recovery.reason_code || 'aed_recovery',
      repairSummary: recovery.repairSummary || recovery.repair_summary || null,
      verifiedState: recovery.verifiedState || recovery.verified_state || null,
      nextAction: recovery.nextAction || recovery.next_action || null,
      issue: recovery.issue || null,
      branch: recovery.branch || null,
      pullRequest: recovery.pullRequest || recovery.pull_request || null,
    },
  };
}

function finalizeRepairReturn(plan, handoffResult = {}) {
  if (!plan || plan.status !== RETURN_STATUS.RETURN_PENDING) return plan;

  if (handoffResult.status === 'succeeded') {
    return {
      ...plan,
      status: RETURN_STATUS.RETURNED,
      reason: handoffResult.reason || 'completed',
      why: 'The bounded recovery handoff was verified in the canonical originating conversation and resumed response generation was observed.',
      recoveryOwnershipReleased: true,
      controllerMayContinueRecovery: false,
      controllerMayContinueImplementation: false,
      controllerMayRetryReturn: false,
      conversationResumed: true,
    };
  }

  const reason = handoffResult.reason || 'return_execution_failed';
  return {
    ...plan,
    status: RETURN_STATUS.RETURN_FAILED,
    reason,
    why: explainReturnReason(reason),
    recoveryOwnershipReleased: true,
    controllerMayContinueRecovery: false,
    controllerMayContinueImplementation: false,
    controllerMayRetryReturn: handoffResult.recoverable === true,
    conversationResumed: false,
  };
}

function founderVisibleReturnReport(outcome = {}) {
  const returned = outcome.status === RETURN_STATUS.RETURNED;
  const returnImpossible = [RETURN_STATUS.RETURN_FAILED, RETURN_STATUS.RETURN_UNAVAILABLE].includes(outcome.status);
  return Object.freeze({
    workKey: outcome.workKey || null,
    recoveryStatus: outcome.status || null,
    conversationReturned: returned,
    conversationReturnImpossible: returnImpossible,
    returnReason: outcome.reason || null,
    returnWhy: outcome.why || null,
    recoveryOwnershipReleased: outcome.recoveryOwnershipReleased === true,
    controllerMayContinueImplementation: outcome.controllerMayContinueImplementation === true,
    controllerMayRetryReturn: outcome.controllerMayRetryReturn === true,
  });
}

export {
  RETURN_STATUS,
  RETURN_REASON_EXPLANATIONS,
  explainReturnReason,
  planRepairReturn,
  finalizeRepairReturn,
  founderVisibleReturnReport,
};
