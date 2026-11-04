import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINUITY_STATUS,
  finalizeSuccessorContinuity,
  founderVisibleContinuityReport,
  planConversationContinuity,
} from '../lib/l4a-conversation-continuity.js';

const RECOVERY = Object.freeze({
  recoveryId: 'aed-005-recovery-001',
  workKey: 'CBE-MOBILE-003',
  semanticProgressVerified: true,
  verifiedState: 'PR #501 merged and exact-head CI passed.',
  nextAction: 'Continue AED-005 from the next dependency-valid action.',
  issue: '#504',
});

const CONTINUITY = Object.freeze({
  verified: true,
  laneId: 'AED',
  workKey: 'CBE-MOBILE-003',
  verifiedCheckpoint: 'PR #501 merged at accepted main head.',
  nextAction: 'Continue AED-005 from the next dependency-valid action.',
  authorityRef: 'L4A',
  issue: '#504',
  branch: 'aed-005-successor-conversation-continuity',
  pullRequest: '#501',
  headSha: '1fbe1196900ab6510a03866f4ee2ed3a84cff0f4',
  predecessorBindingEventId: '11111111-1111-4111-8111-111111111111',
  predecessorRefSha256: 'a'.repeat(64),
  provenanceRefs: ['runbook:CBE-MOBILE-003', 'github:1fbe1196'],
});

test('does not attempt continuity transfer before semantic recovery is verified', () => {
  const result = planConversationContinuity({
    recovery: { ...RECOVERY, semanticProgressVerified: false },
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.RECOVERY_INCOMPLETE);
  assert.equal(result.controllerMayContinueRecovery, true);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('successful original return remains the preferred continuity path', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURNED' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.ORIGINAL_ACTIVE);
  assert.equal(result.activeConversationMode, 'original');
  assert.equal(result.predecessorSuperseded, false);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('pending original return is not raced by successor creation', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_PENDING' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.ORIGINAL_RETURN_PENDING);
  assert.equal(result.recoveryOwnershipReleased, false);
});

test('failed original return becomes successor pending when durable continuity state is sufficient', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED', reason: 'response_not_observed' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.SUCCESSOR_PENDING);
  assert.equal(result.successorRequired, true);
  assert.equal(result.capsule.workKey, 'CBE-MOBILE-003');
  assert.equal(result.capsule.headSha, CONTINUITY.headSha);
  assert.equal(result.capsule.continuityId, RECOVERY.recoveryId);
  assert.equal(result.capsule.authorityRef, CONTINUITY.authorityRef);
  assert.equal(result.capsule.predecessorBindingEventId, CONTINUITY.predecessorBindingEventId);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('return unavailable is no longer terminal when continuity is sufficient but successor actuator is offline', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_UNAVAILABLE', reason: 'conversation_actuator_unavailable' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: false,
  });
  assert.equal(result.status, CONTINUITY_STATUS.SUCCESSOR_REQUIRED);
  assert.equal(result.reason, 'successor_actuator_unavailable');
  assert.equal(result.controllerMayRetryContinuity, true);
  assert.equal(result.recoveryOwnershipReleased, true);
});

test('insufficient durable state blocks successor reconstruction rather than inventing context', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: { ...CONTINUITY, verifiedCheckpoint: '' },
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.CONTINUITY_BLOCKED);
  assert.equal(result.reason, 'continuity_state_insufficient');
  assert.equal(result.controllerMayContinueRecovery, true);
});

test('missing authority blocks successor reconstruction at the planner boundary', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: { ...CONTINUITY, authorityRef: '' },
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.CONTINUITY_BLOCKED);
  assert.equal(result.reason, 'continuity_state_insufficient');
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('missing continuity identity blocks successor reconstruction before browser execution', () => {
  const { recoveryId, ...recoveryWithoutId } = RECOVERY;
  const result = planConversationContinuity({
    recovery: recoveryWithoutId,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: { ...CONTINUITY, continuityId: '' },
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.CONTINUITY_BLOCKED);
  assert.equal(result.reason, 'continuity_state_insufficient');
});

test('missing predecessor binding identity blocks successor reconstruction before browser execution', () => {
  const result = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: { ...CONTINUITY, predecessorBindingEventId: '' },
    successorActuatorAvailable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.CONTINUITY_BLOCKED);
  assert.equal(result.reason, 'continuity_state_insufficient');
});

test('verified successor activation restores the logical lane and supersedes predecessor', () => {
  const plan = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  const result = finalizeSuccessorContinuity(plan, {
    status: 'succeeded',
    reason: 'successor_active',
    registry: { promoted: true, bindingEventId: '22222222-2222-4222-8222-222222222222', supersedesEventId: CONTINUITY.predecessorBindingEventId },
    recoverable: false,
    successorConversationUrl: 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc',
  });
  assert.equal(result.status, CONTINUITY_STATUS.SUCCESSOR_ACTIVE);
  assert.equal(result.activeConversationMode, 'successor');
  assert.equal(result.predecessorSuperseded, true);
  assert.equal(result.recoveryOwnershipReleased, true);
  assert.equal(result.controllerMayContinueImplementation, false);
  const report = founderVisibleContinuityReport(result);
  assert.equal(report.laneContinuityRestored, true);
  assert.equal(report.activeConversationMode, 'successor');
});

test('recoverable successor failure remains successor required instead of returning implementation ownership to AED', () => {
  const plan = planConversationContinuity({
    recovery: RECOVERY,
    originalReturnOutcome: { status: 'RETURN_FAILED' },
    continuityState: CONTINUITY,
    successorActuatorAvailable: true,
  });
  const result = finalizeSuccessorContinuity(plan, {
    status: 'failed',
    reason: 'authentication_required',
    recoverable: true,
  });
  assert.equal(result.status, CONTINUITY_STATUS.SUCCESSOR_REQUIRED);
  assert.equal(result.controllerMayRetryContinuity, true);
  assert.equal(result.controllerMayContinueImplementation, false);
  assert.equal(result.predecessorSuperseded, false);
});

for (const [label, registry] of [
  ['missing registry receipt', undefined],
  ['failed promotion', { promoted: false }],
  ['missing binding identity', { promoted: true, supersedesEventId: CONTINUITY.predecessorBindingEventId }],
  ['different predecessor', { promoted: true, bindingEventId: '22222222-2222-4222-8222-222222222222', supersedesEventId: '33333333-3333-4333-8333-333333333333' }],
]) {
  test(`browser success cannot restore continuity with ${label}`, () => {
    const plan = planConversationContinuity({
      recovery: RECOVERY,
      originalReturnOutcome: { status: 'RETURN_FAILED' },
      continuityState: CONTINUITY,
      successorActuatorAvailable: true,
    });
    const result = finalizeSuccessorContinuity(plan, {
      status: 'succeeded',
      successorConversationUrl: 'https://chatgpt.com/c/55555555-5555-4555-8555-555555555555',
      registry,
    });
    assert.equal(result.status, CONTINUITY_STATUS.CONTINUITY_BLOCKED);
    assert.equal(result.reason, 'successor_registry_unverified');
    assert.equal(result.predecessorSuperseded, false);
    assert.equal(result.controllerMayContinueImplementation, false);
    assert.equal(result.controllerMayRetryContinuity, false);
    assert.equal(founderVisibleContinuityReport(result).laneContinuityRestored, false);
  });
}
