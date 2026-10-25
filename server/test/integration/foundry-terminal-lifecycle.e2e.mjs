import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const {
  FoundryAdapterRegistry,
  FoundryRuntimeOrchestrator,
  persistFoundryTerminalResultAtomic,
} = await import('../../dist/foundry-runtime.js');
const {
  FoundryLifecycleError,
  finalizeBoundedFoundryWork,
  readFoundryLifecycle,
} = await import('../../dist/foundry-lifecycle.js');

function requireIsolatedDatabaseUrl(raw) {
  if (!raw) throw new Error('DATABASE_URL is required');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname)
    || parsed.pathname !== '/comind_ci') {
    throw new Error('Refusing Foundry terminal lifecycle verification outside isolated local comind_ci');
  }
  return raw;
}

const pool = new Pool({ connectionString: requireIsolatedDatabaseUrl(process.env.DATABASE_URL) });
const query = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return { rows: result.rows };
};
const one = async (sql, params = []) => {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
};

async function createFixture(label) {
  const suffix = randomUUID().replaceAll('-', '');
  const org = await one(
    `INSERT INTO comind.cm_org (name, slug)
     VALUES ($1::text, $2::text) RETURNING org_id::text AS id`,
    [`Issue 169 ${label} ${suffix}`, `issue169-${label}-${suffix}`]
  );
  const approver = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'person', $2::text, 'Issue 169 approver')
     RETURNING actor_id::text AS id`,
    [org.id, `issue169-approver-${suffix}`]
  );
  const agentActor = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'agent', $2::text, 'Issue 169 lifecycle agent')
     RETURNING actor_id::text AS id`,
    [org.id, `issue169-agent-${suffix}`]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent (org_id, name, description)
     VALUES ($1::uuid, $2::text, 'Issue 169 bounded lifecycle verification')
     RETURNING agent_id::text AS id`,
    [org.id, `Issue 169 lifecycle agent ${suffix}`]
  );
  const project = await one(
    `INSERT INTO comind.cm_project (org_id, title, slug, created_by)
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid)
     RETURNING project_id::text AS id`,
    [org.id, `Issue 169 ${label}`, `issue169-project-${suffix}`, approver.id]
  );
  const task = await one(
    `INSERT INTO comind.cm_task (project_id, title, status)
     VALUES ($1::uuid, $2::text, 'in_progress')
     RETURNING task_id::text AS id`,
    [project.id, `Issue 169 ${label} task`]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile (
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       runtime_defaults, competencies, status, activated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
       'C0', 'C1', 'issue169-v1', '{}'::jsonb, '[]'::jsonb, 'active', NOW()
     ) RETURNING profile_id::text AS id`,
    [agent.id, agentActor.id, org.id, `issue169_${label}`, `Issue 169 ${label}`]
  );
  const capabilityCode = `foundry.test.issue169.${label}.${suffix}`;
  const capability = await one(
    `INSERT INTO comind.cm_foundry_capability (
       capability_code, description, action, target_kind, max_authority,
       risk_class, cost_bearing, adapter
     ) VALUES ($1::text, 'Issue 169 terminal lifecycle', 'verify_lifecycle',
       'repository', 'C1', 'low', false, 'lifecycle_test')
     RETURNING capability_id::text AS id`,
    [capabilityCode]
  );
  const targetRef = `synthetic:issue169:${label}:${suffix}`;
  await query(
    `INSERT INTO comind.cm_foundry_capability_grant (
       profile_id, capability_id, org_id, project_id, environment,
       authority_ceiling, scope, granted_by_actor_id, grant_reason
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'isolated',
       'C1', $5::jsonb, $6::uuid, 'Issue 169 isolated lifecycle verification')`,
    [
      profile.id,
      capability.id,
      org.id,
      project.id,
      JSON.stringify({ max_tasks: 1, synthetic_only: true, target_refs: [targetRef] }),
      approver.id,
    ]
  );
  const authorizationRequest = await one(
    `INSERT INTO comind.cm_foundry_authorization_request (
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, task_id, authority_level, environment,
       target_kind, target_ref, reason, status
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       'C1', 'isolated', 'repository', $6::text,
       'Issue 169 isolated terminal lifecycle verification', 'approved')
     RETURNING authorization_request_id::text AS id`,
    [profile.id, agentActor.id, capability.id, project.id, task.id, targetRef]
  );
  const decision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision (
       authorization_request_id, decision, decided_by_actor_id, decision_basis
     ) VALUES ($1::uuid, 'approved', $2::uuid, 'Issue 169 isolated verification')
     RETURNING authorization_decision_id::text AS id`,
    [authorizationRequest.id, approver.id]
  );
  await query(
    `INSERT INTO comind.cm_foundry_work_lease (task_id, max_attempts)
     VALUES ($1::uuid, 1)`,
    [task.id]
  );
  return { org, approver, agentActor, agent, project, task, profile, capability, capabilityCode, targetRef, decision };
}

async function claimTask(taskId, workerId) {
  const claim = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work($1::text, 120)`,
    [workerId]
  );
  assert.equal(claim.task_id, taskId);
  return claim;
}

