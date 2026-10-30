import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import test from 'node:test';

import { createMdoLiveTestDb } from '../support/mdo-live-test-db.mjs';

const { MdoPlanDispositionService } = await import('../../dist/mdo-plan-disposition.js');

const ISSUE_REF = 'github:issue:377';
const PLAN_SOURCE_REF = 'github:issue:370#module-fixture';
const PROJECT_SOURCE_REF = 'github:issue:370';
const AUTHORITY_HANDLE = 'mdo004-test-human-authority';
const ACCEPT_RATIONALE = 'MDO-004 persistent Test acceptance: the complete evidence-bearing MDO-003 plan passed explicit synthetic human Test review.';
const ACCEPT_SOURCE_REF = 'github:issue:377#persistent-test-acceptance';

const artifactPath = process.env.MDO004_TEST_ARTIFACT ?? 'artifacts/mdo-004-test-acceptance.json';
const candidateRef = process.env.GITHUB_SHA ?? 'unknown-candidate';

const db = createMdoLiveTestDb({
  connectionString: process.env.SUPABASE_SESSION_DATABASE_URL,
  applicationName: 'comind-mdo-004-test',
});

const { query, one } = db;
const service = new MdoPlanDispositionService(query);

function stableChecksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function loadPlan() {
  return one(
    `SELECT mp.plan_id::text,
            mp.project_id::text,
            mp.module_id::text,
            mp.status,
            mp.version,
            mp.target_stage,
            p.org_id::text,
            p.slug::text AS project_slug,
            p.source_ref AS project_source_ref,
            mr.module_code,
            mr.lifecycle_stage,
            mr.source_ref AS module_source_ref
     FROM comind.cm_mdo_plan mp
     JOIN comind.cm_project p ON p.project_id = mp.project_id
     JOIN comind.cm_module_registry mr ON mr.module_id = mp.module_id
     WHERE p.slug::text = 'mdo-003-test-acceptance'
       AND p.source_ref = $1::text
       AND mr.module_code = 'MDO3-TEST'
       AND mr.source_ref = $2::text
     ORDER BY mp.version DESC
     LIMIT 1`,
    [PROJECT_SOURCE_REF, PLAN_SOURCE_REF]
  );
}

async function readCompleteness(planId) {
  return one(
    `SELECT count(DISTINCT mpt.task_id)::int AS tasks,
            count(DISTINCT mpt.task_id) FILTER (WHERE t.status='done')::int AS done_tasks,
            count(DISTINCT mpt.task_id) FILTER (WHERE wl.state='completed')::int AS completed_leases,
            count(DISTINCT c.contribution_id)::int AS contributions,
            count(DISTINCT c.contribution_id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM comind.cm_mdo_contribution_evidence ce
                WHERE ce.contribution_id = c.contribution_id
              )
            )::int AS contributions_with_evidence,
            count(DISTINCT c.execution_context_id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM comind.cm_foundry_execution_outcome eo
                WHERE eo.execution_context_id = c.execution_context_id
                  AND eo.terminal_status='succeeded'
              )
            )::int AS succeeded_executions
     FROM comind.cm_mdo_plan_task mpt
     JOIN comind.cm_task t ON t.task_id=mpt.task_id
     JOIN comind.cm_foundry_work_lease wl ON wl.task_id=mpt.task_id
     LEFT JOIN comind.cm_mdo_contribution c ON c.task_id=mpt.task_id
     WHERE mpt.plan_id=$1::uuid`,
    [planId]
  );
}

async function ensureSyntheticHuman(orgId) {
  const existing = await query(
    `SELECT actor_id::text, org_id::text, kind, handle::text, display_name, meta
     FROM comind.cm_actor WHERE handle::text=$1::text`,
    [AUTHORITY_HANDLE]
  );

  let actor;
  if (existing.rows.length === 0) {
    actor = await one(
      `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
       VALUES ($1::uuid, 'person', $2::text, 'MDO-004 Synthetic Test Human Authority', $3::jsonb)
       RETURNING actor_id::text, org_id::text, kind, handle::text, display_name, meta`,
      [
        orgId,
        AUTHORITY_HANDLE,
        JSON.stringify({
          synthetic: true,
          environment: 'isolated',
          source_system: 'github',
          source_ref: ISSUE_REF,
          authority_fixture: 'human_review',
        }),
      ]
    );
  } else {
    assert.equal(existing.rows.length, 1);
    actor = existing.rows[0];
  }

  assert.equal(actor.org_id, orgId);
  assert.equal(actor.kind, 'person');
  assert.equal(actor.meta?.synthetic, true);
  assert.equal(actor.meta?.environment, 'isolated');
  assert.equal(actor.meta?.source_ref, ISSUE_REF);
  return actor;
}

