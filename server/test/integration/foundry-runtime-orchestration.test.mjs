import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';

const {
  FoundryAdapterRegistry,
  FoundryRuntimeError,
  FoundryRuntimeOrchestrator,
  completeFoundryDeliberation,
  recordFoundryDeliberationEvent,
} = await import('../../dist/foundry-runtime.js');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', 'db'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci') {
  throw new Error('Refusing Foundry runtime integration outside isolated comind_ci');
}

const pool = new Pool({ connectionString: databaseUrl });
const checkpointWriteMs = [];
const checkpointPayloadBytes = [];
let checkpointWriteCount = 0;
const query = async (text, params = []) => {
  const checkpointWrite = /INSERT INTO comind\.cm_foundry_recovery_checkpoint\b/i.test(text);
  const start = checkpointWrite ? performance.now() : 0;
  const result = await pool.query(text, params);
  if (checkpointWrite) {
    checkpointWriteMs.push(performance.now() - start);
    checkpointPayloadBytes.push(Buffer.byteLength(JSON.stringify(params), 'utf8'));
    checkpointWriteCount++;
  }
  return { rows: result.rows };
};
const one = async (text, params = []) => {
  const result = await query(text, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
};
const expectCode = async (promise, code) => {
  await assert.rejects(
    promise,
    (error) => error instanceof FoundryRuntimeError && error.code === code
  );
};

const suffix = randomUUID().replaceAll('-', '');
const repositoryTarget = 'jlhogarth/CoMind';

let orgId;
let approverActorId;
let projectId;
let taskId;

async function createProfile({ status = 'active', ceiling = 'C2', role = 'runtime_agent' } = {}) {
  const actor = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'agent', $2::text, $3::text)
     RETURNING actor_id::text AS actor_id`,
    [orgId, `issue73-agent-actor-${randomUUID()}`, `Issue 73 ${role}`]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent (org_id, name, description)
     VALUES ($1::uuid, $2::text, $3::text)
     RETURNING agent_id::text AS agent_id`,
    [orgId, `issue73-agent-${randomUUID()}`, `Issue 73 ${role}`]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile (
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       status, activated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
       'C0', $6::text, $7::text,
       $8::text, CASE WHEN $8::text = 'active' THEN NOW() ELSE NULL END
     ) RETURNING profile_id::text AS profile_id`,
    [
      agent.agent_id,
      actor.actor_id,
      orgId,
      role,
      `Issue 73 ${role}`,
      ceiling,
      `issue73-${suffix}-${randomUUID()}`,
      status,
    ]
  );
  return { profileId: profile.profile_id, actorId: actor.actor_id, agentId: agent.agent_id };
}

async function createCapability({
  adapter = 'fake_local',
  costBearing = false,
  maxAuthority = 'C2',
  label = 'execute',
} = {}) {
  const code = `issue73.${label}.${randomUUID().replaceAll('-', '')}`;
  const row = await one(
    `INSERT INTO comind.cm_foundry_capability (
       capability_code, description, action, target_kind,
       max_authority, risk_class, cost_bearing, adapter
     ) VALUES (
       $1::text, $2::text, 'execute', 'repository',
       $3::text, 'low', $4::boolean, $5::text
     ) RETURNING capability_id::text AS capability_id`,
    [code, `Issue 73 ${label} capability`, maxAuthority, costBearing, adapter]
  );
  return { capabilityId: row.capability_id, capabilityCode: code };
}

async function createGrant(profile, capability, {
  targetRefs = [repositoryTarget],
  authority = 'C2',
  grantedAt = null,
  expiresAt = null,
  revokedAt = null,
} = {}) {
  return one(
    `INSERT INTO comind.cm_foundry_capability_grant (
       profile_id, capability_id, org_id, project_id, environment,
       authority_ceiling, scope, granted_by_actor_id, grant_reason,
       granted_at, expires_at, revoked_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'isolated',
       $5::text, $6::jsonb, $7::uuid, $8::text,
       COALESCE($9::timestamptz, NOW()), $10::timestamptz, $11::timestamptz
     ) RETURNING grant_id::text AS grant_id`,
    [
      profile.profileId,
      capability.capabilityId,
      orgId,
      projectId,
      authority,
      JSON.stringify({ target_refs: targetRefs }),
      approverActorId,
      'Issue 73 isolated deterministic grant',
      grantedAt,
      expiresAt,
      revokedAt,
    ]
  );
}

async function createAuthorization(profile, capability, {
  decision = 'approved',
  authority = 'C2',
  targetRef = repositoryTarget,
  requestedAt = null,
  requestExpiresAt = null,
  decidedAt = null,
  effectiveUntil = null,
} = {}) {
  const request = await one(
    `INSERT INTO comind.cm_foundry_authorization_request (
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, task_id, authority_level, environment,
       target_kind, target_ref, reason, requested_at, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::uuid, $5::uuid, $6::text, 'isolated',
       'repository', $7::text, $8::text,
       COALESCE($9::timestamptz, NOW()), $10::timestamptz
     ) RETURNING authorization_request_id::text AS authorization_request_id`,
    [
      profile.profileId,
      profile.actorId,
      capability.capabilityId,
      projectId,
      taskId,
      authority,
      targetRef,
      'Issue 73 deterministic authorization request',
      requestedAt,
      requestExpiresAt,
    ]
  );
  const result = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision (
       authorization_request_id, decision, decided_by_actor_id,
       decision_basis, decided_at, effective_until
     ) VALUES (
       $1::uuid, $2::text, $3::uuid,
       $4::text, COALESCE($5::timestamptz, NOW()), $6::timestamptz
     ) RETURNING authorization_decision_id::text AS authorization_decision_id`,
    [
      request.authorization_request_id,
      decision,
      approverActorId,
      'Issue 73 isolated deterministic decision',
      decidedAt,
      effectiveUntil,
    ]
  );
  return result.authorization_decision_id;
}

