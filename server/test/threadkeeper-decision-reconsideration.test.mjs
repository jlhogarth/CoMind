import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDecisionReconsiderationRecord,
  createDecisionReconsiderationReviewRequest,
  evaluateDecisionReconsiderationTrigger,
  verifyDecisionReconsiderationRecord,
} from '../dist/continuity/reconsideration.js';

function thresholdCondition(id = 'condition:price') {
  return {
    conditionId: id,
    kind: 'threshold',
    metricRef: 'metric:provider-request-cost-usd',
    operator: 'lte',
    threshold: 0.02,
    unitRef: 'USD/request',
  };
}

function stateCondition(id = 'condition:capability') {
  return {
    conditionId: id,
    kind: 'external_state',
    subjectRef: 'provider:alternative-x',
    expectedStateRef: 'state:governed-export-supported',
  };
}

function trigger(overrides = {}) {
  return {
    triggerId: overrides.triggerId ?? 'trigger:reconsider-alternative-x',
    targetAlternativeRefs: overrides.targetAlternativeRefs ?? ['alternative:provider-x'],
    conditions: overrides.conditions ?? [thresholdCondition(), stateCondition()],
    matchPolicy: 'all',
    evidenceRefs: overrides.evidenceRefs ?? ['evidence:decision:reconsideration-condition'],
    sourceRef: overrides.sourceRef ?? 'decision:provider-selection',
    createdAt: overrides.createdAt ?? '2026-10-29T17:30:00.000Z',
    status: overrides.status ?? 'current',
  };
}

function record(overrides = {}) {
  return createDecisionReconsiderationRecord({
    scopeSemanticKey: overrides.scopeSemanticKey ?? 'decision-scope:provider-selection',
    checkpointId: overrides.checkpointId ?? 'checkpoint:provider-selection:1',
    decisionRef: overrides.decisionRef ?? 'decision:provider-selection',
    selectedOptionRef: overrides.selectedOptionRef ?? 'alternative:provider-y',
    rationaleRefs: overrides.rationaleRefs ?? ['rationale:provider-y-current-fit'],
    analysis: overrides.analysis ?? {
      supportRefs: ['analysis:support:provider-y'],
      defeatRefs: ['analysis:defeat:provider-y'],
      choosingCostRefs: ['analysis:cost:choose-y'],
      rejectingCostRefs: ['analysis:cost:reject-y'],
    },
    rejectedAlternatives: overrides.rejectedAlternatives ?? [
      {
        alternativeRef: 'alternative:provider-x',
        rejectionReasonRefs: ['reason:provider-x-too-expensive', 'reason:provider-x-missing-export'],
      },
      {
        alternativeRef: 'alternative:provider-z',
        rejectionReasonRefs: ['reason:provider-z-lock-in'],
      },
    ],
    triggers: overrides.triggers ?? [trigger()],
    authorityEvidenceRefs: overrides.authorityEvidenceRefs ?? ['authority:founder:decision-provider-selection'],
    policyRefs: overrides.policyRefs ?? ['policy:four-sided-decision-framework'],
  });
}