async function dispositionCapability() {
  const capability = await one(
    `SELECT capability_id::text, capability_code, target_kind, max_authority, cost_bearing, adapter
     FROM comind.cm_foundry_capability
     WHERE capability_code='mdo.plan.disposition'`
  );
  assert.equal(capability.target_kind, 'module_plan');
  assert.equal(capability.max_authority, 'C2');
  assert.equal(capability.cost_bearing, false);
  assert.equal(capability.adapter, 'mdo');
  return capability;
}

async function ensureReviewEvidence(plan) {
  const sourceRef = `${ACCEPT_SOURCE_REF}:${plan.plan_id}`;
  const existing = await query(
    `SELECT evidence_id::text, title, source_type, source_ref, checksum, metadata
     FROM comind.cm_evidence
     WHERE source_type='mdo_plan_disposition_review'
       AND source_ref=$1::text
     ORDER BY created_at
     LIMIT 2`,
    [sourceRef]
  );

  if (existing.rows.length > 0) {
    assert.equal(existing.rows.length, 1);
    assert.equal(existing.rows[0].metadata?.synthetic, true);
    assert.equal(existing.rows[0].metadata?.plan_id, plan.plan_id);
    return existing.rows[0];
  }

  const checksum = stableChecksum({
    issue: 377,
    plan_id: plan.plan_id,
    module_id: plan.module_id,
    project_id: plan.project_id,
    acceptance_contract: 'mdo-004-v1',
  });

  return one(
    `INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
     VALUES (
       'MDO-004 persistent Test human plan review',
       'mdo_plan_disposition_review',
       $1::text,
       $2::text,
       $3::jsonb
     )
     RETURNING evidence_id::text, title, source_type, source_ref, checksum, metadata`,
    [
      sourceRef,
      checksum,
      JSON.stringify({
        synthetic: true,
        environment: 'isolated',
        issue: 377,
        plan_id: plan.plan_id,
        module_id: plan.module_id,
        project_id: plan.project_id,
        source_system: 'github',
        source_ref: ISSUE_REF,
      }),
    ]
  );
}

