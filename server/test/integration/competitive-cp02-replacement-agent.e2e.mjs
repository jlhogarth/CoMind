import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

import { loadCanonicalCompetitiveContinuity } from '../support/competitive-live-continuity.mjs';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } = await import('../../dist/foundry-runtime.js');
const { finalizeBoundedFoundryWork } = await import('../../dist/foundry-lifecycle.js');
const { createLocalOllamaFoundryAdapter } = await import('../../dist/providers/ollama-foundry-adapter.js');

function requireIsolatedDatabaseUrl(raw) {
  if (!raw) throw new Error('DATABASE_URL is required');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname)
    || parsed.pathname !== '/comind_ci') {
    throw new Error('Refusing CP-02 execution outside isolated local comind_ci');
  }
  return raw;
}

const continuity = await loadCanonicalCompetitiveContinuity({
  rawDatabaseUrl: process.env.SUPABASE_SESSION_DATABASE_URL,
  consumerRef: 'consumer:competitive-proof:cp02-execution',
  providerRef: 'ollama_local',
  actorRef: 'actor:replacement-pending-independent-authority',
});

const pool = new Pool({ connectionString: requireIsolatedDatabaseUrl(process.env.DATABASE_URL) });
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL ?? 'qwen3:0.6b';
const artifactPath = process.env.CP02_ARTIFACT ?? 'artifacts/cp02-replacement-agent-evidence.json';
const suffix = randomUUID().replaceAll('-', '');
const targetRef = `continuity:${continuity.scopeSemanticKey}`;
const obligationToken = `cp02-obligation-${suffix}`;
const capabilityCode = `competitive.cp02.handoff`;

const query = async (sql, params = []) => ({ rows: (await pool.query(sql, params)).rows });
const one = async (sql, params = []) => {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
};

async function createAgentFixture({ orgId, roleCode, displayName, handle, provider }) {
  const actor = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'agent', $2::text, $3::text)
     RETURNING actor_id::text AS id`,
    [orgId, handle, displayName]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent (org_id, name, description)
     VALUES ($1::uuid, $2::text, $3::text)
     RETURNING agent_id::text AS id`,
    [orgId, displayName, `CP-02 ${roleCode} synthetic replacement proof`]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile (
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       runtime_defaults, competencies, status, activated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
       'C0', 'C1', 'cp02-v1', $6::jsonb,
       '["handoff","continuity_verification"]'::jsonb, 'active', NOW()
     ) RETURNING profile_id::text AS id`,
    [agent.id, actor.id, orgId, roleCode, displayName, JSON.stringify({ provider, model })]
  );
  return { actor, agent, profile };
}

async function grantCapability({ profileId, capabilityId, orgId, projectId, approverId, reason }) {
  return one(
    `INSERT INTO comind.cm_foundry_capability_grant (
       profile_id, capability_id, org_id, project_id, environment,
       authority_ceiling, scope, granted_by_actor_id, grant_reason
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'isolated', 'C1',
       $5::jsonb, $6::uuid, $7::text
     ) RETURNING grant_id::text AS id`,
    [
      profileId,
      capabilityId,
      orgId,
      projectId,
      JSON.stringify({ target_refs: [targetRef], max_tasks: 1, synthetic_only: true }),
      approverId,
      reason,
    ]
  );
}

async function authorize({ profileId, actorId, capabilityId, projectId, taskId, approverId, reason }) {
  const request = await one(
    `INSERT INTO comind.cm_foundry_authorization_request (
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, task_id, authority_level, environment,
       target_kind, target_ref, reason, evidence_refs
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       'C1', 'isolated', 'continuity_scope', $6::text, $7::text, $8::jsonb
     ) RETURNING authorization_request_id::text AS id`,
    [
      profileId,
      actorId,
      capabilityId,
      projectId,
      taskId,
      targetRef,
      reason,
      JSON.stringify([
        { kind: 'continuity_digest', ref: continuity.handoff.continuityDigest },
        { kind: 'checkpoint', ref: continuity.currentCheckpointId },
      ]),
    ]
  );
  const decision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision (
       authorization_request_id, decision, decided_by_actor_id, decision_basis, policy_refs
     ) VALUES ($1::uuid, 'approved', $2::uuid, $3::text, $4::jsonb)
     RETURNING authorization_decision_id::text AS id`,
    [
      request.id,
      approverId,
      'Independent CP-02 synthetic authority decision for this actor and task only',
      JSON.stringify(['RULE-ARCH-001-v2', 'CP-02-independent-authority']),
    ]
  );
  return { request, decision };
}

