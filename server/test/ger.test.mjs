import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GER_POLICY_VERSION,
  assessActionReadiness,
  assessConclusionReadiness,
  assessRigor,
  assessTransition,
  shouldReopen,
} from '../dist/epistemic/ger.js';

const baseline = {
  consequence: 1,
  uncertainty: 1,
  irreversibility: 1,
  authoritySensitivity: 1,
  scope: 1,
  externalImpact: 1,
};

test('GER policy has a stable version', () => {
  assert.equal(GER_POLICY_VERSION, 'ger-001-v1');
});

test('rigor is monotonic for every scored dimension', () => {
  const dimensions = [
    'consequence',
    'uncertainty',
    'irreversibility',
    'authoritySensitivity',
    'scope',
    'externalImpact',
  ];

  for (const dimension of dimensions) {
    let prior = 0;
    for (let value = 0; value <= 4; value += 1) {
      const assessment = assessRigor({ ...baseline, [dimension]: value });
      assert.ok(
        assessment.rigorClass >= prior,
        `${dimension} produced a lower rigor class when risk increased`,
      );
      prior = assessment.rigorClass;
    }
  }
});

test('unknown rigor information fails safe instead of lowering scrutiny', () => {
  const assessment = assessRigor({ ...baseline, uncertainty: null });
  assert.equal(assessment.weightedScore, null);
  assert.ok(assessment.unknownDimensions.includes('uncertainty'));
  assert.ok(assessment.rigorClass >= 3);
});

test('critical hard triggers force class 4 rigor', () => {
  const assessment = assessRigor({
    consequence: 0,
    uncertainty: 0,
    irreversibility: 0,
    authoritySensitivity: 0,
    scope: 0,
    externalImpact: 0,
    hardTriggers: ['production_change'],
  });
  assert.equal(assessment.rigorClass, 4);
});

test('high confidence never grants action authority', () => {
  const result = assessActionReadiness({
    conclusionReady: true,
    rigorClass: 1,
    confidence: 1,
    actionIsConsequential: false,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((reason) => reason.includes('authority reference')));
  assert.ok(result.reasons.some((reason) => reason.includes('capability reference')));
});

test('high-consequence action requires human approval and monitoring', () => {
  const result = assessActionReadiness({
    conclusionReady: true,
    rigorClass: 3,
    confidence: 0.99,
    authorityRef: 'authority:test',
    capabilityRef: 'capability:test',
    actionIsConsequential: true,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((reason) => reason.includes('human approval')));
  assert.ok(result.reasons.some((reason) => reason.includes('monitoring owner')));
});

test('novel connections cannot silently harden into conclusions', () => {
  const result = assessConclusionReadiness(
    {
      objectType: 'connection_candidate',
      state: 'supported',
      evidenceRefs: ['evidence:1'],
      sourceRefs: ['source:1'],
      supportingEvidenceCount: 1,
      contradictingEvidenceCount: 0,
      unresolvedContradictions: 0,
      assumptionRefs: [],
      competingHypothesesConsidered: 1,
      falsifierRefs: ['falsifier:1'],
      testResultRefs: ['test:1'],
      uncertaintyBasis: 'Bounded synthetic fixture',
      independentReviewRef: 'review:1',
    },
    3,
  );
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((reason) => reason.includes('cannot be promoted directly')));
});

test('class 3 conclusion requires alternatives, falsification, tests, and independent review', () => {
  const result = assessConclusionReadiness(
    {
      objectType: 'hypothesis',
      state: 'supported',
      evidenceRefs: ['evidence:1', 'evidence:2'],
      sourceRefs: ['source:1'],
      supportingEvidenceCount: 2,
      contradictingEvidenceCount: 0,
      unresolvedContradictions: 0,
      assumptionRefs: ['assumption:1'],
      competingHypothesesConsidered: 1,
      falsifierRefs: ['falsifier:1'],
      testResultRefs: ['test-result:1'],
      uncertaintyBasis: 'Fixture limitations retained',
      independentReviewRef: 'review:1',
    },
    3,
  );
  assert.equal(result.ready, true);
  assert.equal(result.disposition, 'conclude');
});

test('unresolved contradiction blocks clean conclusion', () => {
  const result = assessConclusionReadiness(
    {
      objectType: 'hypothesis',
      state: 'supported',
      evidenceRefs: ['evidence:1', 'evidence:2'],
      sourceRefs: ['source:1'],
      supportingEvidenceCount: 2,
      contradictingEvidenceCount: 1,
      unresolvedContradictions: 1,
      assumptionRefs: [],
      competingHypothesesConsidered: 1,
      falsifierRefs: ['falsifier:1'],
      testResultRefs: ['test-result:1'],
      uncertaintyBasis: 'Contradiction remains unresolved',
      independentReviewRef: 'review:1',
    },
    3,
  );
  assert.equal(result.ready, false);
  assert.equal(result.disposition, 'inconclusive');
});

test('state transition policy rejects unsupported skipping and permits governed reopening', () => {
  const skip = assessTransition({
    from: 'suspected',
    to: 'concluded',
    reason: 'Premature closure attempt',
    evidenceRefs: ['evidence:1'],
    actorRef: 'actor:test',
  });
  assert.equal(skip.allowed, false);

  const reopen = assessTransition({
    from: 'concluded',
    to: 'reopened',
    reason: 'Material contradictory evidence arrived',
    evidenceRefs: ['evidence:contradiction'],
    actorRef: 'actor:test',
  });
  assert.equal(reopen.allowed, true);
});

test('material reopening trigger reopens while incomplete trigger does not', () => {
  assert.equal(
    shouldReopen({
      reason: 'new_contradiction',
      evidenceRef: 'evidence:contradiction',
      observedAt: '2026-10-30T12:00:00Z',
      ownerRef: 'owner:test',
      materiality: 'high',
    }),
    true,
  );

  assert.equal(
    shouldReopen({
      reason: 'scheduled_review',
      evidenceRef: '',
      observedAt: '2026-10-30T12:00:00Z',
      ownerRef: 'owner:test',
      materiality: 'moderate',
    }),
    false,
  );
});
