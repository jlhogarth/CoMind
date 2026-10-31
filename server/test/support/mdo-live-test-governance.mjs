import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TEST_PROJECT_REF } from './mdo-live-test-db.mjs';
import { ISSUE_REF, MDO002_MERGE_REF } from './mdo-live-test-fixtures.mjs';

const { MdoOrchestrator } = await import('../../dist/mdo-orchestrator.js');
const { scanMissingness, persistMissingnessFindings } = await import('../../dist/continuous-excellence/missingness.js');

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function createMdoLiveTestGovernance({ db, fixtures, candidateRef, candidateKey }) {
  const { query, one } = db;

  async function enqueuePlan(fixture) {
    const capability = await one(
      `SELECT capability_id::text FROM comind.cm_foundry_capability WHERE capability_code='mdo.plan.orchestrate'`
    );
    const authorizationDecisionId = await fixtures.issueAuthorization({
      actorId: fixture.sponsor.actor_id,
      capabilityId: capability.capability_id,
      projectId: fixture.project.project_id,
      targetKind: 'module',
      targetRef: fixture.module.module_id,
      sponsorActorId: fixture.sponsor.actor_id,
      reason: 'MDO-003 durable Supabase Test plan enqueue.',
    });
    const mdo = new MdoOrchestrator(query);
    const idempotencyKey = `mdo003-plan:${candidateKey}`;
    const objective = `MDO-003 governed persistent Test acceptance for candidate ${candidateRef}. Prove the complete ten-role planning chain with local Ollama, preserve canonical evidence and human authority, and do not advance module maturity.`;
    const first = await mdo.enqueuePlan({
      moduleId: fixture.module.module_id,
      projectId: fixture.project.project_id,
      requestedByActorId: fixture.sponsor.actor_id,
      authorizationDecisionId,
      objective,
      idempotencyKey,
    });
    assert.equal(first.taskCount, 10);
    const replay = await mdo.enqueuePlan({
      moduleId: fixture.module.module_id,
      projectId: fixture.project.project_id,
      requestedByActorId: fixture.sponsor.actor_id,
      authorizationDecisionId,
      objective,
      idempotencyKey,
    });
    assert.equal(replay.planId, first.planId);
    assert.equal(replay.created, false);
    assert.equal(replay.taskCount, 10);
    return { mdo, planId: first.planId, authorizationDecisionId, idempotencyKey, objective, created: first.created };
  }

  async function runCePreflight(fixture, plan) {
    const firstTask = await one(
      `SELECT task_id::text FROM comind.cm_mdo_plan_task WHERE plan_id=$1::uuid ORDER BY sequence_no LIMIT 1`,
      [plan.planId]
    );
    const refs = [
      { sourceSystem: 'github', sourceRef: ISSUE_REF, summary: 'MDO-003 governed Test acceptance contract.' },
      { sourceSystem: 'github', sourceRef: MDO002_MERGE_REF, summary: 'Accepted provider-neutral ten-role MDO baseline.' },
      { sourceSystem: 'supabase', sourceRef: `project:${TEST_PROJECT_REF}`, summary: 'Canonical CoMind Supabase Test target.' },
      { sourceSystem: 'comind', sourceRef: `mdo-plan:${plan.planId}`, summary: 'Governed MDO Test plan.' },
    ];
    const request = {
      projectId: fixture.project.project_id,
      taskId: firstTask.task_id,
      actorId: fixture.sponsor.actor_id,
      objective: 'Activate the persistent MDO Test acceptance plan without Production or paid-provider authority.',
      proposedAction: 'Execute ten C1 isolated MDO planning roles through local Ollama, verify evidence and fencing, then revoke run-scoped grants.',
      consequenceLevel: 'moderate',
      substantialWork: true,
      authority: {
        state: 'authorized',
        evidenceRefs: refs,
        approvalRef: `authorization-decision:${plan.authorizationDecisionId}`,
      },
      sourceSystem: 'github',
      sourceRef: ISSUE_REF,
      observedAt: new Date().toISOString(),
      flags: {
        dataMutation: true,
        externalDependency: true,
        longLivedArchitecture: false,
        paidProvider: false,
        production: false,
      },
      assessments: [
        { dimension: 'assumptions_confidence', status: 'satisfied', confidence: 'verified', rationale: 'MDO-002 already proved the same provider-neutral role chain and bounded context on exact-head local Ollama.', evidenceRefs: refs },
        { dimension: 'rollback_recovery', status: 'satisfied', confidence: 'verified', rationale: 'Run authority is bounded by expiring grants and explicit revocation; failed execution remains fenced and provenance is preserved.', evidenceRefs: refs },
        { dimension: 'observability_evidence', status: 'satisfied', confidence: 'verified', rationale: 'Canonical execution, evidence, contribution, lease, authorization, audit, and artifact readback are required.', evidenceRefs: refs },
        { dimension: 'testing_acceptance', status: 'satisfied', confidence: 'verified', rationale: 'Exact-head deterministic tests plus live Test acceptance and independent readback define the gate.', evidenceRefs: refs },
        { dimension: 'reversibility', status: 'satisfied', confidence: 'verified', rationale: 'Test grants are revocable, module maturity is immutable in this lane, and prior evidence is superseded rather than deleted.', evidenceRefs: refs },
        { dimension: 'security_data_integrity', status: 'satisfied', confidence: 'verified', rationale: 'Exact Supabase Test identity guard, C1 isolated authority, local provider only, and canonical fencing remain mandatory.', evidenceRefs: refs },
      ],
      dependencies: [
        { key: 'supabase_test', required: true, status: 'available', evidenceRefs: refs },
        { key: 'mdo_002_runtime', required: true, status: 'available', evidenceRefs: refs },
        { key: 'local_ollama', required: true, status: 'available', evidenceRefs: refs },
      ],
      reuse: {
        status: 'checked_reuse',
        capabilityRef: 'MDO-002/VE-LIFE-002/CE-003',
        rationale: 'The lane reuses accepted MDO runtime, VE Test target guarding, and CE missingness scanning instead of creating parallel controls.',
        evidenceRefs: refs,
      },
    };
    const result = scanMissingness(request);
    assert.equal(result.proceedAllowed, true, `CE-003 blocked MDO Test execution: ${JSON.stringify(result.findings)}`);
    const persistence = await persistMissingnessFindings(query, request, result);
    const sourceRef = `mdo003-preflight:${candidateKey}`;
    const metadata = {
      schema_version: 'comind.mdo-003.ce-preflight.v1',
      issue: 370,
      plan_id: plan.planId,
      candidate_ref: candidateRef,
      request,
      result,
      persistence,
    };
    const checksum = sha256(metadata);
    const existing = await query(
      `SELECT evidence_id::text, checksum FROM comind.cm_evidence
       WHERE source_type='mdo_test_preflight' AND source_ref=$1::text ORDER BY created_at LIMIT 2`,
      [sourceRef]
    );
    assert.ok(existing.rows.length <= 1, 'CE preflight evidence must be unique per candidate attempt');
    let evidenceId;
    if (existing.rows.length === 1) {
      assert.equal(existing.rows[0].checksum, checksum);
      evidenceId = existing.rows[0].evidence_id;
    } else {
      const inserted = await one(
        `INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
         VALUES ('MDO-003 CE-003 Test preflight', 'mdo_test_preflight', $1::text, $2::text, $3::jsonb)
         RETURNING evidence_id::text`,
        [sourceRef, checksum, JSON.stringify(metadata)]
      );
      evidenceId = inserted.evidence_id;
    }
    return { request, result, persistence, evidenceId };
  }

  return Object.freeze({ enqueuePlan, runCePreflight });
}
