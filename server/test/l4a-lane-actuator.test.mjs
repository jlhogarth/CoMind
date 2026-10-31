import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTINUATION, decideLaneContinuation } from '../lib/l4a-lane-actuator.js';

const NOW = new Date('2026-10-31T14:30:00Z');
const SAFETY = Object.freeze({
  l4aAuthorized: true,
  oneIssueOneBranchOnePr: true,
  noPlaceholder: true,
  collisionClear: true,
  freshnessClear: true,
  dependencyValid: true,
  costGuardrailClear: true,
  productionChange: false,
  secretsPresent: false,
});
const progress = (at) => ({ type: 'implementation_commit', at, verified: true });

function actionable(overrides = {}) {
  return {
    workKey: 'GER-004',
    status: 'in_progress',
    actionable: true,
    dependenciesValid: true,
    expectedProgressBy: '2026-10-31T15:30:00Z',
    nextAction: 'update repository implementation and tests',
    executionSurface: 'repository',
    authorityRef: 'L4A-standing-2026-10-30',
    issueNumber: 500,
    branch: 'ger-004-example',
    pullRequest: 501,
    events: [progress('2026-10-31T14:00:00Z')],
    ...overrides,
  };
}

test('authorized actionable lane executes instead of stopping at recommendation', () => {
  const result = decideLaneContinuation(actionable(), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.EXECUTE);
  assert.equal(result.envelope.workKey, 'GER-004');
  assert.equal(result.envelope.executionSurface, 'repository');
  assert.equal(result.envelope.transport, 'governed_connector_or_workflow');
  assert.equal(result.envelope.productionChange, false);
  assert.equal(result.envelope.paidService, false);
  assert.match(result.envelope.idempotencyKey, /^l4a:[a-f0-9]{64}$/);
});

test('bounded wait remains waiting and does not dispatch', () => {
  const result = decideLaneContinuation(actionable({ waiting: true, wakeCondition: 'CI completes' }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.WAIT);
  assert.equal(result.wakeCondition, 'CI completes');
  assert.equal(result.envelope, undefined);
});

test('dependency block remains blocked and does not dispatch', () => {
  const result = decideLaneContinuation(actionable({ blocked: true, blocker: 'dependency X', blockerOwner: 'lane X' }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.BLOCK);
  assert.equal(result.envelope, undefined);
});

test('mandatory human stop escalates without dispatch', () => {
  const result = decideLaneContinuation(actionable({ mandatoryStop: true, stopReason: 'Production authorization required' }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.ESCALATE);
  assert.equal(result.envelope, undefined);
});

test('unsupported ChatGPT conversation surface is explicitly unavailable', () => {
  const result = decideLaneContinuation(actionable({ executionSurface: 'chatgpt-conversation' }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.UNAVAILABLE);
  assert.equal(result.missingActuator, 'chatgpt-conversation');
  assert.match(result.reason, /no autonomous actuator registered/);
  assert.equal(result.envelope, undefined);
});

test('active canonical claim prevents duplicate dispatch', () => {
  const result = decideLaneContinuation(actionable({
    claim: { active: true, controller: 'worker-a', expiresAt: '2026-10-31T14:45:00Z' },
  }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.BLOCK);
  assert.match(result.reason, /prevents duplicate dispatch/);
});

test('expired claim requires canonical lease reacquisition but does not permanently block', () => {
  const result = decideLaneContinuation(actionable({
    claim: { active: true, controller: 'worker-a', expiresAt: '2026-10-31T14:20:00Z' },
  }), SAFETY, { now: NOW });
  assert.equal(result.decision, CONTINUATION.EXECUTE);
  assert.equal(result.envelope.lease.mode, 'reacquire');
});

test('CLEAR collision failure blocks continuation', () => {
  const result = decideLaneContinuation(actionable(), { ...SAFETY, collisionClear: false }, { now: NOW });
  assert.equal(result.decision, CONTINUATION.BLOCK);
  assert.deepEqual(result.failedSafety, ['collisionClear']);
});

test('missing durable L4A authority escalates instead of guessing authority', () => {
  const result = decideLaneContinuation(actionable(), { ...SAFETY, l4aAuthorized: false }, { now: NOW });
  assert.equal(result.decision, CONTINUATION.ESCALATE);
  assert.deepEqual(result.failedSafety, ['l4aAuthorized']);
});

test('idempotency key is stable until semantic progress or dispatch generation changes', () => {
  const first = decideLaneContinuation(actionable(), SAFETY, { now: NOW });
  const replay = decideLaneContinuation(actionable(), SAFETY, { now: new Date('2026-10-31T14:31:00Z') });
  assert.equal(first.envelope.idempotencyKey, replay.envelope.idempotencyKey);

  const advanced = decideLaneContinuation(actionable({
    events: [progress('2026-10-31T14:00:00Z'), progress('2026-10-31T14:32:00Z')],
  }), SAFETY, { now: new Date('2026-10-31T14:33:00Z') });
  assert.notEqual(first.envelope.idempotencyKey, advanced.envelope.idempotencyKey);
});

test('Production mutation remains a human gate even when other CLEAR inputs pass', () => {
  const result = decideLaneContinuation(
    actionable({ productionChange: true }),
    { ...SAFETY, productionChange: true, productionAuthorized: false },
    { now: NOW },
  );
  assert.equal(result.decision, CONTINUATION.ESCALATE);
  assert.ok(result.failedSafety.includes('productionAuthorized'));
});
