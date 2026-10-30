import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GER_HYPOTHESIS_ORCHESTRATOR_VERSION,
  assessBiasControls,
  assessCounterfactualArtifact,
  assessHypothesisClosure,
  assessHypothesisReopening,
  assessTestCandidate,
  rankDiscriminatingTests,
  selectNextDiscriminatingTest,
} from '../dist/epistemic/hypothesis-orchestrator.js';

const hypotheses = [
  { hypothesisRef: 'hyp:a', summary: 'Cause A', proposerRef: 'agent:atlas', state: 'supported', plausible: true, examined: true, sourceRefs: ['source:a'], assumptionRefs: ['assumption:a'], falsifierRefs: ['falsifier:a'], testability: 'testable', confidence: 0.7 },
  { hypothesisRef: 'hyp:b', summary: 'Cause B', proposerRef: 'agent:atlas', state: 'investigated', plausible: true, examined: true, sourceRefs: ['source:b'], assumptionRefs: [], falsifierRefs: ['falsifier:b'], testability: 'testable', confidence: 0.4 },
];

const discriminatingTest = {
  testRef: 'test:discriminating', feasible: true, authorityStatus: 'not_required', humanApprovalRequired: false, humanApproved: false,
  cost: 3, risk: 1, irreversibility: 0, duration: 1, authoritySensitivity: 0,
  predictions: [{ hypothesisRef: 'hyp:a', outcomeKey: 'present' }, { hypothesisRef: 'hyp:b', outcomeKey: 'absent' }],
};

test('GER-003 orchestrator has a stable version', () => {
  assert.equal(GER_HYPOTHESIS_ORCHESTRATOR_VERSION, 'ger-003-v1');
});

test('a cheaper non-discriminating test does not outrank a discriminating test merely by cost', () => {
  const ranked = rankDiscriminatingTests([
    { ...discriminatingTest, testRef: 'test:cheap', cost: 0, risk: 0, duration: 0, predictions: [{ hypothesisRef: 'hyp:a', outcomeKey: 'same' }, { hypothesisRef: 'hyp:b', outcomeKey: 'same' }] },
    discriminatingTest,
  ], hypotheses);
  assert.equal(ranked[0]?.testRef, 'test:discriminating');
  assert.equal(ranked[0]?.discriminatoryValue, 1);
  assert.equal(ranked[1]?.discriminatoryValue, 0);
});

test('missing authority makes a test ineligible even when it is highly discriminating', () => {
  const assessment = assessTestCandidate({ ...discriminatingTest, testRef: 'test:authority', authorityStatus: 'missing' }, hypotheses);
  assert.equal(assessment.eligible, false);
  assert.match(assessment.blockingReasons.join(' '), /authority is missing/i);
});

test('selectNextDiscriminatingTest returns only an eligible test', () => {
  const selected = selectNextDiscriminatingTest([
    { ...discriminatingTest, testRef: 'test:blocked', authorityStatus: 'missing', cost: 0 },
    { ...discriminatingTest, testRef: 'test:allowed', authorityStatus: 'authorized', humanApprovalRequired: true, humanApproved: true, cost: 2 },
  ], hypotheses);
  assert.equal(selected?.testRef, 'test:allowed');
});

test('an untested plausible testable hypothesis cannot close', () => {
  const assessment = assessHypothesisClosure({
    selectedHypothesisRef: 'hyp:a', hypotheses,
    evidenceLinks: [{ evidenceRef: 'evidence:a', hypothesisRef: 'hyp:a', sourceRef: 'source:a', polarity: 'supports', materiality: 'high' }],
    testResults: [{ resultRef: 'result:b', testRef: 'test:b', hypothesisRef: 'hyp:b', disposition: 'inconclusive', evidenceRefs: ['evidence:b'], sourceRefs: ['source:b'], completedAt: '2026-10-30T16:00:00Z' }],
    unresolvedContradictionRefs: [], uncertaintyBasis: 'Synthetic uncertainty basis.', rigorClass: 2,
  });
  assert.equal(assessment.ready, false);
  assert.match(assessment.reasons.join(' '), /cannot be concluded without a completed epistemic test result/i);
});

test('a failed test is durable but does not satisfy closure evidence', () => {
  const assessment = assessHypothesisClosure({
    selectedHypothesisRef: 'hyp:a', hypotheses,
    evidenceLinks: [{ evidenceRef: 'evidence:a', hypothesisRef: 'hyp:a', sourceRef: 'source:a', polarity: 'supports', materiality: 'high' }],
    testResults: [
      { resultRef: 'result:a:failed', testRef: 'test:a', hypothesisRef: 'hyp:a', disposition: 'failed', evidenceRefs: ['evidence:failed'], sourceRefs: ['source:a'], completedAt: '2026-10-30T16:01:00Z' },
      { resultRef: 'result:b', testRef: 'test:b', hypothesisRef: 'hyp:b', disposition: 'inconclusive', evidenceRefs: ['evidence:b'], sourceRefs: ['source:b'], completedAt: '2026-10-30T16:02:00Z' },
    ],
    unresolvedContradictionRefs: [], uncertaintyBasis: 'Synthetic uncertainty basis.', rigorClass: 2,
  });
  assert.equal(assessment.ready, false);
  assert.deepEqual(assessment.durableTestResultRefs, []);
});

