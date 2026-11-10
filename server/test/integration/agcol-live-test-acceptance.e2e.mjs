import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMdoLiveTestDb } from '../support/mdo-live-test-db.mjs';
import { createMdoLiveTestFixtures } from '../support/mdo-live-test-fixtures.mjs';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator, sha256Fingerprint } =
  await import('../../dist/foundry-runtime.js');
const { createReadOnlyMcpAdapter, callIsolatedReadOnlyMcp } =
  await import('../../dist/agcol-readonly-mcp.js');
const { runParallelCollaboration } = await import('../../dist/parallel-agent-collaboration.js');

const candidate = process.env.AGCOL_CANDIDATE_REF;
assert.match(candidate ?? '', /^[a-f0-9]{40}$/, 'Exact PR head required');
const runKey = `agcol002:${candidate.slice(0, 12)}:${process.env.GITHUB_RUN_ID ?? randomUUID()}`;
const db = createMdoLiveTestDb({
  connectionString: process.env.SUPABASE_SESSION_DATABASE_URL,
  applicationName: 'comind-agcol-002-test',
});
const { query, one } = db;
const fixtureTools = createMdoLiveTestFixtures({
  db, model: 'mcp-local-readonly', candidateRef: candidate, candidateKey: runKey,
});
const names = ['scout', 'analyst', 'reviewer'];
const grants = [];
const tasks = [];
let outcome = null;

