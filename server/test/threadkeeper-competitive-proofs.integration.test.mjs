import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

import { assessContinuity } from '../dist/threadkeeper/assessment.js';
import { createCheckpointProposal } from '../dist/threadkeeper/checkpoint.js';
import { semanticScopeKey } from '../dist/threadkeeper/scope.js';

const scopeBinding = {
  scopeType: 'plan',
  namespace: 'comind.competitive.proofs',
  subjectRef: `plan:cp01-cp02-cp03:${process.pid}`,
};

const evidence = [{ provider: 'competitive-proof', kind: 'fixture', ref: 'evidence:cp03:authorized-change' }];
const authority = {
  valid: true,
  source: 'external',
  actorRef: 'founder:competitive-proof',
  evidenceRef: 'authority:competitive-proof:founder',
  policyRef: 'policy:competitive-proof:continuity',
};

const state = suffix => ({
  objectiveRefs: ['objective:competitive-continuity'],
  decisionRefs: [`decision:${suffix}`],
  commitmentRefs: ['commitment:preserve-governed-lineage'],
  obligationRefs: [`obligation:${suffix}`],
  contextRefs: ['context:competitive-proof'],
  evidenceRefs: evidence,
  sourceRefs: [{ provider: 'competitive-proof', kind: 'source', ref: `source:${suffix}` }],
  sensitivity: 'internal',
  retentionClass: 'durable',
});

const signals = overrides => ({
  scopeStatus: 'valid',
  requiredEvidenceStatus: 'available',
  acceptedBaselinePresent: true,
  checkpointIntegrityValid: true,
  checkpointAuthorityValid: true,
  predecessorStatus: 'valid',
  authoritativeConflict: false,
  authorizedChange: false,
  materialChange: false,
  incompatibilityProven: false,
  ...overrides,
});

function checkpointProposal({ id, parentCheckpointId, suffix, proposedAt }) {
  return createCheckpointProposal({
    proposalId: id,
    scopeSemanticKey: semanticScopeKey(scopeBinding),
    parentCheckpointId,
    currentAcceptedCheckpointId: parentCheckpointId,
    proposedAt,
    proposedByRef: 'actor:competitive-proof:proposer',
    policyRef: 'policy:competitive-proof:continuity',
    state: state(suffix),
  });
}