async function executeBounded({
  taskId,
  workerId,
  profileId,
  authorizationDecisionId,
  prompt,
  input,
  orchestrator,
}) {
  await query(
    `INSERT INTO comind.cm_foundry_work_lease (task_id, max_attempts)
     VALUES ($1::uuid, 1)`,
    [taskId]
  );
  const claim = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
       FROM comind.cm_foundry_claim_work($1::text, 180)`,
    [workerId]
  );
  assert.equal(claim.task_id, taskId);

  let execution;
  try {
    execution = await orchestrator.execute({
      profileId,
      capabilityCode,
      authorizationDecisionId,
      authorityLevel: 'C1',
      environment: 'isolated',
      targetKind: 'continuity_scope',
      targetRef,
      projectId,
      taskId,
      idempotencyKey: `cp02-${randomUUID()}`,
      input: {
        synthetic: true,
        prompt,
        ...input,
      },
    });
  } catch (error) {
    await query(
      `SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, false)`,
      [taskId, workerId, claim.lease_token, claim.fencing_epoch]
    );
    throw error;
  }

  assert.equal(execution.terminalStatus, 'succeeded');
  const finished = await finalizeBoundedFoundryWork(query, {
    taskId,
    workerInstanceId: workerId,
    leaseToken: claim.lease_token,
    fencingEpoch: claim.fencing_epoch,
    executionContextId: execution.executionContextId,
    adapterOperationId: execution.adapterOperationId,
    terminalStatus: execution.terminalStatus,
  });
  assert.equal(finished.finalized, true);
  assert.equal(finished.taskStatus, 'done');
  assert.equal(finished.leaseState, 'completed');

  const readback = await one(
    `SELECT
       ec.execution_context_id::text,
       ec.profile_id::text,
       ec.authorization_decision_id::text,
       ar.authorization_request_id::text,
       ar.requesting_profile_id::text,
       ar.requesting_actor_id::text,
       ad.decided_by_actor_id::text,
       eo.terminal_status,
       aor.result_ref,
       aor.summary,
       l.state AS lease_state,
       l.attempt_count,
       count(DISTINCT ev.event_id)::int AS lease_event_count
     FROM comind.cm_foundry_execution_context ec
     JOIN comind.cm_foundry_authorization_decision ad
       ON ad.authorization_decision_id = ec.authorization_decision_id
     JOIN comind.cm_foundry_authorization_request ar
       ON ar.authorization_request_id = ad.authorization_request_id
     JOIN comind.cm_foundry_execution_outcome eo
       ON eo.execution_context_id = ec.execution_context_id
     JOIN comind.cm_foundry_adapter_operation_result aor
       ON aor.adapter_operation_result_id = eo.adapter_operation_result_id
     JOIN comind.cm_foundry_work_lease l ON l.task_id = ec.task_id
     LEFT JOIN comind.cm_foundry_work_lease_event ev ON ev.task_id = ec.task_id
     WHERE ec.execution_context_id = $1::uuid
     GROUP BY ec.execution_context_id, ec.profile_id, ec.authorization_decision_id,
              ar.authorization_request_id, ar.requesting_profile_id,
              ar.requesting_actor_id, ad.decided_by_actor_id,
              eo.terminal_status, aor.result_ref, aor.summary,
              l.state, l.attempt_count`,
    [execution.executionContextId]
  );
  assert.equal(readback.terminal_status, 'succeeded');
  assert.equal(readback.lease_state, 'completed');
  assert.equal(Number(readback.attempt_count), 1);
  assert.equal(Number(readback.lease_event_count), 2);
  assert.ok(readback.summary.length > 0);
  return { execution, readback };
}

let projectId;
try {
  const db = await one('SELECT current_database() AS name');
  assert.equal(db.name, 'comind_ci');

  const org = await one(
    `INSERT INTO comind.cm_org (name, slug)
     VALUES ($1::text, $2::text) RETURNING org_id::text AS id`,
    [`CP-02 Replacement Org ${suffix}`, `cp02-${suffix}`]
  );
  const approver = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'person', $2::text, 'CP-02 independent authority approver')
     RETURNING actor_id::text AS id`,
    [org.id, `cp02-approver-${suffix}`]
  );
  const predecessor = await createAgentFixture({
    orgId: org.id,
    roleCode: 'cp02_predecessor',
    displayName: 'CP-02 Predecessor Agent',
    handle: `cp02-predecessor-${suffix}`,
    provider: 'ollama_local',
  });
  const replacement = await createAgentFixture({
    orgId: org.id,
    roleCode: 'cp02_replacement',
    displayName: 'CP-02 Replacement Agent',
    handle: `cp02-replacement-${suffix}`,
    provider: 'ollama_local',
  });
  assert.notEqual(predecessor.actor.id, replacement.actor.id);
  assert.notEqual(predecessor.profile.id, replacement.profile.id);

  const project = await one(
    `INSERT INTO comind.cm_project (org_id, title, slug, created_by)
     VALUES ($1::uuid, 'CP-02 replacement-agent proof', $2::text, $3::uuid)
     RETURNING project_id::text AS id`,
    [org.id, `cp02-proof-${suffix}`, approver.id]
  );
  projectId = project.id;

  const capability = await one(
    `INSERT INTO comind.cm_foundry_capability (
       capability_code, description, action, target_kind, max_authority,
       risk_class, cost_bearing, adapter
     ) VALUES (
       $1::text, 'Execute a bounded competitive continuity handoff',
       'continue_handoff', 'continuity_scope', 'C1', 'low', false, 'ollama_local'
     ) RETURNING capability_id::text AS id`,
    [capabilityCode]
  );

  const predecessorGrant = await grantCapability({
    profileId: predecessor.profile.id,
    capabilityId: capability.id,
    orgId: org.id,
    projectId: project.id,
    approverId: approver.id,
    reason: 'Independent predecessor grant for one synthetic CP-02 task',
  });
  const replacementGrant = await grantCapability({
    profileId: replacement.profile.id,
    capabilityId: capability.id,
    orgId: org.id,
    projectId: project.id,
    approverId: approver.id,
    reason: 'Independent replacement grant for one synthetic CP-02 task',
  });
  assert.notEqual(predecessorGrant.id, replacementGrant.id);

  const registry = new FoundryAdapterRegistry();
  registry.register('ollama_local', createLocalOllamaFoundryAdapter({
    baseUrl: ollamaBaseUrl,
    model,
    maxOutputTokens: 128,
  }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);

  // Stage 1: predecessor performs a bounded task and leaves a recoverable result.
  const predecessorTask = await one(
    `INSERT INTO comind.cm_task (project_id, title, status)
     VALUES ($1::uuid, 'Prepare CP-02 continuity handoff', 'todo')
     RETURNING task_id::text AS id`,
    [project.id]
  );
  const predecessorAuthority = await authorize({
    profileId: predecessor.profile.id,
    actorId: predecessor.actor.id,
    capabilityId: capability.id,
    projectId: project.id,
    taskId: predecessorTask.id,
    approverId: approver.id,
    reason: 'Predecessor may perform only its bounded handoff preparation task',
  });

  const predecessorPrompt = [
    'You are the predecessor worker in a bounded synthetic handoff proof.',
    `Current checkpoint: ${continuity.currentCheckpointId}.`,
    `Continuity digest: ${continuity.handoff.continuityDigest}.`,
    `Unresolved obligation token: ${obligationToken}.`,
    'Confirm that the obligation must be handed to a replacement worker. Keep the response concise.',
  ].join('\n');
  const predecessorRun = await executeBounded({
    taskId: predecessorTask.id,
    workerId: `cp02-predecessor-worker-${suffix}`,
    profileId: predecessor.profile.id,
    authorizationDecisionId: predecessorAuthority.decision.id,
    prompt: predecessorPrompt,
    input: {
      role: 'predecessor',
      continuity_digest: continuity.handoff.continuityDigest,
      current_checkpoint_id: continuity.currentCheckpointId,
      unresolved_obligation: obligationToken,
    },
    orchestrator,
  });
  assert.equal(predecessorRun.readback.profile_id, predecessor.profile.id);
  assert.equal(predecessorRun.readback.requesting_actor_id, predecessor.actor.id);

  // Stage 2: replacement receives continuity + predecessor result reference, but
  // gets its own grant and authorization decision before it can execute.
  const replacementTask = await one(
    `INSERT INTO comind.cm_task (project_id, title, status)
     VALUES ($1::uuid, 'Complete CP-02 replacement obligation', 'todo')
     RETURNING task_id::text AS id`,
    [project.id]
  );
  const replacementAuthority = await authorize({
    profileId: replacement.profile.id,
    actorId: replacement.actor.id,
    capabilityId: capability.id,
    projectId: project.id,
    taskId: replacementTask.id,
    approverId: approver.id,
    reason: 'Replacement independently authorized for one continuation task; predecessor authority does not transfer',
  });
  assert.notEqual(predecessorAuthority.request.id, replacementAuthority.request.id);
  assert.notEqual(predecessorAuthority.decision.id, replacementAuthority.decision.id);

  const replacementPrompt = [
    'You are the replacement worker in a bounded synthetic handoff proof.',
    `Accepted current checkpoint: ${continuity.currentCheckpointId}.`,
    `Historical predecessor checkpoint: ${continuity.predecessorCheckpointId}.`,
    `Continuity digest: ${continuity.handoff.continuityDigest}.`,
    `Unresolved obligation token: ${obligationToken}.`,
    `Predecessor result reference: ${predecessorRun.readback.result_ref}.`,
    'Your authority is independent and task-scoped; predecessor authority is not inherited.',
    'Return a concise confirmation that the current checkpoint and obligation were received and that predecessor authority was not inherited.',
  ].join('\n');

  const replacementRun = await executeBounded({
    taskId: replacementTask.id,
    workerId: `cp02-replacement-worker-${suffix}`,
    profileId: replacement.profile.id,
    authorizationDecisionId: replacementAuthority.decision.id,
    prompt: replacementPrompt,
    input: {
      role: 'replacement',
      continuity_digest: continuity.handoff.continuityDigest,
      current_checkpoint_id: continuity.currentCheckpointId,
      predecessor_checkpoint_id: continuity.predecessorCheckpointId,
      predecessor_result_ref: predecessorRun.readback.result_ref,
      unresolved_obligation: obligationToken,
      predecessor_authority_inherited: false,
      authority_validation: 'independent_foundry_grant_and_decision',
    },
    orchestrator,
  });

  assert.equal(replacementRun.readback.profile_id, replacement.profile.id);
  assert.equal(replacementRun.readback.requesting_profile_id, replacement.profile.id);
  assert.equal(replacementRun.readback.requesting_actor_id, replacement.actor.id);
  assert.equal(replacementRun.readback.authorization_decision_id, replacementAuthority.decision.id);
  assert.notEqual(replacementRun.readback.profile_id, predecessorRun.readback.profile_id);
  assert.notEqual(replacementRun.readback.requesting_actor_id, predecessorRun.readback.requesting_actor_id);
  assert.notEqual(replacementRun.readback.authorization_decision_id, predecessorRun.readback.authorization_decision_id);
  assert.equal(replacementRun.readback.decided_by_actor_id, approver.id);

  const evidence = {
    evidence_version: 'cp02-replacement-agent-v1',
    proof_id: 'CP-02',
    environment: 'Test continuity read-only + isolated Foundry execution',
    result: 'PASS',
    continuity: {
      canonical_tracking_key: continuity.trackingKey,
      scope_id: continuity.scopeId,
      scope_semantic_key: continuity.scopeSemanticKey,
      continuity_digest: continuity.handoff.continuityDigest,
      current_checkpoint_id: continuity.currentCheckpointId,
      predecessor_checkpoint_id: continuity.predecessorCheckpointId,
      transaction_read_only: continuity.transactionReadOnly,
    },
    handoff: {
      unresolved_obligation: obligationToken,
      predecessor_result_ref: predecessorRun.readback.result_ref,
      predecessor_recovery_checkpoint_id: predecessorRun.execution.recoveryCheckpointId,
      replacement_received_same_continuity_digest: true,
      predecessor_authority_inherited: false,
      authority_validation: 'independent_foundry_grant_and_decision',
    },
    predecessor: {
      actor_id: predecessor.actor.id,
      profile_id: predecessor.profile.id,
      grant_id: predecessorGrant.id,
      authorization_request_id: predecessorAuthority.request.id,
      authorization_decision_id: predecessorAuthority.decision.id,
      task_id: predecessorTask.id,
      execution_context_id: predecessorRun.execution.executionContextId,
      terminal_status: predecessorRun.readback.terminal_status,
      lease_state: predecessorRun.readback.lease_state,
      attempt_count: Number(predecessorRun.readback.attempt_count),
      lease_event_count: Number(predecessorRun.readback.lease_event_count),
    },
    replacement: {
      actor_id: replacement.actor.id,
      profile_id: replacement.profile.id,
      grant_id: replacementGrant.id,
      authorization_request_id: replacementAuthority.request.id,
      authorization_decision_id: replacementAuthority.decision.id,
      task_id: replacementTask.id,
      execution_context_id: replacementRun.execution.executionContextId,
      terminal_status: replacementRun.readback.terminal_status,
      lease_state: replacementRun.readback.lease_state,
      attempt_count: Number(replacementRun.readback.attempt_count),
      lease_event_count: Number(replacementRun.readback.lease_event_count),
    },
    assertions: {
      distinct_actor_identities: true,
      distinct_profiles: true,
      distinct_grants: true,
      distinct_authorization_requests: true,
      distinct_authorization_decisions: true,
      replacement_executed_successfully: true,
      replacement_authority_independently_validated: true,
      predecessor_identity_historical_only: true,
      continuity_preserved_across_handoff: true,
    },
    provider: { provider: 'ollama_local', model },
    production_change: false,
    live_test_database_write: false,
  };

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '# CP-02 replacement-agent handoff proof',
      '',
      '- Result: PASS',
      `- Continuity digest: ${evidence.continuity.continuity_digest}`,
      `- Predecessor actor/profile: ${evidence.predecessor.actor_id} / ${evidence.predecessor.profile_id}`,
      `- Replacement actor/profile: ${evidence.replacement.actor_id} / ${evidence.replacement.profile_id}`,
      '- Both executions completed in one attempt.',
      '- Replacement used a distinct grant and authorization decision.',
      '- Predecessor authority was not inherited.',
      '- Live Test continuity was read-only; execution occurred only in isolated PostgreSQL.',
      '',
    ].join('\n'), { flag: 'a' });
  }

  console.log(JSON.stringify({
    proof_id: evidence.proof_id,
    result: evidence.result,
    continuity_digest: evidence.continuity.continuity_digest,
    predecessor_execution_context_id: evidence.predecessor.execution_context_id,
    replacement_execution_context_id: evidence.replacement.execution_context_id,
  }));
} finally {
  await pool.end();
}