async function executeFixture(fixture, terminalStatus) {
  const registry = new FoundryAdapterRegistry();
  registry.register('lifecycle_test', async () => ({
    status: terminalStatus,
    resultRef: terminalStatus === 'succeeded' ? `synthetic://${fixture.task.id}` : null,
    errorCode: terminalStatus === 'succeeded' ? null : 'synthetic_failure',
    summary: `Issue 169 ${terminalStatus} terminal result`,
  }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);
  return orchestrator.execute({
    profileId: fixture.profile.id,
    capabilityCode: fixture.capabilityCode,
    authorizationDecisionId: fixture.decision.id,
    authorityLevel: 'C1',
    environment: 'isolated',
    targetKind: 'repository',
    targetRef: fixture.targetRef,
    projectId: fixture.project.id,
    taskId: fixture.task.id,
    idempotencyKey: `issue169-${randomUUID()}`,
    input: { synthetic: true, test_case: terminalStatus },
  });
}

test('successful one-attempt execution reconciles lease, task, and derived lifecycle state', async () => {
  const fixture = await createFixture('success');
  const workerId = `issue169-success-${randomUUID()}`;
  const claim = await claimTask(fixture.task.id, workerId);
  const execution = await executeFixture(fixture, 'succeeded');
  const finalized = await finalizeBoundedFoundryWork(query, {
    taskId: fixture.task.id,
    workerInstanceId: workerId,
    leaseToken: claim.lease_token,
    fencingEpoch: claim.fencing_epoch,
    executionContextId: execution.executionContextId,
    adapterOperationId: execution.adapterOperationId,
    terminalStatus: execution.terminalStatus,
  });
  assert.deepEqual(finalized, { finalized: true, taskStatus: 'done', leaseState: 'completed' });
  const projection = await readFoundryLifecycle(query, execution.executionContextId);
  assert.equal(projection.taskStatus, 'done');
  assert.equal(projection.leaseState, 'completed');
  assert.equal(projection.attemptCount, 1);
  assert.equal(projection.maxAttempts, 1);
  assert.equal(projection.executionHeaderClosedAt, null);
  assert.equal(projection.executionTerminalStatus, 'succeeded');
  assert.equal(projection.executionEffectiveState, 'closed');
  assert.equal(projection.adapterHeaderStatus, 'approved');
  assert.equal(projection.adapterHeaderCompletedAt, null);
  assert.equal(projection.adapterTerminalStatus, 'succeeded');
  assert.equal(projection.adapterEffectiveState, 'succeeded');
  assert.equal(projection.lifecycleConsistency, 'consistent');
});

test('failed one-attempt execution exhausts the lease and blocks the task', async () => {
  const fixture = await createFixture('failure');
  const workerId = `issue169-failure-${randomUUID()}`;
  const claim = await claimTask(fixture.task.id, workerId);
  const execution = await executeFixture(fixture, 'failed');
  const finalized = await finalizeBoundedFoundryWork(query, {
    taskId: fixture.task.id,
    workerInstanceId: workerId,
    leaseToken: claim.lease_token,
    fencingEpoch: claim.fencing_epoch,
    executionContextId: execution.executionContextId,
    adapterOperationId: execution.adapterOperationId,
    terminalStatus: execution.terminalStatus,
  });
  assert.deepEqual(finalized, { finalized: true, taskStatus: 'blocked', leaseState: 'exhausted' });
  const projection = await readFoundryLifecycle(query, execution.executionContextId);
  assert.equal(projection.taskStatus, 'blocked');
  assert.equal(projection.leaseState, 'exhausted');
  assert.equal(projection.executionTerminalStatus, 'failed');
  assert.equal(projection.executionEffectiveState, 'closed');
  assert.equal(projection.adapterHeaderStatus, 'approved');
  assert.equal(projection.adapterTerminalStatus, 'failed');
  assert.equal(projection.adapterEffectiveState, 'failed');
  assert.equal(projection.lifecycleConsistency, 'consistent');
});

test('stale fencing epoch cannot mutate lease or task terminal state', async () => {
  const fixture = await createFixture('stale');
  const workerId = `issue169-stale-${randomUUID()}`;
  const claim = await claimTask(fixture.task.id, workerId);
  const execution = await executeFixture(fixture, 'succeeded');
  await assert.rejects(
    finalizeBoundedFoundryWork(query, {
      taskId: fixture.task.id,
      workerInstanceId: workerId,
      leaseToken: claim.lease_token,
      fencingEpoch: Number(claim.fencing_epoch) + 1,
      executionContextId: execution.executionContextId,
      adapterOperationId: execution.adapterOperationId,
      terminalStatus: execution.terminalStatus,
    }),
    (error) => error instanceof FoundryLifecycleError && error.code === 'fence_rejected'
  );
  const unchanged = await one(
    `SELECT t.status AS task_status, l.state AS lease_state
     FROM comind.cm_task AS t
     JOIN comind.cm_foundry_work_lease AS l ON l.task_id = t.task_id
     WHERE t.task_id = $1::uuid`,
    [fixture.task.id]
  );
  assert.equal(unchanged.task_status, 'in_progress');
  assert.equal(unchanged.lease_state, 'leased');
  await finalizeBoundedFoundryWork(query, {
    taskId: fixture.task.id,
    workerInstanceId: workerId,
    leaseToken: claim.lease_token,
    fencingEpoch: claim.fencing_epoch,
    executionContextId: execution.executionContextId,
    adapterOperationId: execution.adapterOperationId,
    terminalStatus: execution.terminalStatus,
  });
});

test('atomic terminal persistence rolls back adapter result when outcome insert fails', async () => {
  const fixture = await createFixture('atomicity');
  const context = await one(
    `INSERT INTO comind.cm_foundry_execution_context (
       profile_id, project_id, task_id, capability_id,
       authorization_decision_id, environment, execution_kind,
       idempotency_key, context
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
       $5::uuid, 'isolated', 'adapter_operation', $6::text, '{}'::jsonb)
     RETURNING execution_context_id::text AS id`,
    [fixture.profile.id, fixture.project.id, fixture.task.id, fixture.capability.id, fixture.decision.id, `issue169-atomic-context-${randomUUID()}`]
  );
  const operationOne = await one(
    `INSERT INTO comind.cm_foundry_adapter_operation (
       execution_context_id, capability_id, adapter, operation_name,
       target_kind, target_ref, idempotency_key, request_fingerprint, status
     ) VALUES ($1::uuid, $2::uuid, 'lifecycle_test', 'verify_lifecycle',
       'repository', $3::text, $4::text, $5::text, 'approved')
     RETURNING adapter_operation_id::text AS id`,
    [context.id, fixture.capability.id, fixture.targetRef, `issue169-op1-${randomUUID()}`, 'a'.repeat(64)]
  );
  const operationTwo = await one(
    `INSERT INTO comind.cm_foundry_adapter_operation (
       execution_context_id, capability_id, adapter, operation_name,
       target_kind, target_ref, idempotency_key, request_fingerprint, status
     ) VALUES ($1::uuid, $2::uuid, 'lifecycle_test', 'verify_lifecycle',
       'repository', $3::text, $4::text, $5::text, 'approved')
     RETURNING adapter_operation_id::text AS id`,
    [context.id, fixture.capability.id, fixture.targetRef, `issue169-op2-${randomUUID()}`, 'b'.repeat(64)]
  );
  const seededResult = await one(
    `INSERT INTO comind.cm_foundry_adapter_operation_result (
       adapter_operation_id, terminal_status, result_fingerprint, summary
     ) VALUES ($1::uuid, 'succeeded', $2::text, 'Seeded terminal result')
     RETURNING adapter_operation_result_id::text AS id`,
    [operationOne.id, 'c'.repeat(64)]
  );
  await query(
    `INSERT INTO comind.cm_foundry_execution_outcome (
       execution_context_id, adapter_operation_result_id,
       terminal_status, summary
     ) VALUES ($1::uuid, $2::uuid, 'succeeded', 'Seeded outcome')`,
    [context.id, seededResult.id]
  );
  await assert.rejects(
    persistFoundryTerminalResultAtomic(query, context.id, operationTwo.id, {
      status: 'failed',
      errorCode: 'forced_collision',
      summary: 'This outcome must collide with the seeded execution outcome',
    })
  );
  const rolledBack = await one(
    `SELECT count(*)::int AS result_count
     FROM comind.cm_foundry_adapter_operation_result
     WHERE adapter_operation_id = $1::uuid`,
    [operationTwo.id]
  );
  assert.equal(Number(rolledBack.result_count), 0);
});

test.after(async () => {
  await pool.end();
});