test('CP-03 stale state is never current and CP-01/CP-02 handoff state survives provider and actor substitution', {
  skip: process.env.THREADKEEPER_ISOLATED_DB_TEST !== '1',
}, async () => {
  const { closePool } = await import('../dist/db.js');
  const {
    appendCaseTransition,
    openContinuityCase,
    persistAcceptedCheckpoint,
    persistAssessment,
    registerContinuityScope,
  } = await import('../dist/threadkeeper/repository.js');
  const {
    ContinuityHandoffError,
    resolveContinuityHandoff,
  } = await import('../dist/continuity/handoff.js');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const query = async (sql, params) => ({ rows: (await pool.query(sql, params)).rows });

  try {
    const semanticKey = semanticScopeKey(scopeBinding);
    await registerContinuityScope(
      query,
      scopeBinding,
      'actor:competitive-proof:setup',
      'internal',
      'durable'
    );

    const proposalA = checkpointProposal({
      id: `proposal:cp03:a:${process.pid}`,
      parentCheckpointId: null,
      suffix: 'A',
      proposedAt: '2026-10-27T02:00:00.000Z',
    });
    const checkpointA = await persistAcceptedCheckpoint(
      proposalA,
      authority,
      '2026-10-27T02:01:00.000Z'
    );

    const assessment = assessContinuity({
      scopeSemanticKey: semanticKey,
      checkpointId: checkpointA.checkpointId,
      observationId: `observation:cp03:authorized-change:${process.pid}`,
      evidenceRefs: evidence,
      signals: signals({ authorizedChange: true, materialChange: true }),
    });
    const storedAssessment = await persistAssessment(query, {
      idempotencyKey: `assessment:cp03:${process.pid}`,
      assessment,
      createdAt: '2026-10-27T02:02:00.000Z',
    });

    const opened = await openContinuityCase({
      caseKey: `case:cp03:${process.pid}`,
      scopeSemanticKey: semanticKey,
      openedFromAssessmentId: storedAssessment.assessment_id,
      openedAt: '2026-10-27T02:03:00.000Z',
      openedByRef: 'actor:competitive-proof:observer',
      evidenceRefs: evidence,
    });
    const assessed = await appendCaseTransition({
      transitionKey: `transition:cp03:assessed:${process.pid}`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: opened.transition.transition_id,
      toState: 'ASSESSED',
      actorRef: 'actor:competitive-proof:assessor',
      evidenceRefs: evidence,
      recordedAt: '2026-10-27T02:04:00.000Z',
    });
    const routed = await appendCaseTransition({
      transitionKey: `transition:cp03:routed:${process.pid}`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: assessed.transition_id,
      toState: 'ROUTED',
      routeCode: 'REQUEST_HUMAN_REVIEW',
      actorRef: 'actor:competitive-proof:router',
      evidenceRefs: evidence,
      recordedAt: '2026-10-27T02:05:00.000Z',
    });

    const proposalB = checkpointProposal({
      id: `proposal:cp03:b:${process.pid}`,
      parentCheckpointId: checkpointA.checkpointId,
      suffix: 'B',
      proposedAt: '2026-10-27T02:06:00.000Z',
    });
    const checkpointB = await persistAcceptedCheckpoint(
      proposalB,
      authority,
      '2026-10-27T02:07:00.000Z'
    );

    const accepted = await appendCaseTransition({
      transitionKey: `transition:cp03:accepted-divergence:${process.pid}`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: routed.transition_id,
      toState: 'ACCEPTED_DIVERGENCE',
      actorRef: authority.actorRef,
      authorityEvidenceRef: authority.evidenceRef,
      successorCheckpointId: checkpointB.checkpointId,
      evidenceRefs: evidence,
      recordedAt: '2026-10-27T02:08:00.000Z',
    });
    assert.equal(accepted.successor_checkpoint_id, checkpointB.checkpointId);

    // CP-03: a production-style downstream consumer resolves only B as current.
    const current = await resolveContinuityHandoff(query, {
      scopeSemanticKey: semanticKey,
      expectedCheckpointId: checkpointB.checkpointId,
      consumerRef: 'consumer:competitive-proof:cp03',
      providerRef: 'provider:control',
      actorRef: 'agent:control',
      resolvedAt: '2026-10-27T02:09:00.000Z',
    });
    assert.equal(current.currentCheckpoint.checkpointId, checkpointB.checkpointId);
    assert.equal(current.currentCheckpoint.parentCheckpointId, checkpointA.checkpointId);
    assert.deepEqual(current.lineage.checkpointIds, [checkpointA.checkpointId, checkpointB.checkpointId]);
    assert.equal(current.lineage.depth, 2);
    assert.equal(current.unresolvedCases.length, 0);

    await assert.rejects(
      () => resolveContinuityHandoff(query, {
        scopeSemanticKey: semanticKey,
        expectedCheckpointId: checkpointA.checkpointId,
        consumerRef: 'consumer:competitive-proof:cp03-stale',
        providerRef: 'provider:control',
        actorRef: 'agent:control',
        resolvedAt: '2026-10-27T02:10:00.000Z',
      }),
      error => error instanceof ContinuityHandoffError
        && error.code === 'stale_checkpoint'
        && error.message.includes(checkpointB.checkpointId)
    );

    // CP-01: provider substitution changes the consumer, not governed continuity.
    const providerA = await resolveContinuityHandoff(query, {
      scopeSemanticKey: semanticKey,
      expectedCheckpointId: checkpointB.checkpointId,
      consumerRef: 'consumer:competitive-proof:cp01',
      providerRef: 'provider:model-a',
      actorRef: 'agent:stable-worker',
      resolvedAt: '2026-10-27T02:11:00.000Z',
    });
    const providerB = await resolveContinuityHandoff(query, {
      scopeSemanticKey: semanticKey,
      expectedCheckpointId: checkpointB.checkpointId,
      consumerRef: 'consumer:competitive-proof:cp01',
      providerRef: 'provider:model-b',
      actorRef: 'agent:stable-worker',
      resolvedAt: '2026-10-27T02:12:00.000Z',
    });
    assert.notEqual(providerA.consumer.providerRef, providerB.consumer.providerRef);
    assert.equal(providerA.continuityDigest, providerB.continuityDigest);
    assert.equal(providerA.currentCheckpoint.checkpointId, providerB.currentCheckpoint.checkpointId);
    assert.deepEqual(providerA.lineage, providerB.lineage);

    // CP-02: actor replacement receives continuity but never inherits authority.
    const actorA = await resolveContinuityHandoff(query, {
      scopeSemanticKey: semanticKey,
      expectedCheckpointId: checkpointB.checkpointId,
      consumerRef: 'consumer:competitive-proof:cp02',
      providerRef: 'provider:model-b',
      actorRef: 'agent:predecessor',
      resolvedAt: '2026-10-27T02:13:00.000Z',
    });
    const actorB = await resolveContinuityHandoff(query, {
      scopeSemanticKey: semanticKey,
      expectedCheckpointId: checkpointB.checkpointId,
      consumerRef: 'consumer:competitive-proof:cp02',
      providerRef: 'provider:model-b',
      actorRef: 'agent:replacement',
      resolvedAt: '2026-10-27T02:14:00.000Z',
    });
    assert.notEqual(actorA.consumer.actorRef, actorB.consumer.actorRef);
    assert.equal(actorA.continuityDigest, actorB.continuityDigest);
    assert.equal(actorB.consumer.authorityMode, 'requires_independent_validation');
    assert.equal(actorB.currentCheckpoint.acceptedByRef, authority.actorRef);
    assert.notEqual(actorB.currentCheckpoint.acceptedByRef, actorB.consumer.actorRef);

    const governedPayload = JSON.stringify({
      currentCheckpoint: actorB.currentCheckpoint,
      lineage: actorB.lineage,
      unresolvedCases: actorB.unresolvedCases,
      continuityDigest: actorB.continuityDigest,
    });
    assert.equal(governedPayload.includes('agent:predecessor'), false);
    assert.equal(governedPayload.includes('agent:replacement'), false);
  } finally {
    await pool.end();
    await closePool();
  }
});
