import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVENESS, AED_LEVEL, isProgressEvent, latestProgressAt, classifyLane, clearForShock } from '../lib/aed-liveness.js';

const NOW = new Date('2026-10-30T23:45:00Z');

test('heartbeat is observation, never semantic progress', () => {
  const events = [
    { type: 'implementation_commit', at: '2026-10-30T20:00:00Z', verified: true },
    { type: 'controller_heartbeat', at: '2026-10-30T23:44:00Z', verified: true }
  ];
  assert.equal(isProgressEvent(events[1]), false);
  assert.equal(latestProgressAt(events), '2026-10-30T20:00:00.000Z');
});

test('repeated heartbeats cannot keep an overdue lane healthy', () => {
  const result = classifyLane({
    terminal: false,
    owner: 'recovery-controller',
    actionable: true,
    expectedProgressBy: '2026-10-30T21:00:00Z',
    events: [
      { type: 'implementation_commit', at: '2026-10-30T20:00:00Z', verified: true },
      { type: 'controller_heartbeat', at: '2026-10-30T22:00:00Z', verified: true },
      { type: 'controller_heartbeat', at: '2026-10-30T23:00:00Z', verified: true }
    ]
  }, NOW);
  assert.equal(result.state, LIVENESS.STALLED);
  assert.equal(result.level, AED_LEVEL.RECOVER);
  assert.equal(result.lastProgressAt, '2026-10-30T20:00:00.000Z');
});

test('bounded wait remains healthy only with a wake condition', () => {
  assert.equal(classifyLane({ terminal: false, waiting: true, wakeCondition: 'CI run completes' }, NOW).state, LIVENESS.WAITING);
  const invalid = classifyLane({ terminal: false, waiting: true }, NOW);
  assert.equal(invalid.state, LIVENESS.STALLED);
  assert.equal(invalid.level, AED_LEVEL.NUDGE);
});

test('block requires blocker and responsible owner', () => {
  assert.equal(classifyLane({ terminal: false, blocked: true, blocker: 'DEP-1', blockerOwner: 'lane-x' }, NOW).state, LIVENESS.BLOCKED);
  assert.equal(classifyLane({ terminal: false, blocked: true, blocker: 'DEP-1' }, NOW).state, LIVENESS.STALLED);
});

test('actionable unowned lane is abandoned and recoverable', () => {
  const result = classifyLane({ terminal: false, actionable: true, events: [] }, NOW);
  assert.equal(result.state, LIVENESS.ABANDONED);
  assert.equal(result.level, AED_LEVEL.RECOVER);
});

test('mandatory stop escalates rather than recovering', () => {
  const result = classifyLane({ terminal: false, mandatoryStop: true, stopReason: 'Production authorization required' }, NOW);
  assert.equal(result.state, LIVENESS.ESCALATED);
  assert.equal(result.level, AED_LEVEL.ESCALATE);
});

test('CLEAR passes only when all required safety gates are explicitly true', () => {
  const safe = {
    l4aAuthorized: true,
    oneIssueOneBranchOnePr: true,
    noPlaceholder: true,
    collisionClear: true,
    freshnessClear: true,
    dependencyValid: true,
    costGuardrailClear: true,
    productionChange: false,
    secretsPresent: false
  };
  assert.deepEqual(clearForShock(safe), { clear: true, failed: [] });
  assert.equal(clearForShock({ ...safe, freshnessClear: false }).clear, false);
  assert.equal(clearForShock({ ...safe, collisionClear: undefined }).clear, false);
  assert.equal(clearForShock({ ...safe, productionChange: true, productionAuthorized: false }).clear, false);
  assert.equal(clearForShock({ ...safe, secretsPresent: true }).clear, false);
});

test('verified post-intervention event advances semantic progress', () => {
  const before = [
    { type: 'implementation_commit', at: '2026-10-30T20:00:00Z', verified: true },
    { type: 'unverified_recovery_attempt', at: '2026-10-30T22:00:00Z', verified: true }
  ];
  const after = before.concat({ type: 'authorized_mutation_verified', at: '2026-10-30T23:30:00Z', verified: true });
  assert.equal(latestProgressAt(before), '2026-10-30T20:00:00.000Z');
  assert.equal(latestProgressAt(after), '2026-10-30T23:30:00.000Z');
});
