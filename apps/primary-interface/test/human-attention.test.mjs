import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHumanAction } from '../src/human-attention.mjs';

// Synthetic fixtures only. No real approval, evidence or VE state is asserted.
const now = '2026-10-17T19:00:00Z';
const fixture = () => ({
  id: 'fixture/action-1', laneId: 'fixture-lane', status: 'open', revision: 1,
  stopReason: 'Synthetic production boundary', authorityBoundary: 'C4 human decision',
  recommendation: 'Review isolated evidence', consequences: 'Synthetic activation would change access',
  requestedAt: '2026-10-17T18:00:00Z', expiresAt: '2026-10-17T20:00:00Z',
  evidence: [{ id: 'fixture-evidence', sourceRef: 'fixture:isolated-proof', verification: 'verified',
    conflict: false, verifiedAt: '2026-10-17T18:30:00Z', expiresAt: '2026-10-17T20:00:00Z' }],
  runbookRefs: [{ id: 'fixture-event', sourceRef: 'fixture:runbook' }],
});
test('complete fresh request is reviewable, deterministic and does not mutate input', () => {
  const r = fixture(), before = structuredClone(r);
  const result = assessHumanAction(r, now);
  assert.equal(result.state, 'reviewable');
  assert.deepEqual(result.decisionOptions, ['approve', 'hold', 'reject']);
  assert.equal(result.navigation, '/attention/fixture%2Faction-1');
  assert.deepEqual(result, assessHumanAction(r, now));
  assert.deepEqual(r, before);
});
for (const status of ['approved', 'held', 'rejected', 'superseded']) {
  test(`${status} is inspectable with no decision options`, () => {
    const result = assessHumanAction({ ...fixture(), status }, now);
    assert.equal(result.state, 'closed');
    assert.deepEqual(result.decisionOptions, []);
    assert.ok(result.navigation);
  });
}
const invalidCases = {
  'missing boundary': r => delete r.authorityBoundary,
  'no evidence': r => r.evidence = [],
  'no RunBook': r => r.runbookRefs = [],
  'missing provenance': r => delete r.evidence[0].sourceRef,
  'unverified evidence': r => r.evidence[0].verification = 'unverified',
  'conflicting evidence': r => r.evidence[0].conflict = true,
  'unknown conflict state': r => delete r.evidence[0].conflict,
  'expired evidence at exact boundary': r => r.evidence[0].expiresAt = now,
  'expired request at exact boundary': r => r.expiresAt = now,
  'future verification': r => r.evidence[0].verifiedAt = '2026-10-18T00:00:00Z',
  'future request': r => r.requestedAt = '2026-10-18T00:00:00Z',
  'impossible calendar date': r => r.requestedAt = '2026-02-30T18:00:00Z',
  'invalid timestamp': r => r.requestedAt = 'yesterday',
  'inverted interval': r => r.evidence[0].expiresAt = '2026-10-17T18:00:00Z',
  'duplicate evidence': r => r.evidence.push(structuredClone(r.evidence[0])),
  'missing revision': r => delete r.revision,
  'invalid lifecycle': r => r.status = 'executing',
  'null evidence entry': r => r.evidence = [null],
};
for (const [label, mutate] of Object.entries(invalidCases)) {
  test(`${label} keeps item visible and removes decision options`, () => {
    const r = fixture(); mutate(r);
    const result = assessHumanAction(r, now);
    assert.equal(result.state, 'needs_refresh');
    assert.ok(result.issues.length);
    assert.ok(result.navigation);
    assert.deepEqual(result.decisionOptions, []);
  });
}
test('invalid input is explicit, and absent identifiers cannot invent a route', () => {
  for (const r of [null, undefined, [], {}, 'invalid']) {
    const result = assessHumanAction(r, now);
    assert.equal(result.state, 'needs_refresh');
    assert.equal(result.navigation, null);
  }
  assert.throws(() => assessHumanAction(fixture(), 'invalid'), TypeError);
});
