import test from 'node:test';
import assert from 'node:assert/strict';
import {
  persistMissingnessFindings,
  scanMissingness,
} from '../dist/continuous-excellence/missingness.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-30T10:15:00.000Z';

function evidence(key = 'base') {
  return [{ sourceSystem: 'test', sourceRef: `test://${key}`, summary: `Evidence for ${key}` }];
}

function assessment(dimension, overrides = {}) {
  return {
    dimension,
    status: 'satisfied',
    confidence: 'verified',
    rationale: `${dimension} is satisfied`,
    evidenceRefs: evidence(dimension),
    ...overrides,
  };
}

function lowRequest(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    objective: 'Make one reversible repository change',
    proposedAction: 'Create a bounded deterministic artifact',
    consequenceLevel: 'low',
    substantialWork: false,
    authority: { state: 'authorized', evidenceRefs: evidence('authority') },
    sourceSystem: 'github',
    sourceRef: 'https://github.com/jlhogarth/CoMind/issues/364',
    observedAt: NOW,
    dependencies: [{ key: 'main', required: true, status: 'available', evidenceRefs: evidence('main') }],
    reuse: {
      status: 'checked_no_fit',
      rationale: 'Existing capabilities were checked and none directly implement this bounded scan.',
      evidenceRefs: evidence('reuse'),
    },
    ...overrides,
  };
}

const HIGH_GENERIC_DIMENSIONS = [
  'failure_modes',
  'rollback_recovery',
  'security_data_integrity',
  'observability_evidence',
  'testing_acceptance',
  'maintenance_ownership_documentation',
  'cost_provider_dependency',
  'reversibility',
];

function highRequest(overrides = {}) {
  return lowRequest({
    objective: 'Perform consequential governed work',
    proposedAction: 'Advance a high-consequence implementation after evidence-backed review',
    consequenceLevel: 'high',
    substantialWork: true,
    assumptions: [{
      key: 'baseline-current',
      statement: 'The inspected baseline is current for this action.',
      material: true,
      confidence: 'high',
      evidenceRefs: evidence('baseline-current'),
    }],
    adjacentSystems: [{
      system: 'runbook',
      affected: true,
      impactKnown: true,
      owner: 'RunBook',
      evidenceRefs: evidence('runbook-impact'),
    }],
    assessments: HIGH_GENERIC_DIMENSIONS.map(dimension => assessment(dimension)),
    ...overrides,
  });
}

test('low-consequence reversible work receives a proportionate scan', () => {
  const result = scanMissingness(lowRequest());
  assert.deepEqual(result.requiredDimensions, [
    'dependencies_prerequisites',
    'authority_approvals',
    'reusable_capability',
  ]);
  assert.equal(result.decision, 'proceed');
  assert.equal(result.proceedAllowed, true);
  assert.deepEqual(result.findings, []);
});

test('high-consequence work with complete evidence has no false blocker', () => {
  const result = scanMissingness(highRequest());
  assert.equal(result.decision, 'proceed');
  assert.equal(result.confidence, 'verified');
  assert.equal(result.findings.length, 0);
  assert.ok(result.requiredDimensions.includes('security_data_integrity'));
  assert.ok(result.requiredDimensions.includes('testing_acceptance'));
});

test('unknown authority blocks consequential action', () => {
  const result = scanMissingness(lowRequest({
    authority: { state: 'unknown', evidenceRefs: evidence('authority-unknown') },
  }));
  assert.equal(result.decision, 'blocked');
  assert.equal(result.proceedAllowed, false);
  assert.ok(result.findings.some(item => item.code === 'AUTHORITY_UNKNOWN' && item.blocking));
});

test('explicit approval boundary blocks without granting authority', () => {
  const result = scanMissingness(lowRequest({
    authority: {
      state: 'requires_approval',
      evidenceRefs: evidence('approval-boundary'),
      approvalRef: 'approval://human-required',
    },
  }));
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'AUTHORITY_APPROVAL_REQUIRED'));
});

test('missing rollback evidence blocks high-consequence work', () => {
  const request = highRequest();
  request.assessments = request.assessments.map(item => item.dimension === 'rollback_recovery'
    ? assessment('rollback_recovery', {
      status: 'gap',
      confidence: 'verified',
      rationale: 'No rollback or compensation path is yet established.',
      evidenceRefs: evidence('rollback-gap'),
      nextAction: 'Define and verify rollback before execution.',
    })
    : item);
  const result = scanMissingness(request);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.dimension === 'rollback_recovery' && item.blocking));
});

test('weak material assumption is surfaced and blocks high-consequence work', () => {
  const result = scanMissingness(highRequest({
    assumptions: [{
      key: 'provider-behavior',
      statement: 'The external provider will preserve the required behavior.',
      material: true,
      confidence: 'low',
      evidenceRefs: evidence('provider-assumption'),
    }],
  }));
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'ASSUMPTION_WEAK'));
});

test('unavailable required dependency is surfaced instead of becoming invented success', () => {
  const result = scanMissingness(highRequest({
    dependencies: [{
      key: 'authoritative-ci',
      required: true,
      status: 'unavailable',
      evidenceRefs: evidence('ci-unavailable'),
    }],
  }));
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'DEPENDENCY_UNAVAILABLE'));
});

test('affected adjacent system with unknown impact or owner is surfaced', () => {
  const result = scanMissingness(highRequest({
    adjacentSystems: [{
      system: 'downstream-runtime',
      affected: true,
      impactKnown: false,
      owner: null,
      evidenceRefs: evidence('downstream-runtime'),
    }],
  }));
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'ADJACENT_IMPACT_UNRESOLVED'));
});

