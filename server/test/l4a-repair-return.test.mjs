import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RETURN_STATUS,
  finalizeRepairReturn,
  founderVisibleReturnReport,
  planRepairReturn,
} from '../lib/l4a-repair-return.js';

const RECOVERY = Object.freeze({
  recoveryId: 'recovery-467-001',
  workKey: 'GER-002',
  reasonCode: 'stalled_lane_repair',
  repairSummary: 'Reconciled the stale branch and restored semantic progress.',
  verifiedState: 'A new accepted semantic progress event was verified.',
  nextAction: 'Continue the original lane from its dependency-valid next action.',
  issue: '#379',
  branch: 'ger-002-epistemic-case-persistence',
  pullRequest: '#480',
  semanticProgressVerified: true,
});

const BINDING = Object.freeze({
  active: true,
  registeredConversationUrl: 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc',
});

test('does not attempt conversation return until semantic recovery is proven', () => {
  const result = planRepairReturn({
    recovery: { ...RECOVERY, semanticProgressVerified: false },
    conversationBinding: BINDING,
    conversationActuatorAvailable: true,
  });
  assert.equal(result.status, RETURN_STATUS.RECOVERY_INCOMPLETE);
  assert.equal(result.reason, 'semantic_progress_unverified');
  assert.equal(result.recoveryOwnershipReleased, false);
  assert.equal(result.controllerMayContinueRecovery, true);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('reports missing conversation binding explicitly and releases implementation ownership', () => {
  const result = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: null,
    conversationActuatorAvailable: true,
  });
  assert.equal(result.status, RETURN_STATUS.RETURN_UNAVAILABLE);
  assert.equal(result.reason, 'conversation_binding_missing');
  assert.match(result.why, /No canonical originating-conversation binding/);
  assert.equal(result.recoveryOwnershipReleased, true);
  assert.equal(result.controllerMayContinueImplementation, false);
  const report = founderVisibleReturnReport(result);
  assert.equal(report.conversationReturnImpossible, true);
  assert.equal(report.returnReason, 'conversation_binding_missing');
  assert.match(report.returnWhy, /originating-conversation binding/);
});

test('reports an inactive conversation binding as the exact return blocker', () => {
  const result = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: { ...BINDING, active: false },
    conversationActuatorAvailable: true,
  });
  assert.equal(result.status, RETURN_STATUS.RETURN_UNAVAILABLE);
  assert.equal(result.reason, 'conversation_binding_inactive');
  assert.match(result.why, /not active/);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('reports actuator unavailability instead of pretending the original conversation resumed', () => {
  const result = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: BINDING,
    conversationActuatorAvailable: false,
  });
  assert.equal(result.status, RETURN_STATUS.RETURN_UNAVAILABLE);
  assert.equal(result.reason, 'conversation_actuator_unavailable');
  assert.equal(result.controllerMayRetryReturn, true);
  assert.equal(result.controllerMayContinueImplementation, false);
});

test('successful verified handoff returns ownership and records conversation resumption', () => {
  const plan = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: BINDING,
    conversationActuatorAvailable: true,
  });
  assert.equal(plan.status, RETURN_STATUS.RETURN_PENDING);
  assert.equal(plan.controllerMayContinueImplementation, false);

  const result = finalizeRepairReturn(plan, {
    status: 'succeeded',
    reason: 'completed',
    recoverable: false,
  });
  assert.equal(result.status, RETURN_STATUS.RETURNED);
  assert.equal(result.conversationResumed, true);
  assert.equal(result.recoveryOwnershipReleased, true);
  assert.equal(result.controllerMayContinueImplementation, false);
  assert.equal(founderVisibleReturnReport(result).conversationReturned, true);
});

test('authentication failure names why return was impossible and does not transfer implementation to AED', () => {
  const plan = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: BINDING,
    conversationActuatorAvailable: true,
  });
  const result = finalizeRepairReturn(plan, {
    status: 'failed',
    reason: 'authentication_required',
    recoverable: true,
  });
  assert.equal(result.status, RETURN_STATUS.RETURN_FAILED);
  assert.equal(result.reason, 'authentication_required');
  assert.match(result.why, /not currently authenticated/);
  assert.equal(result.conversationResumed, false);
  assert.equal(result.recoveryOwnershipReleased, true);
  assert.equal(result.controllerMayContinueImplementation, false);
  assert.equal(result.controllerMayRetryReturn, true);
});

test('response verification failure remains founder-visible with its exact reason', () => {
  const plan = planRepairReturn({
    recovery: RECOVERY,
    conversationBinding: BINDING,
    conversationActuatorAvailable: true,
  });
  const result = finalizeRepairReturn(plan, {
    status: 'failed',
    reason: 'response_not_observed',
    recoverable: true,
  });
  const report = founderVisibleReturnReport(result);
  assert.equal(report.conversationReturnImpossible, true);
  assert.equal(report.returnReason, 'response_not_observed');
  assert.match(report.returnWhy, /response generation was not observed/);
  assert.equal(report.controllerMayContinueImplementation, false);
});
