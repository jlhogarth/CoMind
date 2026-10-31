'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectLiveness, eligibleForDispatch, claimLane, planRecovery, verifySemanticProgress } = require('../lib/l4a-semantic-progress');

const NOW = new Date('2026-10-31T01:30:00Z');
const progress = (at) => ({ type: 'implementation_commit', at, verified: true });
const heartbeat = (at) => ({ type: 'controller_heartbeat', at, verified: true });

function stalled(overrides = {}) {
  return {
    workKey: 'AEL-003', status: 'in_progress', actionable: true, dependenciesValid: true,
    expectedProgressBy: '2026-10-31T00:30:00Z', nextAction: 'implement governed preflight',
    events: [progress('2026-10-30T22:00:00Z'), heartbeat('2026-10-31T01:25:00Z')],
    ...overrides
  };
}

test('heartbeat does not reset semantic progress or hide a stalled lane', () => {
  const p = projectLiveness(stalled(), NOW);
  assert.equal(p.liveness, 'STALLED');
  assert.equal(p.lastProgressAt, '2026-10-30T22:00:00.000Z');
});

test('dependency-valid unclaimed stalled lane is dispatch eligible exactly once', () => {
  assert.equal(eligibleForDispatch(stalled(), NOW).eligible, true);
  const active = stalled({ claim: { active: true, controller: 'other-controller' } });
  assert.equal(eligibleForDispatch(active, NOW).eligible, false);
});

test('terminal lane cannot be redispatched', () => {
  assert.equal(eligibleForDispatch(stalled({ status: 'done' }), NOW).eligible, false);
});

test('claim is bounded and requires controller identity', () => {
  assert.equal(claimLane(stalled(), '', NOW).claimed, false);
  const result = claimLane(stalled(), 'CoMind Recovery Sweep', NOW, 60000);
  assert.equal(result.claimed, true);
  assert.equal(result.claim.expiresAt, '2026-10-31T01:31:00.000Z');
});

test('CLEAR failure prevents recovery dispatch', () => {
  const result = planRecovery(stalled(), {
    l4aAuthorized: true, oneIssueOneBranchOnePr: true, noPlaceholder: true,
    collisionClear: false, freshnessClear: true, dependencyValid: true,
    costGuardrailClear: true, productionChange: false, secretsPresent: false
  }, 'CoMind Recovery Sweep', NOW);
  assert.equal(result.action, 'ESCALATE_OR_HOLD');
  assert.deepEqual(result.failedSafety, ['collisionClear']);
});

test('CLEAR pass produces bounded RECOVER plan without Production change', () => {
  const result = planRecovery(stalled(), {
    l4aAuthorized: true, oneIssueOneBranchOnePr: true, noPlaceholder: true,
    collisionClear: true, freshnessClear: true, dependencyValid: true,
    costGuardrailClear: true, productionChange: false, secretsPresent: false
  }, 'CoMind Recovery Sweep', NOW);
  assert.equal(result.action, 'RECOVER');
  assert.equal(result.nextAction, 'implement governed preflight');
});

test('semantic progress verification ignores later heartbeat but accepts later work product', () => {
  const before = stalled();
  const noProgress = { events: [...before.events, heartbeat('2026-10-31T01:29:00Z')] };
  assert.equal(verifySemanticProgress(before, noProgress).advanced, false);
  const advanced = { events: [...noProgress.events, progress('2026-10-31T01:29:30Z')] };
  assert.equal(verifySemanticProgress(before, advanced).advanced, true);
});
