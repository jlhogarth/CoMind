import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const enabled = process.env.THREADKEEPER_ISOLATED_DB_TEST === '1';

test('isolated PostgreSQL closes remaining ThreadKeeper C2 persistence evidence gaps', {
  skip: !enabled,
}, async () => {
  const {
    appendCaseTransition,
    openContinuityCase,
    persistAcceptedCheckpoint,
    persistAssessment,
    registerContinuityScope,
  } = await import('../dist/threadkeeper/repository.js');
  const { assessContinuity } = await import('../dist/threadkeeper/assessment.js');
  const { createCheckpointProposal } = await import('../dist/threadkeeper/checkpoint.js');
  const { semanticScopeKey } = await import('../dist/threadkeeper/scope.js');
  const { closePool } = await import('../dist/db.js');

  let directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const query = async (sql, params) => ({ rows: (await directPool.query(sql, params)).rows });
  const suffix = `${process.pid}-${Date.now()}`;
  const binding = {
    scopeType: 'plan',
    namespace: 'comind.tk005.postgres',
    subjectRef: `plan:${suffix}`,
  };
  const semanticKey = semanticScopeKey(binding);
  const evidence = [{ provider: 'tk005', kind: 'fixture', ref: `evidence:${suffix}` }];
  const authority = {
    valid: true,
    source: 'external',
    actorRef: 'founder:test',
    evidenceRef: `authority:${suffix}`,
  };

  try {
    const scope = await registerContinuityScope(
      query,
      binding,
      'actor:tk005:test',
      'internal',
      'durable',
    );

    const rootProposal = createCheckpointProposal({
      proposalId: `proposal:${suffix}:root`,
      scopeSemanticKey: semanticKey,
      parentCheckpointId: null,
      currentAcceptedCheckpointId: null,
      proposedAt: '2026-10-27T00:00:00.000Z',
      proposedByRef: 'actor:tk005:test',
      state: {
        objectiveRefs: ['objective:root'],
        decisionRefs: ['decision:root'],
        commitmentRefs: [],
        obligationRefs: [],
        contextRefs: ['context:root'],
        evidenceRefs: evidence,
        sourceRefs: [{ provider: 'tk005', kind: 'source', ref: `source:${suffix}` }],
        sensitivity: 'internal',
        retentionClass: 'durable',
      },
    });
    const root = await persistAcceptedCheckpoint(
      rootProposal,
      authority,
      '2026-10-27T00:01:00.000Z',
    );

    const continuityAssessment = assessContinuity({
      scopeSemanticKey: semanticKey,
      checkpointId: root.checkpointId,
      observationId: `observation:${suffix}:1`,
      evidenceRefs: evidence,
      signals: {
        scopeStatus: 'valid',
        requiredEvidenceStatus: 'available',
        acceptedBaselinePresent: true,
        checkpointIntegrityValid: true,
        checkpointAuthorityValid: true,
        predecessorStatus: 'valid',
        authoritativeConflict: false,
        authorizedChange: false,
        materialChange: true,
        incompatibilityProven: false,
      },
    });

    const observationKey = `observation-receipt:${semanticKey}:${continuityAssessment.observationId}`;
    const storedAssessment = await persistAssessment(query, {
      idempotencyKey: observationKey,
      assessment: continuityAssessment,
      createdAt: '2026-10-27T00:02:00.000Z',
    });
    const duplicateAssessment = await persistAssessment(query, {
      idempotencyKey: observationKey,
      assessment: structuredClone(continuityAssessment),
      createdAt: '2026-10-27T00:03:00.000Z',
    });
    assert.equal(duplicateAssessment.assessment_id, storedAssessment.assessment_id);

    const conflictingObservation = structuredClone(continuityAssessment);
    conflictingObservation.evidenceRefs = [
      { provider: 'tk005', kind: 'fixture', ref: `evidence:${suffix}:conflicting` },
    ];
    await assert.rejects(
      () => persistAssessment(query, {
        idempotencyKey: observationKey,
        assessment: conflictingObservation,
        createdAt: '2026-10-27T00:04:00.000Z',
      }),
      /idempotency key reused with different evidence/,
    );

    await assert.rejects(
      () => query(
        'UPDATE comind.cm_threadkeeper_assessment SET classification=classification WHERE assessment_id=$1::uuid',
        [storedAssessment.assessment_id],
      ),
      /append-only and immutable/,
    );
    await assert.rejects(
      () => query(
        'DELETE FROM comind.cm_threadkeeper_assessment WHERE assessment_id=$1::uuid',
        [storedAssessment.assessment_id],
      ),
      /append-only and immutable/,
    );

    const opened = await openContinuityCase({
      caseKey: `case:${suffix}:false-positive`,
      scopeSemanticKey: semanticKey,
      openedFromAssessmentId: storedAssessment.assessment_id,
      openedAt: '2026-10-27T00:05:00.000Z',
      openedByRef: 'actor:tk005:test',
      evidenceRefs: evidence,
    });
    const assessed = await appendCaseTransition({
      transitionKey: `transition:${suffix}:assessed`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: opened.transition.transition_id,
      toState: 'ASSESSED',
      actorRef: 'actor:tk005:test',
      evidenceRefs: evidence,
      recordedAt: '2026-10-27T00:06:00.000Z',
    });
    const routed = await appendCaseTransition({
      transitionKey: `transition:${suffix}:routed`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: assessed.transition_id,
      toState: 'ROUTED',
      routeCode: 'REQUEST_HUMAN_REVIEW',
      actorRef: 'actor:tk005:test',
      evidenceRefs: evidence,
      recordedAt: '2026-10-27T00:07:00.000Z',
    });

    await assert.rejects(
      () => query(
        'UPDATE comind.cm_threadkeeper_case_transition SET to_state=to_state WHERE transition_id=$1::uuid',
        [routed.transition_id],
      ),
      /append-only and immutable/,
    );
    await assert.rejects(
      () => query(
        'DELETE FROM comind.cm_threadkeeper_case_transition WHERE transition_id=$1::uuid',
        [routed.transition_id],
      ),
      /append-only and immutable/,
    );

    const resolved = await appendCaseTransition({
      transitionKey: `transition:${suffix}:resolved-false-positive`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: routed.transition_id,
      toState: 'RESOLVED',
      actorRef: 'founder:test',
      evidenceRefs: [
        { provider: 'human_review', kind: 'dismissal', ref: `review:${suffix}:false-positive` },
      ],
      resolutionRef: `resolution:${suffix}:false-positive`,
      recordedAt: '2026-10-27T00:08:00.000Z',
    });
    assert.equal(resolved.to_state, 'RESOLVED');
    const preservedAssessment = await query(
      'SELECT assessment_id::text, classification FROM comind.cm_threadkeeper_assessment WHERE assessment_id=$1::uuid',
      [storedAssessment.assessment_id],
    );
    assert.deepEqual(preservedAssessment.rows, [{
      assessment_id: storedAssessment.assessment_id,
      classification: 'SUSPECTED_BREAK',
    }]);

    const invalidParentId = '00000000-0000-4000-8000-000000000099';
    await assert.rejects(
      () => query(
        `INSERT INTO comind.cm_threadkeeper_checkpoint (
           scope_id, parent_checkpoint_id, proposal_id, checkpoint_version,
           scope_semantic_key, proposed_at, proposed_by_ref,
           accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
           state_digest, digest, proposal
         )
         SELECT scope_id, $2::uuid,
                proposal_id || ':invalid-parent', checkpoint_version,
                scope_semantic_key, proposed_at, proposed_by_ref,
                accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
                state_digest, digest,
                jsonb_set(
                  jsonb_set(
                    jsonb_set(proposal, '{proposalId}', to_jsonb((proposal_id || ':invalid-parent')::text)),
                    '{parentCheckpointId}', to_jsonb($2::text)
                  ),
                  '{currentAcceptedCheckpointId}', to_jsonb($2::text)
                )
           FROM comind.cm_threadkeeper_checkpoint
          WHERE checkpoint_id=$1::uuid`,
        [root.checkpointId, invalidParentId],
      ),
      /(parent checkpoint|foreign key|violates foreign key)/i,
    );

    const writeFailureAssessment = assessContinuity({
      scopeSemanticKey: semanticKey,
      checkpointId: root.checkpointId,
      observationId: `observation:${suffix}:write-failure`,
      evidenceRefs: evidence,
      signals: {
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
      },
    });
    const failingKey = `assessment:${suffix}:synthetic-write-failure`;
    const failingQuery = async (sql, params) => {
      if (/INSERT INTO comind\.cm_threadkeeper_assessment/i.test(sql)) {
        throw new Error('synthetic ThreadKeeper storage write failure');
      }
      return query(sql, params);
    };
    await assert.rejects(
      () => persistAssessment(failingQuery, {
        idempotencyKey: failingKey,
        assessment: writeFailureAssessment,
        createdAt: '2026-10-27T00:09:00.000Z',
      }),
      /synthetic ThreadKeeper storage write failure/,
    );
    const absentAfterFailure = await query(
      'SELECT count(*)::int AS count FROM comind.cm_threadkeeper_assessment WHERE idempotency_key=$1',
      [failingKey],
    );
    assert.equal(absentAfterFailure.rows[0].count, 0);

    await directPool.end();
    directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const restartedRead = await query(
      `SELECT s.semantic_key,
              count(DISTINCT c.checkpoint_id)::int AS checkpoint_count,
              count(DISTINCT a.assessment_id)::int AS assessment_count,
              count(DISTINCT k.case_id)::int AS case_count
         FROM comind.cm_threadkeeper_scope s
         LEFT JOIN comind.cm_threadkeeper_checkpoint c ON c.scope_id=s.scope_id
         LEFT JOIN comind.cm_threadkeeper_assessment a ON a.scope_id=s.scope_id
         LEFT JOIN comind.cm_threadkeeper_case k ON k.scope_id=s.scope_id
        WHERE s.scope_id=$1::uuid
        GROUP BY s.semantic_key`,
      [scope.scope_id],
    );
    assert.equal(restartedRead.rows[0].semantic_key, semanticKey);
    assert.equal(restartedRead.rows[0].checkpoint_count, 1);
    assert.equal(restartedRead.rows[0].assessment_count, 1);
    assert.equal(restartedRead.rows[0].case_count, 1);
  } finally {
    await directPool.end().catch(() => {});
    await closePool();
  }
});