test('missing verification and acceptance assessment blocks substantial work', () => {
  const request = highRequest();
  request.assessments = request.assessments.filter(item => item.dimension !== 'testing_acceptance');
  const result = scanMissingness(request);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'REQUIRED_DIMENSION_UNASSESSED'
    && item.dimension === 'testing_acceptance'));
});

test('required satisfied assessment without provenance fails closed', () => {
  const request = highRequest();
  request.assessments = request.assessments.map(item => item.dimension === 'security_data_integrity'
    ? assessment('security_data_integrity', { evidenceRefs: [] })
    : item);
  const result = scanMissingness(request);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'REQUIRED_DIMENSION_PROVENANCE_MISSING'
    && item.dimension === 'security_data_integrity'));
});

test('costly hard-to-reverse commitment without preserved alternative is surfaced', () => {
  const result = scanMissingness(highRequest({
    flags: { longLivedArchitecture: true },
    commitments: [{
      key: 'architecture-lock-in',
      description: 'Adopt a difficult-to-replace architecture boundary.',
      costLevel: 'high',
      reversibility: 'hard',
      alternativePreserved: false,
      reconsiderationTrigger: null,
      evidenceRefs: evidence('architecture-lock-in'),
    }],
  }));
  assert.ok(result.findings.some(item => item.code === 'COMMITMENT_OPTIONALITY_WEAK'));
  assert.equal(result.decision, 'proceed_with_attention');
});

test('reuse check blocks substantial parallel-system reinvention', () => {
  const result = scanMissingness(highRequest({
    reuse: {
      status: 'not_checked',
      rationale: 'No reuse review has occurred.',
      evidenceRefs: evidence('reuse-not-checked'),
    },
  }));
  assert.equal(result.decision, 'blocked');
  assert.ok(result.findings.some(item => item.code === 'REUSE_NOT_CHECKED'));
});

test('material low-cost option preservation is surfaced without blocking', () => {
  const result = scanMissingness(highRequest({
    opportunities: [{
      key: 'preserve-portable-contract',
      description: 'Retain a provider-neutral interface before the implementation becomes expensive to change.',
      material: true,
      implementationCost: 'low',
      preservesOption: true,
      evidenceRefs: evidence('portable-contract'),
    }],
  }));
  assert.equal(result.decision, 'proceed_with_attention');
  assert.equal(result.proceedAllowed, true);
  assert.ok(result.findings.some(item => item.code === 'LOW_COST_OPTION_PRESERVATION' && !item.blocking));
});

test('equivalent input order produces stable scan and finding fingerprints', () => {
  const firstRequest = highRequest({
    opportunities: [
      {
        key: 'b', description: 'Preserve option B.', material: true, implementationCost: 'low', preservesOption: true,
        evidenceRefs: evidence('b'),
      },
      {
        key: 'a', description: 'Preserve option A.', material: true, implementationCost: 'low', preservesOption: true,
        evidenceRefs: evidence('a'),
      },
    ],
  });
  const secondRequest = {
    ...firstRequest,
    assessments: [...firstRequest.assessments].reverse(),
    dependencies: [...firstRequest.dependencies].reverse(),
    opportunities: [...firstRequest.opportunities].reverse(),
  };
  const first = scanMissingness(firstRequest);
  const second = scanMissingness(secondRequest);
  assert.equal(first.scanFingerprint, second.scanFingerprint);
  assert.deepEqual(first.findings.map(item => item.fingerprint), second.findings.map(item => item.fingerprint));
});

test('contradictory assessment is rejected rather than normalized by plausibility', () => {
  assert.throws(() => scanMissingness(highRequest({
    assessments: [
      ...HIGH_GENERIC_DIMENSIONS.filter(dimension => dimension !== 'security_data_integrity').map(dimension => assessment(dimension)),
      assessment('security_data_integrity', { status: 'satisfied', confidence: 'uncertain' }),
    ],
  })), /Contradictory CE-003 assessment/);
});

test('persistence reuses CE-001 idempotency and replay creates no duplicate signal', async () => {
  const request = lowRequest({
    authority: { state: 'unknown', evidenceRefs: evidence('authority-unknown') },
  });
  const result = scanMissingness(request);
  assert.equal(result.findings.length, 1);

  const stored = new Map();
  let writes = 0;
  const sqlSeen = [];
  const query = async (sql, params = []) => {
    sqlSeen.push(sql);
    if (sql.includes('FROM comind.cm_ce_signal')) {
      const id = stored.get(params[1]);
      return { rows: id ? [{ signal_id: id }] : [] };
    }
    if (sql.includes('comind.record_ce_signal')) {
      writes += 1;
      const id = '33333333-3333-4333-8333-333333333333';
      stored.set(params[9], id);
      return { rows: [{ signal_id: id }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const first = await persistMissingnessFindings(query, request, result);
  const second = await persistMissingnessFindings(query, request, result);
  assert.equal(first.persisted.length, 1);
  assert.equal(first.persisted[0].replayed, false);
  assert.equal(second.persisted[0].replayed, true);
  assert.equal(second.replayedCount, 1);
  assert.equal(writes, 1);
  assert.equal(sqlSeen.some(sql => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql)), false);
});

test('tampered scan result is rejected before persistence', async () => {
  const request = lowRequest({
    authority: { state: 'unknown', evidenceRefs: evidence('authority-unknown') },
  });
  const result = scanMissingness(request);
  const tampered = {
    ...result,
    findings: result.findings.map(item => ({ ...item, summary: 'tampered' })),
  };
  let queries = 0;
  const query = async () => {
    queries += 1;
    return { rows: [] };
  };
  await assert.rejects(() => persistMissingnessFindings(query, request, tampered), /does not match/);
  assert.equal(queries, 0);
});
