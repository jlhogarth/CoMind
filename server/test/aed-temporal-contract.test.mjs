import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRecoveryAuthorized,
  isSemanticallyStalled,
  projectLaneResult,
} from '../dist/aed/temporal/contracts.js';

test('last observed timestamp never substitutes for semantic progress', () => {
  const stalled = isSemanticallyStalled({
    lastProgressAt: '2026-10-31T08:00:00.000Z',
    nowMs: Date.parse('2026-10-31T08:00:10.000Z'),
    stallThresholdMs: 5_000,
  });
  assert.equal(stalled, true);
});

test('CLEAR is mandatory before a recovery mutation', () => {
  assert.throws(() => assertRecoveryAuthorized(false), /CLEAR_REQUIRED/);
  assert.doesNotThrow(() => assertRecoveryAuthorized(true));
});

test('operator projection preserves transition causality', () => {
  const result = {
    laneId: 'aed003-test-lane',
    outcome: 'recovered',
    wakeCause: 'durable_timer',
    initialProgressAt: '2026-10-31T08:00:00.000Z',
    finalProgressAt: '2026-10-31T08:00:10.000Z',
    finalObservedAt: '2026-10-31T08:00:09.000Z',
    escalation: null,
    timingModel: {
      source: 'job',
      samples: 5,
      p50: 1000,
      p90: 1400,
      p95: 1450,
      delayMs: 1000,
      band: 'normal_early',
    },
    transitions: [
      {
        sequence: 1,
        type: 'waiting',
        at: '2026-10-31T08:00:01.000Z',
        wakeCause: null,
        semanticProgressAt: '2026-10-31T08:00:00.000Z',
        observedAt: '2026-10-31T08:00:00.000Z',
        detail: 'waiting for event or durable timer',
      },
      {
        sequence: 2,
        type: 'recovery_verified',
        at: '2026-10-31T08:00:10.000Z',
        wakeCause: 'durable_timer',
        semanticProgressAt: '2026-10-31T08:00:10.000Z',
        observedAt: '2026-10-31T08:00:09.000Z',
        detail: 'semantic progress advanced after recovery',
      },
    ],
  };

  const projection = projectLaneResult(result);
  assert.equal(projection.laneId, result.laneId);
  assert.equal(projection.status, 'recovered');
  assert.equal(projection.transitionCount, 2);
  assert.deepEqual(
    projection.causality.map((entry) => entry.type),
    ['waiting', 'recovery_verified']
  );
});