test('a falsifying result forces reject disposition', () => {
  const assessment = assessHypothesisClosure({
    selectedHypothesisRef: 'hyp:a', hypotheses,
    evidenceLinks: [
      { evidenceRef: 'evidence:a', hypothesisRef: 'hyp:a', sourceRef: 'source:a', polarity: 'supports', materiality: 'high' },
      { evidenceRef: 'evidence:a:contradiction', hypothesisRef: 'hyp:a', sourceRef: 'source:a2', polarity: 'contradicts', materiality: 'high' },
    ],
    testResults: [
      { resultRef: 'result:a:falsified', testRef: 'test:a', hypothesisRef: 'hyp:a', disposition: 'falsifies', evidenceRefs: ['evidence:falsifier'], sourceRefs: ['source:a2'], completedAt: '2026-10-30T16:03:00Z' },
      { resultRef: 'result:b', testRef: 'test:b', hypothesisRef: 'hyp:b', disposition: 'supports', evidenceRefs: ['evidence:b'], sourceRefs: ['source:b'], completedAt: '2026-10-30T16:04:00Z' },
    ],
    unresolvedContradictionRefs: ['contradiction:a'], uncertaintyBasis: 'Synthetic uncertainty basis.', rigorClass: 2,
  });
  assert.equal(assessment.ready, false);
  assert.equal(assessment.disposition, 'reject');
  assert.match(assessment.reasons.join(' '), /falsifying test result rejects/i);
});

test('confirmation bias and premature closure are reported explicitly', () => {
  const bias = assessBiasControls('hyp:a', [hypotheses[0], { ...hypotheses[1], examined: false }],
    [{ evidenceRef: 'evidence:a', hypothesisRef: 'hyp:a', sourceRef: 'source:a', polarity: 'supports', materiality: 'high' }],
    [{ resultRef: 'result:a', testRef: 'test:a', hypothesisRef: 'hyp:a', disposition: 'supports', evidenceRefs: ['evidence:a'], sourceRefs: ['source:a'], completedAt: '2026-10-30T16:05:00Z' }]);
  assert.equal(bias.confirmationBiasRisk, true);
  assert.equal(bias.prematureClosureRisk, true);
  assert.deepEqual(bias.untestedPlausibleCompetitorRefs, ['hyp:b']);
});

test('R3 closure requires genuinely role-separated review', () => {
  const assessment = assessHypothesisClosure({
    selectedHypothesisRef: 'hyp:a', hypotheses,
    evidenceLinks: [
      { evidenceRef: 'evidence:a', hypothesisRef: 'hyp:a', sourceRef: 'source:a', polarity: 'supports', materiality: 'high' },
      { evidenceRef: 'evidence:a:challenge', hypothesisRef: 'hyp:a', sourceRef: 'source:a2', polarity: 'weakens', materiality: 'moderate' },
    ],
    testResults: [
      { resultRef: 'result:a', testRef: 'test:a', hypothesisRef: 'hyp:a', disposition: 'supports', evidenceRefs: ['evidence:a'], sourceRefs: ['source:a'], completedAt: '2026-10-30T16:06:00Z' },
      { resultRef: 'result:b', testRef: 'test:b', hypothesisRef: 'hyp:b', disposition: 'inconclusive', evidenceRefs: ['evidence:b'], sourceRefs: ['source:b'], completedAt: '2026-10-30T16:07:00Z' },
    ],
    unresolvedContradictionRefs: [], uncertaintyBasis: 'Synthetic uncertainty basis.', rigorClass: 3,
    review: { reviewRef: 'review:a', reviewerRef: 'agent:atlas', proposerRef: 'agent:atlas', roleSeparated: true },
  });
  assert.equal(assessment.ready, false);
  assert.match(assessment.reasons.join(' '), /role-separated reviewer/i);
});

test('counterfactual outputs must be labeled as simulation and cannot masquerade as observation', () => {
  assert.equal(assessCounterfactualArtifact({ mode: 'simulation', evidenceStatus: 'simulated', scenarioRef: 'scenario:1', sourceRefs: ['source:a'] }).allowed, true);
  const rejected = assessCounterfactualArtifact({ mode: 'observation', evidenceStatus: 'observed', scenarioRef: 'scenario:2', sourceRefs: ['source:a'] });
  assert.equal(rejected.allowed, false);
  assert.match(rejected.reasons.join(' '), /simulation/i);
});

test('material new evidence can reopen a prior conclusion without erasing it', () => {
  const assessment = assessHypothesisReopening(true, { reason: 'new_material_evidence', evidenceRef: 'evidence:new', observedAt: '2026-10-30T16:08:00Z', ownerRef: 'agent:reviewer', materiality: 'high' });
  assert.equal(assessment.reopen, true);
});