function observation(id, conditionId, value, overrides = {}) {
  return {
    observationId: id,
    triggerId: overrides.triggerId ?? 'trigger:reconsider-alternative-x',
    conditionId,
    assertionMode: overrides.assertionMode ?? 'explicit_evidence',
    disposition: overrides.disposition ?? 'observed',
    value: overrides.disposition === 'invalidated' ? null : value,
    observedAt: overrides.observedAt ?? '2026-10-29T18:00:00.000Z',
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${id}`],
    sourceRef: overrides.sourceRef ?? `source:${id}`,
  };
}

test('TK-011 decision record preserves four-sided analysis and rejected alternatives deterministically', () => {
  const first = record();
  const second = record({
    rationaleRefs: ['rationale:provider-y-current-fit'],
    rejectedAlternatives: [...record().rejectedAlternatives].reverse(),
    triggers: [trigger({
      targetAlternativeRefs: ['alternative:provider-x'],
      conditions: [stateCondition(), thresholdCondition()],
    })],
  });

  assert.equal(first.recordDigest, second.recordDigest);
  assert.equal(verifyDecisionReconsiderationRecord(first), true);
  assert.deepEqual(first.analysis, {
    supportRefs: ['analysis:support:provider-y'],
    defeatRefs: ['analysis:defeat:provider-y'],
    choosingCostRefs: ['analysis:cost:choose-y'],
    rejectingCostRefs: ['analysis:cost:reject-y'],
  });
  assert.equal(first.rejectedAlternatives.length, 2);

  const tampered = structuredClone(first);
  tampered.selectedOptionRef = 'alternative:provider-x';
  assert.equal(verifyDecisionReconsiderationRecord(tampered), false);
});

test('TK-011 rejects malformed alternatives, unknown targets, duplicate conditions, and unsupported matching', () => {
  assert.throws(() => record({
    selectedOptionRef: 'alternative:provider-x',
  }), /Selected option cannot also be a rejected alternative/);

  assert.throws(() => record({
    triggers: [trigger({ targetAlternativeRefs: ['alternative:unknown'] })],
  }), /unknown rejected alternative/);

  assert.throws(() => record({
    triggers: [trigger({ conditions: [thresholdCondition('condition:x'), thresholdCondition('condition:x')] })],
  }), /Duplicate reconsideration condition id/);

  assert.throws(() => record({
    triggers: [{ ...trigger(), matchPolicy: 'any' }],
  }), /Only all-condition/);

  assert.throws(() => record({
    rejectedAlternatives: [{ alternativeRef: 'alternative:provider-x', rejectionReasonRefs: [] }],
    triggers: [trigger()],
  }), /Invalid rejection reason references/);
});

test('TK-011 compound trigger moves from unresolved to partial to satisfied using explicit evidence', () => {
  const decision = record();

  const none = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(none.status, 'UNRESOLVED');

  const price = observation('obs:price', 'condition:price', {
    kind: 'threshold',
    metricRef: 'metric:provider-request-cost-usd',
    value: 0.019,
    unitRef: 'USD/request',
  });
  const partial = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [price],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(partial.status, 'PARTIALLY_SATISFIED');
  assert.equal(partial.conditions.find(item => item.conditionId === 'condition:price').status, 'SATISFIED');

  const capability = observation('obs:capability', 'condition:capability', {
    kind: 'external_state',
    subjectRef: 'provider:alternative-x',
    stateRef: 'state:governed-export-supported',
  });
  const satisfied = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [price, capability],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(satisfied.status, 'SATISFIED');
  assert.deepEqual(satisfied.targetAlternativeRefs, ['alternative:provider-x']);
});

test('TK-011 wrong values remain unresolved and never manufacture satisfaction', () => {
  const decision = record();
  const expensive = observation('obs:price', 'condition:price', {
    kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.03, unitRef: 'USD/request',
  });
  const wrongState = observation('obs:state', 'condition:capability', {
    kind: 'external_state', subjectRef: 'provider:alternative-x', stateRef: 'state:export-unsupported',
  });
  const result = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [expensive, wrongState],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(result.status, 'UNRESOLVED');
  assert.ok(result.conditions.every(item => item.status === 'NOT_SATISFIED'));

  const wrongUnit = observation('obs:wrong-unit', 'condition:price', {
    kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.001, unitRef: 'USD/month',
  });
  const wrongUnitResult = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [wrongUnit],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(wrongUnitResult.status, 'UNRESOLVED');
});

test('TK-011 latest explicit invalidation prevents stale evidence from satisfying a trigger', () => {
  const decision = record({
    triggers: [trigger({ conditions: [thresholdCondition()] })],
  });
  const first = observation('obs:price:1', 'condition:price', {
    kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.01, unitRef: 'USD/request',
  }, { observedAt: '2026-10-29T18:00:00.000Z' });
  const invalidated = observation('obs:price:2', 'condition:price', null, {
    disposition: 'invalidated',
    observedAt: '2026-10-29T18:05:00.000Z',
    evidenceRefs: ['evidence:price-source-retracted'],
  });
  const result = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [first, invalidated],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(result.status, 'INVALIDATED');
  assert.equal(result.conditions[0].status, 'INVALIDATED');
});

test('TK-011 evaluates policy, dependency, evidence-arrival, and expiry conditions deterministically', () => {
  const decision = record({
    triggers: [trigger({
      triggerId: 'trigger:complex',
      conditions: [
        { conditionId: 'condition:policy', kind: 'policy_change', policyRef: 'policy:api-cost', fromVersionRef: 'v1', toVersionRef: 'v2' },
        { conditionId: 'condition:dependency', kind: 'dependency_change', dependencyScopeSemanticKey: 'scope:provider-contract', fromCheckpointId: 'cp:1', toCheckpointId: 'cp:2' },
        { conditionId: 'condition:evidence', kind: 'evidence_arrival', evidenceClassRef: 'evidence-class:independent-benchmark' },
        { conditionId: 'condition:expiry', kind: 'expiry', notBefore: '2026-10-30T00:00:00.000Z' },
      ],
    })],
  });
  const observations = [
    observation('obs:policy', 'condition:policy', { kind: 'policy_change', policyRef: 'policy:api-cost', fromVersionRef: 'v1', toVersionRef: 'v2' }, { triggerId: 'trigger:complex' }),
    observation('obs:dependency', 'condition:dependency', { kind: 'dependency_change', dependencyScopeSemanticKey: 'scope:provider-contract', fromCheckpointId: 'cp:1', toCheckpointId: 'cp:2' }, { triggerId: 'trigger:complex' }),
    observation('obs:evidence', 'condition:evidence', { kind: 'evidence_arrival', evidenceClassRef: 'evidence-class:independent-benchmark' }, { triggerId: 'trigger:complex' }),
  ];

  const beforeExpiry = evaluateDecisionReconsiderationTrigger(decision, 'trigger:complex', observations, '2026-10-29T23:59:59.000Z');
  assert.equal(beforeExpiry.status, 'PARTIALLY_SATISFIED');
  const afterExpiry = evaluateDecisionReconsiderationTrigger(decision, 'trigger:complex', observations, '2026-10-30T00:00:00.000Z');
  assert.equal(afterExpiry.status, 'SATISFIED');
});

test('TK-011 observations require explicit evidence and correct condition kinds', () => {
  const decision = record({ triggers: [trigger({ conditions: [thresholdCondition()] })] });
  assert.throws(() => evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [observation('obs:bad-mode', 'condition:price', {
      kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.01, unitRef: 'USD/request',
    }, { assertionMode: 'model_guess' })],
    '2026-10-29T18:10:00.000Z'
  ), /explicit evidence/);

  assert.throws(() => evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [observation('obs:wrong-kind', 'condition:price', {
      kind: 'external_state', subjectRef: 'provider:alternative-x', stateRef: 'state:any',
    })],
    '2026-10-29T18:10:00.000Z'
  ), /does not match/);

  assert.throws(() => evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [observation('obs:unknown-condition', 'condition:unknown', {
      kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.01, unitRef: 'USD/request',
    })],
    '2026-10-29T18:10:00.000Z'
  ), /unknown reconsideration condition/);
});

test('TK-011 retired triggers are invalidated even if old observations match', () => {
  const decision = record({
    triggers: [trigger({ status: 'retired', conditions: [thresholdCondition()] })],
  });
  const price = observation('obs:price', 'condition:price', {
    kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.01, unitRef: 'USD/request',
  });
  const result = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [price],
    '2026-10-29T18:10:00.000Z'
  );
  assert.equal(result.status, 'INVALIDATED');
});

test('TK-011 satisfied triggers can only request independent review, never change the decision automatically', () => {
  const decision = record({ triggers: [trigger({ conditions: [thresholdCondition()] })] });
  const unsatisfied = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [],
    '2026-10-29T18:10:00.000Z'
  );
  assert.throws(() => createDecisionReconsiderationReviewRequest(decision, unsatisfied), /Only a satisfied/);

  const price = observation('obs:price', 'condition:price', {
    kind: 'threshold', metricRef: 'metric:provider-request-cost-usd', value: 0.01, unitRef: 'USD/request',
  });
  const satisfied = evaluateDecisionReconsiderationTrigger(
    decision,
    'trigger:reconsider-alternative-x',
    [price],
    '2026-10-29T18:10:00.000Z'
  );
  const review = createDecisionReconsiderationReviewRequest(decision, satisfied);
  assert.equal(review.recommendedRoute, 'OPEN_CONTINUITY_REVIEW');
  assert.equal(review.authorityMode, 'requires_independent_review');
  assert.equal(review.automaticDecisionChange, false);
  assert.equal(review.decisionRef, decision.decisionRef);
  assert.deepEqual(review.targetAlternativeRefs, ['alternative:provider-x']);

  const tampered = { ...satisfied, status: 'SATISFIED', decisionRef: 'decision:other' };
  assert.throws(() => createDecisionReconsiderationReviewRequest(decision, tampered), /does not belong/);
});