function artifact(data) {
  const path = process.env.AGCOL_TEST_ARTIFACT ?? 'artifacts/agcol-002-test-acceptance.json';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
function unique(label) {
  return `agcol002-${label}-${randomUUID().replaceAll('-', '')}`;
}
async function createSpecialist(fixture, key, capability) {
  const handle = unique(key);
  const actor = await one(
    `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
     VALUES ($1::uuid, 'agent', $2::text, $3::text, $4::jsonb)
     RETURNING actor_id::text`,
    [fixture.orgId, handle, `AGCOL-002 ${key} Test specialist`,
      JSON.stringify({ synthetic: true, environment: 'isolated', source_ref: 'github:issue:553' })]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent(org_id, name, description, config)
     VALUES ($1::uuid, $2::text, 'Synthetic AGCOL-002 isolated Test specialist', $3::jsonb)
     RETURNING agent_id::text`,
    [fixture.orgId, handle, JSON.stringify({ synthetic: true, source_ref: 'github:issue:553' })]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile(
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       runtime_defaults, competencies, status, activated_at
     ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,
       'C0','C1','agcol-002-test-v1',$6::jsonb,$7::jsonb,'active',clock_timestamp())
     RETURNING profile_id::text`,
    [agent.agent_id, actor.actor_id, fixture.orgId, `agcol_002_${key}`,
      `AGCOL-002 ${key} Test specialist`,
      JSON.stringify({ provider: 'mcp_local', environment: 'isolated', paid_provider_allowed: false }),
      JSON.stringify([key, 'test_collaboration'])]
  );
  const task = await one(
    `INSERT INTO comind.cm_task(project_id, title, status)
     VALUES ($1::uuid, $2::text, 'todo') RETURNING task_id::text`,
    [fixture.project.project_id, `AGCOL-002 ${key} ${runKey}`]
  );
  await query(
    `INSERT INTO comind.cm_foundry_work_lease(task_id, max_attempts) VALUES ($1::uuid, 1)`,
    [task.task_id]
  );
  const resource = `agcol002:${candidate.slice(0, 12)}:${key}:${task.task_id}`;
  const grant = await one(
    `INSERT INTO comind.cm_foundry_capability_grant(
       profile_id, capability_id, org_id, project_id, environment, authority_ceiling,
       scope, granted_by_actor_id, grant_reason, expires_at
     ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'isolated','C1',$5::jsonb,$6::uuid,$7::text,
       clock_timestamp() + interval '45 minutes') RETURNING grant_id::text`,
    [profile.profile_id, capability.capability_id, fixture.orgId, fixture.project.project_id,
      JSON.stringify({ target_refs: [resource], synthetic_only: true, max_tasks: 1 }),
      fixture.sponsor.actor_id, `AGCOL-002 issue #553 ${runKey}`]
  );
  grants.push(grant.grant_id);
  tasks.push(task.task_id);
  return {
    key, profileId: profile.profile_id, actorId: actor.actor_id,
    capabilityId: capability.capability_id, capabilityCode: capability.capability_code,
    taskId: task.task_id, targetKind: 'evidence_resource', targetRef: resource,
    projectId: fixture.project.project_id,
    predecessors: key === 'reviewer' ? ['scout', 'analyst'] : [],
    input: { synthetic: true },
  };
}

try {
  const identity = await db.verifyDatabaseIdentity();
  assert.equal(identity.project_ref, 'sbgfuanxiqepcoboxzcl');
  const fixture = await fixtureTools.ensureSponsorAndFixture();
  const capabilityRows = await query(
    `SELECT capability_id::text, capability_code, action, target_kind, max_authority,
            cost_bearing, adapter
     FROM comind.cm_foundry_capability WHERE capability_code='agcol.test.evidence.read'`
  );
  let capability;
  if (capabilityRows.rows.length === 0) {
    capability = await one(
      `INSERT INTO comind.cm_foundry_capability(
         capability_code, description, action, target_kind, max_authority,
         risk_class, cost_bearing, adapter
       ) VALUES ('agcol.test.evidence.read', 'Isolated synthetic MCP evidence lookup',
         'read', 'evidence_resource', 'C1', 'low', false, 'agcol_mcp_local')
       RETURNING capability_id::text, capability_code, action, target_kind,
                 max_authority, cost_bearing, adapter`
    );
  } else {
    assert.equal(capabilityRows.rows.length, 1);
    capability = capabilityRows.rows[0];
  }
  assert.equal(capability.action, 'read');
  assert.equal(capability.target_kind, 'evidence_resource');
  assert.equal(capability.max_authority, 'C1');
  assert.equal(capability.cost_bearing, false);
  assert.equal(capability.adapter, 'agcol_mcp_local');

  const specialists = [];
  for (const name of names) specialists.push(await createSpecialist(fixture, name, capability));
  const registry = new FoundryAdapterRegistry();
  registry.register('agcol_mcp_local', createReadOnlyMcpAdapter(
    { callTool: (_name, args) => callIsolatedReadOnlyMcp(args.resource) },
    async receipt => {
      const metadata = { schema_version: 'comind.agcol-002.mcp-receipt.v1', issue: 553, candidate, receipt };
      const evidence = await one(
        `INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
         VALUES ('AGCOL-002 read-only MCP receipt', 'agcol_mcp_test',
           $1::text, $2::text, $3::jsonb) RETURNING evidence_id::text`,
        [`agcol002-mcp:${receipt.adapterOperationId}`, sha256Fingerprint(metadata), JSON.stringify(metadata)]
      );
      return evidence.evidence_id;
    }
  ));
  const foundry = new FoundryRuntimeOrchestrator(query, registry);
  const negative = [];
  const expiredDecision = await fixtureTools.issueAuthorization({
    profile: { profileId: specialists[0].profileId }, actorId: specialists[0].actorId,
    capabilityId: specialists[0].capabilityId, projectId: specialists[0].projectId,
    taskId: specialists[0].taskId, targetKind: specialists[0].targetKind,
    targetRef: specialists[0].targetRef, sponsorActorId: fixture.sponsor.actor_id,
    reason: 'AGCOL-002 expired authorization denial.', expired: true,
  });
  try {
    await foundry.execute({
      profileId: specialists[0].profileId, capabilityCode: specialists[0].capabilityCode,
      authorizationDecisionId: expiredDecision, authorityLevel: 'C1', environment: 'isolated',
      projectId: specialists[0].projectId, taskId: specialists[0].taskId,
      targetKind: specialists[0].targetKind, targetRef: specialists[0].targetRef,
      idempotencyKey: `${runKey}:expired-negative`, input: { synthetic: true },
    });
    assert.fail('Expired decision must fail');
  } catch (error) {
    assert.equal(error.code, 'authorization_expired');
    negative.push({ mode: 'expired_authorization', code: error.code });
  }
  outcome = await runParallelCollaboration({
    foundry,
    async claim(task) {
      const worker = `${runKey}:${task.key}`.slice(0, 128);
      const claim = await one(
        `SELECT task_id::text, lease_token::text, fencing_epoch
         FROM comind.cm_agcol_claim_task($1::uuid,$2::uuid,$3::text,180)`,
        [task.taskId, task.projectId, worker]
      );
      return { taskId: claim.task_id, leaseToken: claim.lease_token, fencingEpoch: Number(claim.fencing_epoch) };
    },
    async finish(task, claim, completed) {
      const worker = `${runKey}:${task.key}`.slice(0, 128);
      const row = await one(
        `SELECT comind.cm_foundry_finish_work($1::uuid,$2::text,$3::uuid,$4::bigint,$5::boolean) AS ok`,
        [task.taskId, worker, claim.leaseToken, claim.fencingEpoch, completed]
      );
      if (row.ok && completed) {
        await query(`UPDATE comind.cm_task SET status='done' WHERE task_id=$1::uuid`, [task.taskId]);
      }
      return row.ok;
    },
    async authorize(task) {
      const profile = specialists.find(s => s.key === task.key);
      return fixtureTools.issueAuthorization({
        profile: { profileId: task.profileId }, actorId: profile.actorId,
        capabilityId: profile.capabilityId, projectId: task.projectId, taskId: task.taskId,
        targetKind: task.targetKind, targetRef: task.targetRef,
        sponsorActorId: fixture.sponsor.actor_id,
        reason: `AGCOL-002 independent ${task.key} isolated Test authorization.`,
      });
    },
    async verifyEvidence(task, result) {
      const evidence = await one(
        `SELECT evidence_id::text, metadata FROM comind.cm_evidence
         WHERE evidence_id=$1::uuid AND source_type='agcol_mcp_test'`,
        [result.resultRef]
      );
      assert.equal(evidence.metadata.candidate, candidate);
      assert.equal(evidence.metadata.receipt.executionContextId, result.executionContextId);
      assert.equal(evidence.metadata.receipt.resource, task.targetRef);
      return evidence.evidence_id;
    },
  }, specialists, runKey, 2);
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.receipts.map(x => x.key), names);
  const staleDecision = await fixtureTools.issueAuthorization({
    profile: { profileId: specialists[0].profileId }, actorId: specialists[0].actorId,
    capabilityId: specialists[0].capabilityId, projectId: specialists[0].projectId,
    taskId: specialists[0].taskId, targetKind: specialists[0].targetKind,
    targetRef: specialists[0].targetRef, sponsorActorId: fixture.sponsor.actor_id,
    reason: 'AGCOL-002 consumed grant denial.',
  });
  try {
    await foundry.execute({
      profileId: specialists[0].profileId, capabilityCode: specialists[0].capabilityCode,
      authorizationDecisionId: staleDecision, authorityLevel: 'C1', environment: 'isolated',
      projectId: specialists[0].projectId, taskId: specialists[0].taskId,
      targetKind: specialists[0].targetKind, targetRef: specialists[0].targetRef,
      idempotencyKey: `${runKey}:consumed-negative`, input: { synthetic: true },
    });
    assert.fail('Consumed grant must fail');
  } catch (error) {
    assert.equal(error.code, 'grant_task_limit_exceeded');
    negative.push({ mode: 'consumed_single_task_grant', code: error.code });
  }

  const readback = await one(
    `SELECT
       (SELECT count(*)::int FROM comind.cm_task WHERE task_id=ANY($1::uuid[]) AND status='done') AS done_tasks,
       (SELECT count(*)::int FROM comind.cm_foundry_work_lease
        WHERE task_id=ANY($1::uuid[]) AND state='completed') AS completed_leases,
       (SELECT count(*)::int FROM comind.cm_foundry_execution_context
        WHERE task_id=ANY($1::uuid[])) AS executions,
       (SELECT count(*)::int FROM comind.cm_foundry_execution_outcome eo
        JOIN comind.cm_foundry_execution_context ec ON ec.execution_context_id=eo.execution_context_id
        WHERE ec.task_id=ANY($1::uuid[]) AND eo.terminal_status='succeeded') AS outcomes,
       (SELECT count(*)::int FROM comind.cm_evidence
        WHERE source_type='agcol_mcp_test' AND evidence_id=ANY($2::uuid[])) AS receipts`,
    [tasks, outcome.receipts.map(x => x.evidenceRef)]
  );
  for (const value of Object.values(readback)) assert.equal(value, 3);
  const replay = await runParallelCollaboration({
    foundry, claim: async task => {
      const result = await query(
        `SELECT task_id FROM comind.cm_agcol_claim_task($1::uuid,$2::uuid,$3::text,60)`,
        [task.taskId, task.projectId, `${runKey}:replay`]
      );
      assert.equal(result.rows.length, 0);
      throw new Error('replay refused');
    },
    finish: async () => false, authorize: async () => { throw new Error('not reachable'); },
    verifyEvidence: async () => { throw new Error('not reachable'); },
  }, specialists, runKey, 2);
  assert.equal(replay.status, 'blocked');
  assert.equal(replay.receipts.length, 0);
  await query(`UPDATE comind.cm_foundry_capability_grant SET revoked_at=clock_timestamp()
    WHERE grant_id=ANY($1::uuid[]) AND revoked_at IS NULL`, [grants]);
  const cleanup = await one(`SELECT count(*)::int AS active FROM comind.cm_foundry_capability_grant
    WHERE grant_id=ANY($1::uuid[]) AND revoked_at IS NULL`, [grants]);
  assert.equal(cleanup.active, 0);
  const deniedDecision = await fixtureTools.issueAuthorization({
    profile: { profileId: specialists[0].profileId }, actorId: specialists[0].actorId,
    capabilityId: specialists[0].capabilityId, projectId: specialists[0].projectId,
    taskId: specialists[0].taskId, targetKind: specialists[0].targetKind,
    targetRef: specialists[0].targetRef, sponsorActorId: fixture.sponsor.actor_id,
    reason: 'AGCOL-002 revoked grant denial.',
  });
  try {
    await foundry.execute({
      profileId: specialists[0].profileId, capabilityCode: specialists[0].capabilityCode,
      authorizationDecisionId: deniedDecision, authorityLevel: 'C1', environment: 'isolated',
      projectId: specialists[0].projectId, taskId: specialists[0].taskId,
      targetKind: specialists[0].targetKind, targetRef: specialists[0].targetRef,
      idempotencyKey: `${runKey}:revoked-negative`, input: { synthetic: true },
    });
    assert.fail('Revoked grant must fail');
  } catch (error) {
    assert.equal(error.code, 'grant_not_valid');
    negative.push({ mode: 'revoked_grant', code: error.code });
  }
  artifact({ schema_version: 'comind.agcol-002.test-acceptance.v1', issue: 553,
    outcome: 'accepted_test_proof', candidate_ref: candidate,
    environment: 'isolated', database: identity, project_id: fixture.project.project_id,
    task_ids: tasks, grant_ids: grants, grant_cleanup: cleanup, negative, readback, receipts: outcome.receipts,
    production_authorized: false, paid_provider_authorized: false });
} catch (error) {
  artifact({ schema_version: 'comind.agcol-002.test-acceptance.v1', issue: 553,
    outcome: 'failed_test_proof', candidate_ref: candidate, task_ids: tasks,
    grant_ids: grants, error: { name: error?.name, code: error?.code ?? null, message: error?.message },
    production_authorized: false, paid_provider_authorized: false });
  throw error;
} finally {
  if (grants.length) {
    await query(`UPDATE comind.cm_foundry_capability_grant
      SET revoked_at=clock_timestamp()
      WHERE grant_id=ANY($1::uuid[]) AND revoked_at IS NULL`, [grants]);
    const row = await one(`SELECT count(*)::int AS active FROM comind.cm_foundry_capability_grant
      WHERE grant_id=ANY($1::uuid[]) AND revoked_at IS NULL`, [grants]);
    assert.equal(row.active, 0);
  }
  if (tasks.length) {
    await query(`UPDATE comind.cm_task SET status='blocked'
      WHERE task_id=ANY($1::uuid[]) AND status NOT IN ('done','blocked')`, [tasks]);
  }
  await db.close();
}
