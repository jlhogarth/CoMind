import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRetention, evaluateLifecycle, readLifecycleFreshness, runbookLifecyclePolicy, runLifecycleCheck,
} from '../dist/runbook/lifecycle.js';

const slot = { volumeId: 'synthetic-volume', scheduledFor: '2026-11-09T14:00:00.000Z' };
const checkedAt = '2026-11-09T14:01:00.000Z';
const tab = (tabId, units) => ({ tabId, body: { content: [{ endIndex: units + 1 }] } });
const snapshot = (units) => ({ documentId: slot.volumeId, revisionId: 'reviewed-revision', tabs: [tab('t.0', units)] });
const plan = {
  documentId: slot.volumeId,
  reviewedRevisionId: 'reviewed-revision',
  milestoneEvidence: 'test:milestone',
  archiveEvidence: 'test:archive',
  handoffEvidence: 'test:handoff',
  writerInventoryEvidence: 'test:writer-inventory',
  writers: [{ id: 'test-writer', status: 'verified' }],
};
const evaluate = (observation) => evaluateLifecycle(slot, checkedAt, { kind: 'received', ...observation });

test('thresholds are inclusive and multiple tabs count once', () => {
  assert.deepEqual(Object.values(runbookLifecyclePolicy.rules), [
    'DRB-LIFECYCLE-001', 'DRB-LIFECYCLE-002', 'DRB-LIFECYCLE-003', 'DRB-LIFECYCLE-004',
  ]);
  for (const [units, state] of [[299999, 'below_review'], [300000, 'review'], [749999, 'review'], [750000, 'escalation']]) {
    const result = evaluate({ snapshot: snapshot(units) });
    assert.equal(result.approximateUtf16Units, units);
    assert.equal(result.size, state);
  }
  const multi = snapshot(200000);
  multi.tabs.push(tab('t.1', 100000));
  assert.equal(evaluate({ snapshot: multi }).size, 'review');
  multi.tabs.push(tab('t.1', 10));
  assert.equal(evaluate({ snapshot: multi }).size, 'invalid');
});

test('readiness requires the reviewed document revision and complete evidence', () => {
  const source = snapshot(300000);
  const ready = evaluate({ snapshot: source, plan });
  assert.equal(ready.rollover, 'ready_for_review');
  assert.equal(ready.evidence.archive, plan.archiveEvidence);
  assert.equal(evaluate({ snapshot: snapshot(100), plan }).rollover, 'ready_for_review');
  for (const field of ['milestoneEvidence', 'archiveEvidence', 'handoffEvidence', 'writerInventoryEvidence']) {
    const result = evaluate({ snapshot: source, plan: { ...plan, [field]: undefined } });
    assert.deepEqual(result.blockers, ['rollover_evidence_incomplete']);
    assert.equal(result.evidence, null);
  }
  const stale = evaluate({ snapshot: { ...source, revisionId: 'new-revision' }, plan });
  assert.deepEqual(stale.blockers, ['reviewed_revision_mismatch']);
  const wrongDoc = evaluate({ snapshot: { ...source, documentId: 'other-doc' }, plan });
  assert.deepEqual(wrongDoc.blockers, ['measurement_unverified', 'reviewed_revision_mismatch']);
  for (const writers of [[{ id: 'test-writer', status: 'unverified' }], [...plan.writers, ...plan.writers]]) {
    assert.deepEqual(evaluate({ snapshot: source, plan: { ...plan, writers } }).blockers, ['writer_inventory_unverified']);
  }
});

test('records read failures, checks a due slot independently, and returns the same receipt on replay', async () => {
  const records = new Map();
  const ledger = {
    find: async ({ scheduledFor }) => records.get(scheduledFor) ?? null,
    record: async (evaluation) => {
      const receipt = { eventId: String(records.size + 1), evaluation };
      records.set(evaluation.scheduledFor, receipt);
      return receipt;
    },
  };
  let sourceReads = 0;
  assert.equal((await readLifecycleFreshness(slot, ledger)).status, 'missed');
  const readFailure = async () => {
    sourceReads += 1;
    throw new Error('test source failure');
  };
  const first = await runLifecycleCheck(slot, ledger, readFailure, () => checkedAt);
  assert.equal(first.evaluation.size, 'unavailable');
  assert.equal(first.evaluation.rollover, 'blocked');
  assert.deepEqual(await runLifecycleCheck(slot, ledger, readFailure, () => checkedAt), first);
  assert.equal(sourceReads, 1);
  assert.equal((await readLifecycleFreshness(slot, ledger)).status, 'measurement_failed');
  const later = { ...slot, scheduledFor: checkedAt };
  const success = await runLifecycleCheck(later, ledger, async () => ({ snapshot: snapshot(10) }), () => checkedAt);
  assert.equal(success.evaluation.size, 'below_review');
  assert.equal((await readLifecycleFreshness(later, ledger)).status, 'current');
  assert.equal((await readLifecycleFreshness(later, { find: async () => ({
    ...success, evaluation: { ...success.evaluation, policyVersion: 0 },
  }) })).status, 'policy_changed');
  assert.equal((await readLifecycleFreshness({ ...slot, scheduledFor: '2026-11-16T14:00:00.000Z' }, ledger)).status, 'missed');
  await assert.rejects(runLifecycleCheck({ ...slot, volumeId: 'other-volume' }, {
    ...ledger, find: async () => null, record: async () => { throw new Error('ledger unavailable'); },
  }, async () => ({ snapshot: {} }), () => checkedAt), /ledger unavailable/);
});

test('retention disposition never grants deletion and uncertainty blocks eligibility', () => {
  const candidate = { classification: 'routine', hold: 'clear', eligibleAfter: checkedAt, replacementEvidence: 'test:archive' };
  assert.equal(assessRetention(candidate, checkedAt), 'candidate_for_review');
  assert.equal(assessRetention({ ...candidate, classification: 'consequential' }, checkedAt), 'blocked_protected_or_unknown_class');
  assert.equal(assessRetention({ ...candidate, classification: 'unknown' }, checkedAt), 'blocked_protected_or_unknown_class');
  assert.equal(assessRetention({ ...candidate, hold: 'unknown' }, checkedAt), 'blocked_hold');
  assert.equal(assessRetention({ ...candidate, hold: 'active' }, checkedAt), 'blocked_hold');
  assert.equal(assessRetention({ ...candidate, eligibleAfter: '2026-11-10T00:00:00.000Z' }, checkedAt), 'blocked_retention_window');
  assert.equal(assessRetention({ ...candidate, replacementEvidence: '' }, checkedAt), 'blocked_missing_retention_evidence');
});
