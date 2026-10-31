import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLE, WAKE, summarizeDurations, chooseTimingModel, adaptiveWakePlan } from '../lib/aed-adaptive-liveness.js';

const NOW = '2026-10-31T06:00:00.000Z';

function ago(ms) { return new Date(Date.parse(NOW) - ms).toISOString(); }

test('duration model preserves tail behavior instead of reducing history to an average', () => {
  const s = summarizeDurations([1000, 1000, 1000, 1000, 10000]);
  assert.equal(s.samples, 5);
  assert.ok(s.p95 > 8000);
});

test('cold start falls back through job family before static timing', () => {
  const model = chooseTimingModel({ job: [10, 11], family: [100, 110, 120, 130, 140], fallbackMs: 9999 });
  assert.equal(model.source, 'family');
  assert.equal(model.samples, 5);
});

test('healthy long-running job is not hammered early in its lifecycle', () => {
  const plan = adaptiveWakePlan({
    state: LIFECYCLE.RUNNING,
    now: NOW,
    stateEnteredAt: ago(60000),
    eventExpected: false,
    history: { job: [600000, 620000, 640000, 660000, 680000] }
  });
  assert.equal(plan.band, 'normal_early');
  assert.equal(plan.wake, WAKE.TIMER);
  assert.ok(plan.delayMs >= 5000);
  assert.equal(plan.diagnosticTrigger, false);
});

test('short job approaching its tail is observed more aggressively', () => {
  const plan = adaptiveWakePlan({
    state: LIFECYCLE.RUNNING,
    now: NOW,
    stateEnteredAt: ago(48000),
    eventExpected: false,
    history: { job: [30000, 35000, 40000, 45000, 50000] }
  });
  assert.ok(['tail_observation', 'diagnose'].includes(plan.band));
  assert.ok(plan.delayMs <= 15000);
});

test('event is preferred while a durable fallback deadline is still calculated', () => {
  const plan = adaptiveWakePlan({
    state: LIFECYCLE.QUEUED,
    now: NOW,
    stateEnteredAt: ago(10000),
    eventExpected: true,
    history: { job: [30000, 32000, 34000, 36000, 38000] }
  });
  assert.equal(plan.wake, WAKE.EVENT);
  assert.ok(plan.fallbackWakeAt);
});

test('P95 overrun triggers diagnosis but does not itself authorize destructive recovery', () => {
  const plan = adaptiveWakePlan({
    state: LIFECYCLE.RUNNING,
    now: NOW,
    stateEnteredAt: ago(120000),
    eventExpected: false,
    history: { job: [30000, 35000, 40000, 45000, 50000] }
  });
  assert.equal(plan.band, 'diagnose');
  assert.equal(plan.diagnosticTrigger, true);
  assert.equal(plan.delayMs, 0);
  assert.equal(Object.hasOwn(plan, 'recoveryAuthorized'), false);
});

test('bounded waits require a concrete wake condition', () => {
  assert.throws(() => adaptiveWakePlan({ state: LIFECYCLE.BOUNDED_WAIT, now: NOW, stateEnteredAt: NOW }), /requires wakeAt or eventExpected/);
  const plan = adaptiveWakePlan({ state: LIFECYCLE.BOUNDED_WAIT, now: NOW, stateEnteredAt: NOW, wakeAt: '2026-10-31T07:00:00.000Z' });
  assert.equal(plan.wake, WAKE.TIMER);
});

test('human-blocked work does not poll', () => {
  const plan = adaptiveWakePlan({ state: LIFECYCLE.BLOCKED_HUMAN, now: NOW, stateEnteredAt: ago(86400000) });
  assert.equal(plan.wake, WAKE.EVENT);
  assert.equal(plan.wakeAt, null);
});