async function createInterruptedCheckpoint(profile, capability, authorizationDecisionId, idempotencyKey) {
  const context = await one(
    `INSERT INTO comind.cm_foundry_execution_context (
       profile_id, project_id, task_id, capability_id,
       authorization_decision_id, environment, execution_kind,
       idempotency_key, context
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid,
       $5::uuid, 'isolated', 'recovery',
       $6::text, '{}'::jsonb
     ) RETURNING execution_context_id::text AS execution_context_id`,
    [profile.profileId, projectId, taskId, capability.capabilityId, authorizationDecisionId, idempotencyKey]
  );
  const checkpoint = await one(
    `INSERT INTO comind.cm_foundry_recovery_checkpoint (
       execution_context_id, project_id, checkpoint_kind,
       source_ref, durable_summary, created_by_profile_id
     ) VALUES (
       $1::uuid, $2::uuid, 'provenance_snapshot',
       $3::text, $4::text, $5::uuid
     ) RETURNING recovery_checkpoint_id::text AS recovery_checkpoint_id`,
    [
      context.execution_context_id,
      projectId,
      `issue73-interrupted:${idempotencyKey}`,
      'Interrupted deterministic execution before adapter dispatch.',
      profile.profileId,
    ]
  );
  return checkpoint.recovery_checkpoint_id;
}

const org = await one(
  `INSERT INTO comind.cm_org (name, slug)
   VALUES ($1::text, $2::text)
   RETURNING org_id::text AS org_id`,
  [`Issue 73 Runtime Org ${suffix}`, `issue73-runtime-${suffix}`]
);
orgId = org.org_id;
const approver = await one(
  `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
   VALUES ($1::uuid, 'person', $2::text, 'Issue 73 approver')
   RETURNING actor_id::text AS actor_id`,
  [orgId, `issue73-approver-${suffix}`]
);
approverActorId = approver.actor_id;
const project = await one(
  `INSERT INTO comind.cm_project (org_id, title, slug, created_by)
   VALUES ($1::uuid, $2::text, $3::text, $4::uuid)
   RETURNING project_id::text AS project_id`,
  [orgId, 'Issue 73 Foundry Runtime', `issue73-project-${suffix}`, approverActorId]
);
projectId = project.project_id;
const task = await one(
  `INSERT INTO comind.cm_task (project_id, title, status)
   VALUES ($1::uuid, 'Verify Foundry runtime orchestration', 'in_progress')
   RETURNING task_id::text AS task_id`,
  [projectId]
);
taskId = task.task_id;