async function issueAuthorization({ actorId, capabilityId, projectId, planId, evidenceId, expired, reason }) {
  const request = await one(
    `INSERT INTO comind.cm_foundry_authorization_request(
       requesting_actor_id, capability_id, project_id,
       authority_level, environment, target_kind, target_ref,
       reason, evidence_refs, status, requested_at, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       'C2', 'isolated', 'module_plan', $4::text,
       $5::text, $6::jsonb, 'approved',
       ${expired ? "clock_timestamp() - interval '10 minutes'" : 'clock_timestamp()'},
       ${expired ? "clock_timestamp() - interval '5 minutes'" : "clock_timestamp() + interval '30 minutes'"}
     )
     RETURNING authorization_request_id::text`,
    [actorId, capabilityId, projectId, planId, reason, JSON.stringify([evidenceId, ISSUE_REF, `candidate:${candidateRef}`])]
  );

  const decision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision(
       authorization_request_id, decision, decided_by_actor_id,
       decision_basis, policy_refs, decided_at, effective_until
     ) VALUES (
       $1::uuid, 'approved', $2::uuid,
       $3::text, $4::jsonb,
       ${expired ? "clock_timestamp() - interval '9 minutes'" : 'clock_timestamp()'},
       ${expired ? "clock_timestamp() - interval '5 minutes'" : "clock_timestamp() + interval '30 minutes'"}
     )
     RETURNING authorization_decision_id::text`,
    [
      request.authorization_request_id,
      actorId,
      reason,
      JSON.stringify(['MDO-004', 'Issue #377', 'CoMind Development Contract']),
    ]
  );

  return decision.authorization_decision_id;
}

async function existingAcceptEvent(planId) {
  const rows = await query(
    `SELECT de.disposition_event_id::text,
            de.actor_id::text,
            de.authorization_decision_id::text,
            de.rationale,
            de.source_ref,
            de.idempotency_key,
            array_agg(del.evidence_id::text ORDER BY del.evidence_id)::text[] AS evidence_ids
     FROM comind.cm_mdo_plan_disposition_event de
     JOIN comind.cm_mdo_plan_disposition_evidence del
       ON del.disposition_event_id=de.disposition_event_id
     WHERE de.plan_id=$1::uuid AND de.event_type='accept'
     GROUP BY de.disposition_event_id, de.actor_id, de.authorization_decision_id,
              de.rationale, de.source_ref, de.idempotency_key
     ORDER BY de.created_at`,
    [planId]
  );
  assert.ok(rows.rows.length <= 1, 'MDO-004 Test plan must not have duplicate acceptance events');
  return rows.rows[0] ?? null;
}

async function acceptanceReadback(planId) {
  return one(
    `SELECT mp.status AS plan_status,
            mr.lifecycle_stage AS module_lifecycle_stage,
            count(DISTINCT de.disposition_event_id)::int AS accept_event_count,
            count(DISTINCT del.evidence_id)::int AS accept_evidence_count,
            count(DISTINCT al.audit_id)::int AS accept_audit_count
     FROM comind.cm_mdo_plan mp
     JOIN comind.cm_module_registry mr ON mr.module_id=mp.module_id
     LEFT JOIN comind.cm_mdo_plan_disposition_event de
       ON de.plan_id=mp.plan_id AND de.event_type='accept'
     LEFT JOIN comind.cm_mdo_plan_disposition_evidence del
       ON del.disposition_event_id=de.disposition_event_id
     LEFT JOIN comind.cm_audit_log al
       ON al.target_table='cm_mdo_plan'
      AND al.target_id=mp.plan_id
      AND al.action='mdo.plan.accept'
      AND al.details->>'disposition_event_id'=de.disposition_event_id::text
     WHERE mp.plan_id=$1::uuid
     GROUP BY mp.status, mr.lifecycle_stage`,
    [planId]
  );
}

async function writeArtifact(payload) {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('MDO-004 persistently accepts the completed MDO-003 Test plan under exact synthetic human C2 authority', async () => {
  const databaseIdentity = await db.verifyDatabaseIdentity();
  const plan = await loadPlan();
  assert.ok(['in_review', 'accepted'].includes(plan.status));
  assert.equal(plan.module_code, 'MDO3-TEST');
  assert.equal(plan.lifecycle_stage, 'conceived');
  assert.equal(plan.module_source_ref, PLAN_SOURCE_REF);
  assert.equal(plan.project_source_ref, PROJECT_SOURCE_REF);

  const completeness = await readCompleteness(plan.plan_id);
  assert.deepEqual(completeness, {
    tasks: 10,
    done_tasks: 10,
    completed_leases: 10,
    contributions: 10,
    contributions_with_evidence: 10,
    succeeded_executions: 10,
  });

  const human = await ensureSyntheticHuman(plan.org_id);
  const capability = await dispositionCapability();
  const evidence = await ensureReviewEvidence(plan);
  const acceptIdempotencyKey = `mdo004:test:accept:${plan.plan_id}`;
  const priorEvent = await existingAcceptEvent(plan.plan_id);

  let negativeProof = null;
  let acceptance;

  if (priorEvent === null) {
    assert.equal(plan.status, 'in_review', 'A new MDO-004 acceptance must begin from in_review');

    const expiredDecisionId = await issueAuthorization({
      actorId: human.actor_id,
      capabilityId: capability.capability_id,
      projectId: plan.project_id,
      planId: plan.plan_id,
      evidenceId: evidence.evidence_id,
      expired: true,
      reason: 'MDO-004 expired authorization negative proof.',
    });

    await assert.rejects(
      () => service.dispose({
        planId: plan.plan_id,
        disposition: 'accept',
        actorId: human.actor_id,
        authorizationDecisionId: expiredDecisionId,
        rationale: ACCEPT_RATIONALE,
        sourceRef: ACCEPT_SOURCE_REF,
        idempotencyKey: `mdo004:test:expired:${plan.plan_id}`,
        evidenceIds: [evidence.evidence_id],
      }),
      /MDO disposition authorization does not match the exact C2 plan envelope/
    );

    const negativeSideEffects = await one(
      `SELECT count(*)::int AS disposition_events
       FROM comind.cm_mdo_plan_disposition_event
       WHERE idempotency_key=$1::text`,
      [`mdo004:test:expired:${plan.plan_id}`]
    );
    assert.equal(negativeSideEffects.disposition_events, 0);
    negativeProof = Object.freeze({
      expired_authorization_decision_id: expiredDecisionId,
      disposition_event_count: 0,
    });

    const authorizationDecisionId = await issueAuthorization({
      actorId: human.actor_id,
      capabilityId: capability.capability_id,
      projectId: plan.project_id,
      planId: plan.plan_id,
      evidenceId: evidence.evidence_id,
      expired: false,
      reason: 'MDO-004 exact C2 persistent Test plan acceptance.',
    });

    acceptance = await service.dispose({
      planId: plan.plan_id,
      disposition: 'accept',
      actorId: human.actor_id,
      authorizationDecisionId,
      rationale: ACCEPT_RATIONALE,
      sourceRef: ACCEPT_SOURCE_REF,
      idempotencyKey: acceptIdempotencyKey,
      evidenceIds: [evidence.evidence_id],
    });
    assert.equal(acceptance.created, true);
    assert.equal(acceptance.fromStatus, 'in_review');
    assert.equal(acceptance.toStatus, 'accepted');
  } else {
    assert.equal(plan.status, 'accepted', 'Existing MDO-004 acceptance event requires accepted plan projection');
    assert.equal(priorEvent.actor_id, human.actor_id);
    assert.equal(priorEvent.rationale, ACCEPT_RATIONALE);
    assert.equal(priorEvent.source_ref, ACCEPT_SOURCE_REF);
    assert.equal(priorEvent.idempotency_key, acceptIdempotencyKey);
    assert.deepEqual(priorEvent.evidence_ids, [evidence.evidence_id]);

    acceptance = await service.dispose({
      planId: plan.plan_id,
      disposition: 'accept',
      actorId: priorEvent.actor_id,
      authorizationDecisionId: priorEvent.authorization_decision_id,
      rationale: priorEvent.rationale,
      sourceRef: priorEvent.source_ref,
      idempotencyKey: priorEvent.idempotency_key,
      evidenceIds: priorEvent.evidence_ids,
    });
    assert.equal(acceptance.created, false);
  }

  const acceptedEvent = await existingAcceptEvent(plan.plan_id);
  assert.ok(acceptedEvent);

  const replay = await service.dispose({
    planId: plan.plan_id,
    disposition: 'accept',
    actorId: acceptedEvent.actor_id,
    authorizationDecisionId: acceptedEvent.authorization_decision_id,
    rationale: acceptedEvent.rationale,
    sourceRef: acceptedEvent.source_ref,
    idempotencyKey: acceptedEvent.idempotency_key,
    evidenceIds: acceptedEvent.evidence_ids,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.toStatus, 'accepted');

  await assert.rejects(
    () => service.dispose({
      planId: plan.plan_id,
      disposition: 'accept',
      actorId: acceptedEvent.actor_id,
      authorizationDecisionId: acceptedEvent.authorization_decision_id,
      rationale: `${acceptedEvent.rationale} conflicting replay`,
      sourceRef: acceptedEvent.source_ref,
      idempotencyKey: acceptedEvent.idempotency_key,
      evidenceIds: acceptedEvent.evidence_ids,
    }),
    /MDO disposition idempotency key conflicts with existing event/
  );

  const readback = await acceptanceReadback(plan.plan_id);
  assert.equal(readback.plan_status, 'accepted');
  assert.equal(readback.module_lifecycle_stage, 'conceived');
  assert.equal(readback.accept_event_count, 1);
  assert.equal(readback.accept_evidence_count, 1);
  assert.equal(readback.accept_audit_count, 1);

  const artifact = Object.freeze({
    lane: 'MDO-004',
    issue: 377,
    candidate_ref: candidateRef,
    database_identity: databaseIdentity,
    plan: {
      plan_id: plan.plan_id,
      project_id: plan.project_id,
      module_id: plan.module_id,
      module_code: plan.module_code,
      version: plan.version,
      target_stage: plan.target_stage,
      status_after: readback.plan_status,
      module_lifecycle_stage_after: readback.module_lifecycle_stage,
    },
    completeness,
    human_authority: {
      actor_id: human.actor_id,
      kind: human.kind,
      synthetic: human.meta?.synthetic === true,
      handle: human.handle,
    },
    capability: {
      capability_code: capability.capability_code,
      max_authority: capability.max_authority,
      environment: 'isolated',
      cost_bearing: capability.cost_bearing,
    },
    evidence_id: evidence.evidence_id,
    negative_proof: negativeProof,
    acceptance: {
      disposition_event_id: acceptedEvent.disposition_event_id,
      authorization_decision_id: acceptedEvent.authorization_decision_id,
      replay_created: replay.created,
      event_count: readback.accept_event_count,
      evidence_count: readback.accept_evidence_count,
      audit_count: readback.accept_audit_count,
    },
    production_authorized: false,
    paid_provider_authorized: false,
    module_maturity_promoted: false,
  });

  await writeArtifact(artifact);
});

test.after(async () => {
  await db.close();
});
