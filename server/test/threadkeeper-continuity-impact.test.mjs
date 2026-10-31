import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeContinuityImpact,
  analyzeCumulativeContinuityDrift,
  classifyContinuityDebt,
  createContinuityImpactProjection,
  verifyContinuityImpactProjection,
} from '../dist/continuity/impact.js';
import { createContinuityCapsule } from '../dist/continuity/capsule.js';
import { fingerprintCanonicalValue } from '../dist/continuity/checkpoint.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

function makeHandoff({ checkpointId, parentCheckpointId = null, acceptedAt, lineage, unresolvedCases = [] }) {
  const canonical = {
    version: 'continuity-handoff-v1',
    scopeSemanticKey: 'plan:tk009:drift',
    currentCheckpoint: {
      checkpointId,
      parentCheckpointId,
      persistenceSeq: String(lineage.length),
      acceptedAt,
      acceptedByRef: 'actor:founder',
      authorityEvidenceRef: 'authority:tk009',
      policyRef: 'policy:continuity',
      stateDigest: HEX_A,
      proposalDigest: HEX_B,
    },
    lineage: { checkpointIds: lineage, depth: lineage.length },
    unresolvedCases,
  };
  return {
    ...canonical,
    continuityDigest: fingerprintCanonicalValue(canonical),
    consumer: {
      consumerRef: 'consumer:tk009:test',
      providerRef: 'provider:test',
      actorRef: 'actor:test',
      authorityMode: 'requires_independent_validation',
      resolvedAt: acceptedAt,
    },
  };
}