const activeProfile = await createProfile();
const agentRun = await one(
  `INSERT INTO comind.cm_agent_run (agent_id, status)
   VALUES ($1::uuid, 'running')
   RETURNING run_id::text AS run_id`,
  [activeProfile.agentId]
);
const agentRunId = agentRun.run_id;

let adapterCalls = 0;
const registry = new FoundryAdapterRegistry();
registry.register('fake_local', async (request) => {
  adapterCalls += 1;
  assert.equal(request.targetRef, repositoryTarget);
  assert.equal(request.authorityLevel, 'C2');
  assert.match(request.requestFingerprint, /^[0-9a-f]{64}$/);
  return {
    status: 'succeeded',
    resultRef: `fake://issue73/${request.requestFingerprint}`,
    summary: 'Deterministic fake adapter completed without external network access.',
  };
});
const orchestrator = new FoundryRuntimeOrchestrator(query, registry);

try {
  const successCapability = await createCapability({ label: 'success' });
  await createGrant(activeProfile, successCapability);
  const successDecisionId = await createAuthorization(activeProfile, successCapability);
  const successRequest = {
    profileId: activeProfile.profileId,
    capabilityCode: successCapability.capabilityCode,
    authorizationDecisionId: successDecisionId,
    authorityLevel: 'C2',
    environment: 'isolated',
    targetKind: 'repository',
    targetRef: repositoryTarget,
    projectId,
    taskId,
    agentRunId,
    idempotencyKey: `issue73-success-${randomUUID()}`,
    input: { operation: 'verify', repository: repositoryTarget },
  };

  const success = await orchestrator.execute(successRequest);
  assert.equal(success.terminalStatus, 'succeeded');
  assert.equal(adapterCalls, 1);
  assert.match(success.requestFingerprint, /^[0-9a-f]{64}$/);

  const persisted = await one(
    `SELECT
       ec.execution_context_id::text,
       cp.recovery_checkpoint_id::text,
       ao.adapter_operation_id::text,
       ar.adapter_operation_result_id::text,
       eo.execution_outcome_id::text,
       ar.terminal_status AS adapter_status,
       eo.terminal_status AS execution_status
     FROM comind.cm_foundry_execution_context AS ec
     JOIN comind.cm_foundry_recovery_checkpoint AS cp
       ON cp.execution_context_id = ec.execution_context_id
     JOIN comind.cm_foundry_adapter_operation AS ao
       ON ao.execution_context_id = ec.execution_context_id
     JOIN comind.cm_foundry_adapter_operation_result AS ar
       ON ar.adapter_operation_id = ao.adapter_operation_id
     JOIN comind.cm_foundry_execution_outcome AS eo
       ON eo.execution_context_id = ec.execution_context_id
     WHERE ec.execution_context_id = $1::uuid`,
    [success.executionContextId]
  );
  assert.equal(persisted.recovery_checkpoint_id, success.recoveryCheckpointId);
  assert.equal(persisted.adapter_operation_id, success.adapterOperationId);
  assert.equal(persisted.adapter_operation_result_id, success.adapterOperationResultId);
  assert.equal(persisted.execution_outcome_id, success.executionOutcomeId);
  assert.equal(persisted.adapter_status, 'succeeded');
  assert.equal(persisted.execution_status, 'succeeded');

  const callsBeforeDuplicate = adapterCalls;
  await expectCode(orchestrator.execute(successRequest), 'duplicate_idempotency');
  assert.equal(adapterCalls, callsBeforeDuplicate);

  await expectCode(
    orchestrator.resumeFromCheckpoint(success.recoveryCheckpointId, {
      ...successRequest,
      idempotencyKey: `issue73-resume-completed-${randomUUID()}`,
    }),
    'checkpoint_not_resumable'
  );
  assert.equal(adapterCalls, callsBeforeDuplicate);

  const missingGrantCapability = await createCapability({ label: 'missing-grant' });
  const missingGrantDecision = await createAuthorization(activeProfile, missingGrantCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: missingGrantCapability.capabilityCode,
    authorizationDecisionId: missingGrantDecision,
    idempotencyKey: `issue73-missing-grant-${randomUUID()}`,
  }), 'grant_not_valid');

  const expiredGrantCapability = await createCapability({ label: 'expired-grant' });
  await createGrant(activeProfile, expiredGrantCapability, {
    grantedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const expiredGrantDecision = await createAuthorization(activeProfile, expiredGrantCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: expiredGrantCapability.capabilityCode,
    authorizationDecisionId: expiredGrantDecision,
    idempotencyKey: `issue73-expired-grant-${randomUUID()}`,
  }), 'grant_not_valid');

  const revokedGrantCapability = await createCapability({ label: 'revoked-grant' });
  await createGrant(activeProfile, revokedGrantCapability, {
    grantedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    revokedAt: new Date().toISOString(),
  });
  const revokedGrantDecision = await createAuthorization(activeProfile, revokedGrantCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: revokedGrantCapability.capabilityCode,
    authorizationDecisionId: revokedGrantDecision,
    idempotencyKey: `issue73-revoked-grant-${randomUUID()}`,
  }), 'grant_not_valid');

  const deniedCapability = await createCapability({ label: 'denied' });
  await createGrant(activeProfile, deniedCapability);
  const deniedDecision = await createAuthorization(activeProfile, deniedCapability, { decision: 'denied' });
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: deniedCapability.capabilityCode,
    authorizationDecisionId: deniedDecision,
    idempotencyKey: `issue73-denied-${randomUUID()}`,
  }), 'authorization_denied');

  const expiredAuthorizationCapability = await createCapability({ label: 'expired-auth' });
  await createGrant(activeProfile, expiredAuthorizationCapability);
  const expiredAuthorizationDecision = await createAuthorization(activeProfile, expiredAuthorizationCapability, {
    requestedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    requestExpiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    decidedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    effectiveUntil: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  });
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: expiredAuthorizationCapability.capabilityCode,
    authorizationDecisionId: expiredAuthorizationDecision,
    idempotencyKey: `issue73-expired-auth-${randomUUID()}`,
  }), 'authorization_expired');

  const authMismatchCapability = await createCapability({ label: 'auth-mismatch' });
  await createGrant(activeProfile, authMismatchCapability, { targetRefs: [repositoryTarget, 'jlhogarth/Other'] });
  const authMismatchDecision = await createAuthorization(activeProfile, authMismatchCapability, { targetRef: repositoryTarget });
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: authMismatchCapability.capabilityCode,
    authorizationDecisionId: authMismatchDecision,
    targetRef: 'jlhogarth/Other',
    idempotencyKey: `issue73-auth-mismatch-${randomUUID()}`,
  }), 'authorization_scope_mismatch');

  const unknownAdapterCapability = await createCapability({ adapter: 'unknown_local', label: 'unknown-adapter' });
  await createGrant(activeProfile, unknownAdapterCapability);
  const unknownAdapterDecision = await createAuthorization(activeProfile, unknownAdapterCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: unknownAdapterCapability.capabilityCode,
    authorizationDecisionId: unknownAdapterDecision,
    idempotencyKey: `issue73-unknown-adapter-${randomUUID()}`,
  }), 'unknown_adapter');

  const costCapability = await createCapability({ costBearing: true, label: 'cost-bearing' });
  await createGrant(activeProfile, costCapability);
  const costDecision = await createAuthorization(activeProfile, costCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: costCapability.capabilityCode,
    authorizationDecisionId: costDecision,
    idempotencyKey: `issue73-budget-required-${randomUUID()}`,
  }), 'budget_binding_required');

  const lowAuthorityCapability = await createCapability({ maxAuthority: 'C1', label: 'low-authority' });
  await createGrant(activeProfile, lowAuthorityCapability);
  const lowAuthorityDecision = await createAuthorization(activeProfile, lowAuthorityCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    capabilityCode: lowAuthorityCapability.capabilityCode,
    authorizationDecisionId: lowAuthorityDecision,
    idempotencyKey: `issue73-authority-overflow-${randomUUID()}`,
  }), 'capability_authority_exceeded');

  const inactiveProfile = await createProfile({ status: 'suspended', role: 'suspended_agent' });
  const inactiveCapability = await createCapability({ label: 'inactive-profile' });
  await createGrant(inactiveProfile, inactiveCapability);
  const inactiveDecision = await createAuthorization(inactiveProfile, inactiveCapability);
  await expectCode(orchestrator.execute({
    ...successRequest,
    profileId: inactiveProfile.profileId,
    capabilityCode: inactiveCapability.capabilityCode,
    authorizationDecisionId: inactiveDecision,
    agentRunId: null,
    idempotencyKey: `issue73-inactive-${randomUUID()}`,
  }), 'profile_inactive');

  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: randomUUID(),
    idempotencyKey: `issue73-auth-missing-${randomUUID()}`,
  }), 'authorization_missing');

  await expectCode(orchestrator.execute({
    ...successRequest,
    environment: 'staging',
    idempotencyKey: `issue73-env-${randomUUID()}`,
  }), 'environment_blocked');

  await expectCode(orchestrator.execute({
    ...successRequest,
    authorityLevel: 'C3',
    idempotencyKey: `issue73-c3-${randomUUID()}`,
  }), 'authority_blocked');

  const interruptedIdempotency = `issue73-interrupted-${randomUUID()}`;
  const interruptedCheckpoint = await createInterruptedCheckpoint(
    activeProfile,
    successCapability,
    successDecisionId,
    interruptedIdempotency
  );
  await expectCode(orchestrator.resumeFromCheckpoint(interruptedCheckpoint, {
    ...successRequest,
    idempotencyKey: interruptedIdempotency,
  }), 'duplicate_idempotency');

  const alternateDecision = await createAuthorization(activeProfile, successCapability, { targetRef: 'jlhogarth/Other' });
  await expectCode(orchestrator.resumeFromCheckpoint(interruptedCheckpoint, {
    ...successRequest,
    authorizationDecisionId: alternateDecision,
    targetRef: 'jlhogarth/Other',
    idempotencyKey: `issue73-resume-scope-${randomUUID()}`,
  }), 'grant_not_valid');

  const costInterruptedIdempotency = `issue73-cost-interrupted-${randomUUID()}`;
  const costInterruptedCheckpoint = await createInterruptedCheckpoint(
    activeProfile,
    costCapability,
    costDecision,
    costInterruptedIdempotency
  );
  await expectCode(orchestrator.resumeFromCheckpoint(costInterruptedCheckpoint, {
    ...successRequest,
    capabilityCode: costCapability.capabilityCode,
    authorizationDecisionId: costDecision,
    idempotencyKey: `issue73-cost-resume-${randomUUID()}`,
  }), 'budget_binding_required');

  const secondProfile = await createProfile({ role: 'deliberation_verifier' });
  const deliberation = await one(
    `INSERT INTO comind.cm_foundry_deliberation (
       project_id, task_id, opened_by_profile_id, topic, protocol, status
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       'Issue 73 deterministic deliberation', 'parallel_planning', 'open'
     ) RETURNING deliberation_id::text AS deliberation_id`,
    [projectId, taskId, activeProfile.profileId]
  );
  const plannerParticipant = await one(
    `INSERT INTO comind.cm_foundry_deliberation_participant (deliberation_id, profile_id, role)
     VALUES ($1::uuid, $2::uuid, 'planner')
     RETURNING participant_id::text AS participant_id`,
    [deliberation.deliberation_id, activeProfile.profileId]
  );
  const verifierParticipant = await one(
    `INSERT INTO comind.cm_foundry_deliberation_participant (deliberation_id, profile_id, role)
     VALUES ($1::uuid, $2::uuid, 'verifier')
     RETURNING participant_id::text AS participant_id`,
    [deliberation.deliberation_id, secondProfile.profileId]
  );

  const proposalId = await recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: plannerParticipant.participant_id,
    eventType: 'proposal',
    claim: 'Use append-only runtime outcomes.',
    roundNumber: 1,
    arbitrationPass: 0,
  });
  await expectCode(completeFoundryDeliberation(query, {
    deliberationId: deliberation.deliberation_id,
    outcome: 'accepted',
    summary: 'Verifier has not participated.',
  }), 'deliberation_silence');

  const objectionId = await recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: verifierParticipant.participant_id,
    eventType: 'objection',
    claim: 'Require explicit recovery revalidation.',
    roundNumber: 1,
    arbitrationPass: 0,
    replyToEventId: proposalId,
  });
  const evidenceId = await recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: plannerParticipant.participant_id,
    eventType: 'evidence',
    claim: 'Resume re-enters the full capability broker.',
    roundNumber: 2,
    arbitrationPass: 0,
    replyToEventId: objectionId,
  });
  await recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: verifierParticipant.participant_id,
    eventType: 'dissent',
    claim: 'Retain professional dissent on future external adapter activation.',
    roundNumber: 2,
    arbitrationPass: 1,
    replyToEventId: evidenceId,
  });
  await recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: plannerParticipant.participant_id,
    eventType: 'decision',
    claim: 'Accept deterministic isolated orchestration with recorded dissent.',
    roundNumber: 2,
    arbitrationPass: 1,
    replyToEventId: evidenceId,
  });

  await expectCode(completeFoundryDeliberation(query, {
    deliberationId: deliberation.deliberation_id,
    outcome: 'accepted',
    summary: 'Dissent must remain first class.',
  }), 'dissent_requires_qualified_outcome');

  const deliberationOutcomeId = await completeFoundryDeliberation(query, {
    deliberationId: deliberation.deliberation_id,
    outcome: 'accepted_with_dissent',
    summary: 'Deterministic orchestration accepted with explicit professional dissent.',
  });
  assert.match(deliberationOutcomeId, /^[0-9a-f-]{36}$/);

  await expectCode(recordFoundryDeliberationEvent(query, {
    deliberationId: deliberation.deliberation_id,
    participantId: plannerParticipant.participant_id,
    eventType: 'verification_note',
    claim: 'No events may be appended after terminal outcome through the runtime API.',
    roundNumber: 2,
    arbitrationPass: 1,
  }), 'deliberation_terminal');

  assert.equal(adapterCalls, 1, 'all rejected cases must fail before fake adapter execution');
  assert.ok(checkpointWriteCount >= 1, 'Expected at least one real checkpoint INSERT');
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Number(sorted[Math.ceil(sorted.length * p / 100) - 1].toFixed(3));
  };
  const baseline = {
    schema_version: 1,
    kind: 'isolated_postgresql_checkpoint_write',
    sample_count: checkpointWriteCount,
    checkpoint_insert_ms: { p50: percentile(checkpointWriteMs, 50), p95: percentile(checkpointWriteMs, 95) },
    checkpoint_parameter_bytes: { min: Math.min(...checkpointPayloadBytes), max: Math.max(...checkpointPayloadBytes) },
    node: process.version,
    limitations: ['Includes pool acquisition and PostgreSQL roundtrip', 'CI host variability', 'Small opportunistic sample from existing integration assertions', 'Not production latency or an instrumented-vs-uninstrumented comparison'],
    warnings: [],
  };
  mkdirSync('../artifacts', { recursive: true });
  writeFileSync('../artifacts/foundry-checkpoint-postgres-baseline.json', JSON.stringify(baseline) + '\n');
  console.log(JSON.stringify(baseline));
  console.log('Foundry runtime orchestration integration passed');
} finally {
  await pool.end();
}
