import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

import { assessContinuity } from '../dist/threadkeeper/assessment.js';
import { createCheckpointProposal } from '../dist/threadkeeper/checkpoint.js';
import { semanticScopeKey } from '../dist/threadkeeper/scope.js';

const scopeBinding = {
  scopeType: 'plan',
  namespace: 'comind.tk004.integration',
  subjectRef: `plan:${process.pid}`,
};
const evidence = [{ provider: 'tk004', kind: 'fixture', ref: 'evidence:1' }];
const authority = {
  valid: true,
  source: 'external',
  actorRef: 'founder:test',
  evidenceRef: 'authority:tk004:test',
  policyRef: 'policy:authority:test',
};
const state = suffix => ({
  objectiveRefs: [`objective:${suffix}`],
  decisionRefs: [`decision:${suffix}`],
  commitmentRefs: [],
  obligationRefs: [`obligation:${suffix}`],
  contextRefs: [`context:${suffix}`],
  evidenceRefs: evidence,
  sourceRefs: [{ provider: 'tk004', kind: 'source', ref: `source:${suffix}` }],
  sensitivity: 'internal',
  retentionClass: 'durable',
});
const proposal = ({ id, parentCheckpointId, suffix, proposedAt }) => createCheckpointProposal({
  proposalId: id,
  scopeSemanticKey: semanticScopeKey(scopeBinding),
  parentCheckpointId,
  currentAcceptedCheckpointId: parentCheckpointId,
  proposedAt,
  proposedByRef: 'actor:tk004:test',
  policyRef: 'policy:continuity:test',
  state: state(suffix),
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

test('isolated PostgreSQL ThreadKeeper persistence preserves governed lineage, evidence, cases, ACLs, and concurrency', {
  skip: process.env.THREADKEEPER_ISOLATED_DB_TEST !== '1',
}, async () => {
  const { closePool } = await import('../dist/db.js');
  const {
    appendCaseTransition,
    getCheckpointLineage,
    getContinuityContext,
    openContinuityCase,
    persistAcceptedCheckpoint,
    persistAssessment,
    registerContinuityScope,
  } = await import('../dist/threadkeeper/repository.js');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const query = async (sql, params) => ({ rows: (await pool.query(sql, params)).rows });

  try {
    const semanticKey = semanticScopeKey(scopeBinding);
    const scope = await registerContinuityScope(query, scopeBinding, 'actor:tk004:test', 'internal', 'durable');
    const sameScope = await registerContinuityScope(query, scopeBinding, 'actor:tk004:retry', 'internal', 'durable');
    assert.equal(sameScope.scope_id, scope.scope_id);
    assert.equal(scope.semantic_key, semanticKey);

    const rls = await query(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='comind'
          AND c.relkind='r'
          AND c.relname LIKE 'cm_threadkeeper_%'
        ORDER BY c.relname`
    );
    assert.deepEqual(
      rls.rows.map(row => row.relname),
      [
        'cm_threadkeeper_assessment',
        'cm_threadkeeper_case',
        'cm_threadkeeper_case_transition',
        'cm_threadkeeper_checkpoint',
        'cm_threadkeeper_operation_event',
        'cm_threadkeeper_scope',
      ]
    );
    assert.ok(rls.rows.every(row => row.relrowsecurity === true));

    const privileges = await query(
      `SELECT
         has_table_privilege('authenticated', 'comind.cm_threadkeeper_scope', 'SELECT') AS authenticated_select,
         has_table_privilege('service_role', 'comind.cm_threadkeeper_scope', 'SELECT') AS service_select,
         has_table_privilege('service_role', 'comind.cm_threadkeeper_scope', 'INSERT') AS service_insert,
         has_table_privilege('service_role', 'comind.cm_threadkeeper_scope', 'UPDATE') AS service_update,
         has_table_privilege('service_role', 'comind.cm_threadkeeper_scope', 'DELETE') AS service_delete`
    );
    assert.deepEqual(privileges.rows[0], {
      authenticated_select: false,
      service_select: true,
      service_insert: true,
      service_update: false,
      service_delete: false,
    });

    const rootProposal = proposal({
      id: `proposal:root:${process.pid}`,
      parentCheckpointId: null,
      suffix: 'root',
      proposedAt: '2026-10-26T22:00:00.000Z',
    });
    const root = await persistAcceptedCheckpoint(rootProposal, authority, '2026-10-26T22:01:00.000Z');
    const rootRetry = await persistAcceptedCheckpoint(rootProposal, authority, '2026-10-26T22:05:00.000Z');
    assert.equal(rootRetry.checkpointId, root.checkpointId);

    await assert.rejects(
      () => query('UPDATE comind.cm_threadkeeper_checkpoint SET digest=digest WHERE checkpoint_id=$1::uuid', [root.checkpointId]),
      /append-only and immutable/
    );
    await assert.rejects(
      () => query('DELETE FROM comind.cm_threadkeeper_scope WHERE scope_id=$1::uuid', [scope.scope_id]),
      /append-only and immutable/
    );

    const childA = proposal({
      id: `proposal:child-a:${process.pid}`,
      parentCheckpointId: root.checkpointId,
      suffix: 'child-a',
      proposedAt: '2026-10-26T22:10:00.000Z',
    });
    const childB = proposal({
      id: `proposal:child-b:${process.pid}`,
      parentCheckpointId: root.checkpointId,
      suffix: 'child-b',
      proposedAt: '2026-10-26T22:10:00.000Z',
    });
    const race = await Promise.allSettled([
      persistAcceptedCheckpoint(childA, authority, '2026-10-26T22:11:00.000Z'),
      persistAcceptedCheckpoint(childB, authority, '2026-10-26T22:11:00.000Z'),
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(race.filter(result => result.status === 'rejected').length, 1);
    const rejection = race.find(result => result.status === 'rejected');
    assert.match(String(rejection.reason), /(stale_head|could not serialize access)/);
    const winningCheckpoint = race.find(result => result.status === 'fulfilled').value;

    const lineage = await getCheckpointLineage(query, semanticKey);
    assert.equal(lineage.length, 2);
    assert.equal(lineage[0].checkpoint_id, root.checkpointId);
    assert.equal(lineage[1].checkpoint_id, winningCheckpoint.checkpointId);
    assert.equal(lineage[1].parent_checkpoint_id, root.checkpointId);
    assert.ok(BigInt(lineage[1].persistence_seq) > BigInt(lineage[0].persistence_seq));

    const stale = proposal({
      id: `proposal:stale:${process.pid}`,
      parentCheckpointId: root.checkpointId,
      suffix: 'stale',
      proposedAt: '2026-10-26T22:20:00.000Z',
    });
    await assert.rejects(
      () => persistAcceptedCheckpoint(stale, authority, '2026-10-26T22:21:00.000Z'),
      /stale_head/
    );

    const continuityAssessment = assessContinuity({
      scopeSemanticKey: semanticKey,
      checkpointId: winningCheckpoint.checkpointId,
      observationId: `observation:${process.pid}`,
      evidenceRefs: evidence,
      signals: signals({ materialChange: true }),
    });
    assert.equal(continuityAssessment.classification, 'SUSPECTED_BREAK');
    const storedAssessment = await persistAssessment(query, {
      idempotencyKey: `assessment:${process.pid}:1`,
      assessment: continuityAssessment,
      createdAt: '2026-10-26T22:30:00.000Z',
    });
    const assessmentRetry = await persistAssessment(query, {
      idempotencyKey: `assessment:${process.pid}:1`,
      assessment: continuityAssessment,
      createdAt: '2026-10-26T22:31:00.000Z',
    });
    assert.equal(assessmentRetry.assessment_id, storedAssessment.assessment_id);

    const conflictingAssessment = structuredClone(continuityAssessment);
    conflictingAssessment.reasonCodes = ['different_evidence_under_same_idempotency_key'];
    await assert.rejects(
      () => persistAssessment(query, {
        idempotencyKey: `assessment:${process.pid}:1`,
        assessment: conflictingAssessment,
        createdAt: '2026-10-26T22:32:00.000Z',
      }),
      /idempotency key reused with different evidence/
    );

    const opened = await openContinuityCase({
      caseKey: `case:${process.pid}:1`,
      scopeSemanticKey: semanticKey,
      openedFromAssessmentId: storedAssessment.assessment_id,
      openedAt: '2026-10-26T22:40:00.000Z',
      openedByRef: 'actor:tk004:test',
      evidenceRefs: evidence,
    });
    assert.equal(opened.transition.to_state, 'OBSERVED');

    const assessed = await appendCaseTransition({
      transitionKey: `transition:${process.pid}:assessed`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: opened.transition.transition_id,
      toState: 'ASSESSED',
      actorRef: 'actor:tk004:test',
      evidenceRefs: evidence,
      recordedAt: '2026-10-26T22:41:00.000Z',
    });
    assert.equal(assessed.from_state, 'OBSERVED');
    assert.equal(assessed.to_state, 'ASSESSED');

    const assessedHead = await query(
      `SELECT transition_id::text, to_state
         FROM comind.cm_threadkeeper_case_transition
        WHERE case_id=$1::uuid
        ORDER BY persistence_seq DESC
        LIMIT 1`,
      [opened.case.case_id]
    );
    assert.equal(assessedHead.rows[0].to_state, 'ASSESSED');

    await assert.rejects(
      () => query(
        `INSERT INTO comind.cm_threadkeeper_case_transition (
           transition_key, case_id, prior_transition_id, from_state, to_state,
           route_code, actor_ref, authority_evidence_ref, evidence_refs,
           resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
         ) VALUES (
           $1,$2::uuid,$3::uuid,'ASSESSED','RESOLVED',NULL,$4,NULL,$5::jsonb,
           $6,NULL,$7::timestamptz,$8,$9::jsonb
         )`,
        [
          `transition:${process.pid}:illegal-resolve`,
          opened.case.case_id,
          assessedHead.rows[0].transition_id,
          'actor:tk004:test',
          JSON.stringify(evidence),
          'resolution:invalid-direct',
          '2026-10-26T22:42:00.000Z',
          '0'.repeat(64),
          JSON.stringify({
            fromState: 'ASSESSED',
            toState: 'RESOLVED',
            routeCode: null,
            actorRef: 'actor:tk004:test',
            authorityEvidenceRef: null,
            evidenceRefs: evidence,
            resolutionRef: 'resolution:invalid-direct',
            successorCheckpointId: null,
            recordedAt: '2026-10-26T22:42:00.000Z',
          }),
        ]
      ),
      /Illegal ThreadKeeper case transition/
    );

    const routedResult = await query(
      `INSERT INTO comind.cm_threadkeeper_case_transition (
         transition_key, case_id, prior_transition_id, from_state, to_state,
         route_code, actor_ref, authority_evidence_ref, evidence_refs,
         resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
       ) VALUES (
         $1,$2::uuid,$3::uuid,'ASSESSED','ROUTED','REQUEST_HUMAN_REVIEW',$4,NULL,$5::jsonb,
         NULL,NULL,$6::timestamptz,$7,$8::jsonb
       )
       RETURNING transition_id::text, to_state`,
      [
        `transition:${process.pid}:routed`,
        opened.case.case_id,
        assessedHead.rows[0].transition_id,
        'actor:tk004:test',
        JSON.stringify(evidence),
        '2026-10-26T22:43:00.000Z',
        '1'.repeat(64),
        JSON.stringify({
          fromState: 'ASSESSED',
          toState: 'ROUTED',
          routeCode: 'REQUEST_HUMAN_REVIEW',
          actorRef: 'actor:tk004:test',
          authorityEvidenceRef: null,
          evidenceRefs: evidence,
          resolutionRef: null,
          successorCheckpointId: null,
          recordedAt: '2026-10-26T22:43:00.000Z',
        }),
      ]
    );
    const routed = routedResult.rows[0];
    assert.equal(routed.to_state, 'ROUTED');

    const openContext = await getContinuityContext(query, semanticKey);
    assert.ok(openContext);
    assert.equal(openContext.acceptedCheckpoint.checkpoint_id, winningCheckpoint.checkpointId);
    assert.equal(openContext.unresolvedCases.length, 1);
    assert.equal(openContext.unresolvedCases[0].state, 'ROUTED');

    const acceptedDivergenceResult = await query(
      `INSERT INTO comind.cm_threadkeeper_case_transition (
         transition_key, case_id, prior_transition_id, from_state, to_state,
         route_code, actor_ref, authority_evidence_ref, evidence_refs,
         resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
       ) VALUES (
         $1,$2::uuid,$3::uuid,'ROUTED','ACCEPTED_DIVERGENCE',NULL,$4,$5,$6::jsonb,
         NULL,$7::uuid,$8::timestamptz,$9,$10::jsonb
       )
       RETURNING transition_id::text, to_state`,
      [
        `transition:${process.pid}:accepted-divergence`,
        opened.case.case_id,
        routed.transition_id,
        'founder:test',
        'authority:tk004:test',
        JSON.stringify(evidence),
        winningCheckpoint.checkpointId,
        '2026-10-26T22:44:00.000Z',
        '2'.repeat(64),
        JSON.stringify({
          fromState: 'ROUTED',
          toState: 'ACCEPTED_DIVERGENCE',
          routeCode: null,
          actorRef: 'founder:test',
          authorityEvidenceRef: 'authority:tk004:test',
          evidenceRefs: evidence,
          resolutionRef: null,
          successorCheckpointId: winningCheckpoint.checkpointId,
          recordedAt: '2026-10-26T22:44:00.000Z',
        }),
      ]
    );
    const acceptedDivergence = acceptedDivergenceResult.rows[0];
    assert.equal(acceptedDivergence.to_state, 'ACCEPTED_DIVERGENCE');

    const closedContext = await getContinuityContext(query, semanticKey);
    assert.equal(closedContext.unresolvedCases.length, 0);

    await assert.rejects(
      () => query(
        `INSERT INTO comind.cm_threadkeeper_case_transition (
           transition_key, case_id, prior_transition_id, from_state, to_state,
           route_code, actor_ref, authority_evidence_ref, evidence_refs,
           resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
         ) VALUES (
           $1,$2::uuid,$3::uuid,'ACCEPTED_DIVERGENCE','ASSESSED',NULL,$4,NULL,'[]'::jsonb,
           NULL,NULL,$5::timestamptz,$6,$7::jsonb
         )`,
        [
          `transition:${process.pid}:illegal-terminal-reassessment`,
          opened.case.case_id,
          acceptedDivergence.transition_id,
          'actor:tk004:test',
          '2026-10-26T22:45:00.000Z',
          '0'.repeat(64),
          JSON.stringify({
            fromState: 'ACCEPTED_DIVERGENCE',
            toState: 'ASSESSED',
            routeCode: null,
            actorRef: 'actor:tk004:test',
            authorityEvidenceRef: null,
            evidenceRefs: [],
            resolutionRef: null,
            successorCheckpointId: null,
            recordedAt: '2026-10-26T22:45:00.000Z',
          }),
        ]
      ),
      /Illegal ThreadKeeper case transition/
    );
  } finally {
    await pool.end();
    await closePool();
  }
});