function makeCapsule({
  checkpointId,
  parentCheckpointId = null,
  acceptedAt,
  lineage,
  objectiveRefs = ['objective:original'],
  decisionRefs = ['decision:accepted'],
  assumptionRefs = ['assumption:a'],
  obligationRefs = ['obligation:a'],
  prohibitedActionRefs = ['prohibition:a'],
  openQuestionRefs = ['question:a'],
  evidenceRefs = ['evidence:a'],
  authorityEvidenceRefs = ['authority:consumer'],
  policyRefs = ['policy:propagation'],
  sensitivity = 'confidential',
  retentionClass = 'durable',
  unresolvedCases = [],
}) {
  return createContinuityCapsule({
    handoff: makeHandoff({ checkpointId, parentCheckpointId, acceptedAt, lineage, unresolvedCases }),
    references: {
      objectiveRefs,
      decisionRefs,
      assumptionRefs,
      obligationRefs,
      prohibitedActionRefs,
      openQuestionRefs,
      evidenceRefs,
    },
    authorityEvidenceRefs,
    policyRefs,
    sensitivity,
    retentionClass,
    issuedAt: acceptedAt,
    expiresAt: new Date(Date.parse(acceptedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
}

function edge(id, dependency, dependent, overrides = {}) {
  return {
    edgeId: id,
    dependencyScopeSemanticKey: dependency,
    dependentScopeSemanticKey: dependent,
    relationshipKind: overrides.relationshipKind ?? 'depends_on',
    assertionMode: overrides.assertionMode ?? 'explicit_evidence',
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${id}`],
    sourceRef: overrides.sourceRef ?? `edg:${id}`,
    observedAt: overrides.observedAt ?? '2026-10-29T16:00:00.000Z',
    status: overrides.status ?? 'current',
  };
}

test('TK-009 projection is deterministic and rejects inferred, self, unevidenced, and duplicate edges', () => {
  const first = createContinuityImpactProjection([
    edge('e2', 'scope:b', 'scope:c'),
    edge('e1', 'scope:a', 'scope:b'),
  ]);
  const second = createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:b'),
    edge('e2', 'scope:b', 'scope:c'),
  ]);
  assert.equal(first.projectionDigest, second.projectionDigest);
  assert.equal(verifyContinuityImpactProjection(first), true);

  assert.throws(() => createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:b', { assertionMode: 'model_inference' }),
  ]), /explicit evidence/i);
  assert.throws(() => createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:a'),
  ]), /self-edge/i);
  assert.throws(() => createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:b', { evidenceRefs: [] }),
  ]), /requires evidence/i);
  assert.throws(() => createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:b'),
    edge('e1', 'scope:a', 'scope:c'),
  ]), /Duplicate continuity dependency edge id/);
});

test('TK-009 impact finds deterministic transitive blast radius, ignores retired edges, and reports cycles', () => {
  const projection = createContinuityImpactProjection([
    edge('e1', 'scope:architecture', 'scope:foundry'),
    edge('e2', 'scope:foundry', 'scope:ve'),
    edge('e3', 'scope:ve', 'scope:console'),
    edge('e4', 'scope:console', 'scope:architecture'),
    edge('e5', 'scope:architecture', 'scope:retired-consumer', { status: 'retired' }),
  ]);
  const report = analyzeContinuityImpact(projection, 'scope:architecture');
  assert.deepEqual(report.impacted.map(item => [item.scopeSemanticKey, item.depth]), [
    ['scope:foundry', 1],
    ['scope:ve', 2],
    ['scope:console', 3],
  ]);
  assert.deepEqual(report.cycleEdgeIds, ['e4']);
  assert.equal(report.truncated, false);
  assert.equal(report.impacted.some(item => item.scopeSemanticKey === 'scope:retired-consumer'), false);
});

test('TK-009 impact traversal is explicitly bounded', () => {
  const projection = createContinuityImpactProjection([
    edge('e1', 'scope:a', 'scope:b'),
    edge('e2', 'scope:b', 'scope:c'),
    edge('e3', 'scope:c', 'scope:d'),
  ]);
  const report = analyzeContinuityImpact(projection, 'scope:a', 2);
  assert.deepEqual(report.impacted.map(item => item.scopeSemanticKey), ['scope:b', 'scope:c']);
  assert.equal(report.truncated, true);
  assert.throws(() => analyzeContinuityImpact(projection, 'scope:a', 33), /maximum depth/i);
});

test('TK-009 cumulative drift distinguishes stable, changed-with-lineage, cumulative risk, and protected-semantic loss', () => {
  const c1 = makeCapsule({
    checkpointId: 'cp:1', acceptedAt: '2026-10-29T12:00:00.000Z', lineage: ['cp:1'],
  });
  const c2Stable = makeCapsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T13:00:00.000Z', lineage: ['cp:1', 'cp:2'],
  });
  assert.equal(analyzeCumulativeContinuityDrift([c1, c2Stable]).classification, 'stable');

  const c2Changed = makeCapsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T13:00:00.000Z', lineage: ['cp:1', 'cp:2'],
    assumptionRefs: ['assumption:a', 'assumption:b'],
  });
  assert.equal(analyzeCumulativeContinuityDrift([c1, c2Changed]).classification, 'changed_with_lineage');

  const c3Changed = makeCapsule({
    checkpointId: 'cp:3', parentCheckpointId: 'cp:2', acceptedAt: '2026-10-29T14:00:00.000Z', lineage: ['cp:1', 'cp:2', 'cp:3'],
    assumptionRefs: ['assumption:a', 'assumption:b', 'assumption:c'],
  });
  const accumulating = analyzeCumulativeContinuityDrift([c1, c2Changed, c3Changed]);
  assert.equal(accumulating.classification, 'cumulative_drift_risk');
  assert.ok(accumulating.indicators.includes('repeated_semantic_change'));

  const c3Lost = makeCapsule({
    checkpointId: 'cp:3', parentCheckpointId: 'cp:2', acceptedAt: '2026-10-29T14:00:00.000Z', lineage: ['cp:1', 'cp:2', 'cp:3'],
    objectiveRefs: [],
    decisionRefs: [],
    obligationRefs: [],
    prohibitedActionRefs: [],
    evidenceRefs: [],
  });
  const broken = analyzeCumulativeContinuityDrift([c1, c2Changed, c3Lost]);
  assert.equal(broken.classification, 'continuity_break_risk');
  assert.ok(broken.indicators.includes('baseline_objective_lost'));
  assert.ok(broken.indicators.includes('baseline_decision_lost'));
  assert.ok(broken.indicators.includes('baseline_obligation_lost'));
  assert.ok(broken.indicators.includes('baseline_prohibition_lost'));
  assert.ok(broken.indicators.includes('baseline_evidence_lost'));
});

test('TK-009 drift rejects discontinuous or cross-scope checkpoint histories', () => {
  const c1 = makeCapsule({ checkpointId: 'cp:1', acceptedAt: '2026-10-29T12:00:00.000Z', lineage: ['cp:1'] });
  const discontinuous = makeCapsule({
    checkpointId: 'cp:3', parentCheckpointId: 'cp:other', acceptedAt: '2026-10-29T13:00:00.000Z', lineage: ['cp:other', 'cp:3'],
  });
  assert.throws(() => analyzeCumulativeContinuityDrift([c1, discontinuous]), /direct accepted checkpoint lineage/i);

  const crossScope = structuredClone(makeCapsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T13:00:00.000Z', lineage: ['cp:1', 'cp:2'],
  }));
  crossScope.scopeSemanticKey = 'plan:other';
  assert.throws(() => analyzeCumulativeContinuityDrift([c1, crossScope]), /Invalid continuity capsule|multiple scopes/i);
});

test('TK-009 drift detects weakening and accumulating unresolved continuity cases', () => {
  const c1 = makeCapsule({ checkpointId: 'cp:1', acceptedAt: '2026-10-29T12:00:00.000Z', lineage: ['cp:1'] });
  const c2 = makeCapsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T13:00:00.000Z', lineage: ['cp:1', 'cp:2'],
    sensitivity: 'public',
    retentionClass: 'transient',
    unresolvedCases: [{
      caseId: 'case:2', caseKey: 'case:key:2', state: 'UNRESOLVED', latestTransitionId: 'tx:2', lastTransitionAt: '2026-10-29T12:30:00.000Z',
    }],
  });
  const report = analyzeCumulativeContinuityDrift([c1, c2]);
  assert.equal(report.classification, 'continuity_break_risk');
  assert.ok(report.indicators.includes('sensitivity_weakened'));
  assert.ok(report.indicators.includes('retention_changed'));
  assert.ok(report.indicators.includes('unresolved_cases_accumulating'));
});

test('TK-009 continuity debt uses explicit categories without an opaque score', () => {
  const clear = classifyContinuityDebt({});
  assert.equal(clear.status, 'CLEAR');
  assert.equal(clear.totalItems, 0);

  const attention = classifyContinuityDebt({
    incompleteHandoffRefs: ['handoff:1'],
    expiringAuthorityRefs: ['authority:soon'],
    outdatedAssumptionRefs: ['assumption:old'],
  });
  assert.equal(attention.status, 'ATTENTION');
  assert.equal(attention.blockingItems, 0);
  assert.equal(attention.totalItems, 3);

  const blocked = classifyContinuityDebt({
    staleCheckpointRefs: ['checkpoint:stale'],
    unresolvedConflictRefs: ['case:conflict'],
    missingProvenanceRefs: ['evidence:missing'],
    fidelityFailureRefs: ['fidelity:failed'],
    reassessmentScopeRefs: ['scope:downstream'],
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.blockingItems, 4);
  assert.equal(blocked.counts.reassessment_required, 1);
  assert.equal('score' in blocked, false);
});
