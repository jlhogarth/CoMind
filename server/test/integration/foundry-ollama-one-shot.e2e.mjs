import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } = await import('../../dist/foundry-runtime.js');
const { createLocalOllamaFoundryAdapter, localOllamaFoundryDefaults } = await import('../../dist/providers/ollama-foundry-adapter.js');

function requireIsolatedDatabaseUrl(raw) {
  if (!raw) throw new Error('DATABASE_URL is required');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname)
    || parsed.pathname !== '/comind_ci') {
    throw new Error('Refusing Ollama handoff outside isolated local comind_ci');
  }
  return raw;
}

const pool = new Pool({ connectionString: requireIsolatedDatabaseUrl(process.env.DATABASE_URL) });
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL ?? localOllamaFoundryDefaults.model;
const workerId = `issue161-${randomUUID()}`;
const targetRef = 'synthetic:foundry-test-handoff';
const suffix = randomUUID().replaceAll('-', '');
const query = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return { rows: result.rows };
};
const one = async (sql, params = []) => {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
};

try {
  const db = await one('SELECT current_database() AS name');
  assert.equal(db.name, 'comind_ci');

  const org = await one(
    `INSERT INTO comind.cm_org (name, slug)
     VALUES ($1::text, $2::text) RETURNING org_id::text AS id`,
    [`Issue 161 Ollama Org ${suffix}`, `issue161-ollama-${suffix}`]
  );
  const approver = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'person', $2::text, 'Issue 161 synthetic approver')
     RETURNING actor_id::text AS id`,
    [org.id, `issue161-approver-${suffix}`]
  );
  const agentActor = await one(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'agent', $2::text, 'PROOF Test Agent 161')
     RETURNING actor_id::text AS id`,
    [org.id, `issue161-proof-${suffix}`]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent (org_id, name, description)
     VALUES ($1::uuid, 'PROOF Test Agent 161', 'Bounded synthetic local-model handoff verification')
     RETURNING agent_id::text AS id`,
    [org.id]
  );
  const project = await one(
    `INSERT INTO comind.cm_project (org_id, title, slug, created_by)
     VALUES ($1::uuid, 'Issue 161 synthetic handoff', $2::text, $3::uuid)
     RETURNING project_id::text AS id`,
    [org.id, `issue161-handoff-${suffix}`, approver.id]
  );
  const task = await one(
    `INSERT INTO comind.cm_task (project_id, title, status)
     VALUES ($1::uuid, 'Verify synthetic ATLAS to PROOF handoff', 'todo')
     RETURNING task_id::text AS id`,
    [project.id]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile (
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       runtime_defaults, competencies, status, activated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, 'proof_test_agent', 'PROOF Test Agent 161',
       'C0', 'C1', 'issue161-v1',
       $4::jsonb, '["evidence_review","handoff_verification"]'::jsonb, 'active', NOW()
     ) RETURNING profile_id::text AS id`,
    [agent.id, agentActor.id, org.id, JSON.stringify({ provider: 'ollama_local', model })]
  );
  const capability = await one(
    `INSERT INTO comind.cm_foundry_capability (
       capability_code, description, action, target_kind, max_authority,
       risk_class, cost_bearing, adapter
     ) VALUES (
       'foundry.test.proof.verify', 'Verify one synthetic handoff',
       'verify_handoff', 'repository', 'C1', 'low', false, 'ollama_local'
     ) RETURNING capability_id::text AS id`
  );
  await query(
    `INSERT INTO comind.cm_foundry_capability_grant (
       profile_id, capability_id, org_id, project_id, environment,
       authority_ceiling, scope, granted_by_actor_id, grant_reason
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'isolated',
       'C1', $5::jsonb, $6::uuid, 'Single synthetic issue 161 verification'
     )`,
    [
      profile.id,
      capability.id,
      org.id,
      project.id,
      JSON.stringify({ target_refs: [targetRef] }),
      approver.id,
    ]
  );
  await query(
    'INSERT INTO comind.cm_foundry_work_lease (task_id, max_attempts) VALUES ($1::uuid, 1)',
    [task.id]
  );
  const authorizationRequest = await one(
    `INSERT INTO comind.cm_foundry_authorization_request (
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, task_id, authority_level, environment,
       target_kind, target_ref, reason
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       'C1', 'isolated', 'repository', $6::text,
       'One synthetic, non-cost-bearing local-model handoff'
     ) RETURNING authorization_request_id::text AS id`,
    [profile.id, agentActor.id, capability.id, project.id, task.id, targetRef]
  );
  const decision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision (
       authorization_request_id, decision, decided_by_actor_id, decision_basis
     ) VALUES ($1::uuid, 'approved', $2::uuid, 'Issue 161 isolated synthetic test fixture')
     RETURNING authorization_decision_id::text AS id`,
    [authorizationRequest.id, approver.id]
  );

  const claim = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work($1::text, 180)`,
    [workerId]
  );
  assert.equal(claim.task_id, task.id);
  assert.equal(Number(claim.fencing_epoch), 1);

  const registry = new FoundryAdapterRegistry();
  registry.register('ollama_local', createLocalOllamaFoundryAdapter({ baseUrl: ollamaBaseUrl, model }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);
  const syntheticPrompt = [
    'You are PROOF, reviewing one synthetic test handoff from the ATLAS role.',
    'Use only the report below. Return a concise verification with two supported facts and one limitation.',
    'Synthetic report: the Test runtime schema and lease kernel have been installed; no worker execution result has yet been recorded.',
    'Do not claim that production is active or that a model call occurred before this request.',
  ].join(' ');

  let execution;
  try {
    execution = await orchestrator.execute({
      profileId: profile.id,
      capabilityCode: 'foundry.test.proof.verify',
      authorizationDecisionId: decision.id,
      authorityLevel: 'C1',
      environment: 'isolated',
      targetKind: 'repository',
      targetRef,
      projectId: project.id,
      taskId: task.id,
      idempotencyKey: `issue161-ollama-${randomUUID()}`,
      input: { prompt: syntheticPrompt, source_role: 'atlas_fixture', recipient_role: 'proof_test_agent' },
    });
  } catch (error) {
    await query(
      `SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, false)`,
      [task.id, workerId, claim.lease_token, claim.fencing_epoch]
    );
    throw error;
  }

  assert.equal(execution.terminalStatus, 'succeeded');
  const finished = await one(
    `SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, true) AS ok`,
    [task.id, workerId, claim.lease_token, claim.fencing_epoch]
  );
  assert.equal(finished.ok, true);

  const readback = await one(
    `SELECT l.state AS lease_state, l.attempt_count, l.max_attempts,
            count(DISTINCT ev.event_id)::int AS lease_event_count,
            eo.terminal_status, aror.result_ref, aror.summary,
            count(DISTINCT ec.execution_context_id)::int AS execution_count
     FROM comind.cm_foundry_work_lease l
     JOIN comind.cm_task t ON t.task_id = l.task_id
     JOIN comind.cm_foundry_execution_context ec ON ec.task_id = t.task_id
     JOIN comind.cm_foundry_execution_outcome eo ON eo.execution_context_id = ec.execution_context_id
     JOIN comind.cm_foundry_adapter_operation_result aror
       ON aror.adapter_operation_result_id = eo.adapter_operation_result_id
     LEFT JOIN comind.cm_foundry_work_lease_event ev ON ev.task_id = t.task_id
     WHERE t.task_id = $1::uuid
     GROUP BY l.state, l.attempt_count, l.max_attempts, eo.terminal_status, aror.result_ref, aror.summary`,
    [task.id]
  );
  assert.equal(readback.lease_state, 'completed');
  assert.equal(Number(readback.attempt_count), 1);
  assert.equal(Number(readback.max_attempts), 1);
  assert.equal(Number(readback.lease_event_count), 2);
  assert.equal(readback.terminal_status, 'succeeded');
  assert.equal(Number(readback.execution_count), 1);
  assert.match(readback.result_ref, /^ollama-local:\/\/qwen3:0\.6b\//);
  assert.ok(readback.summary.length > 0);

  const artifact = {
    evidence_version: 'foundry-test-handoff-001',
    issue: 161,
    environment: 'isolated',
    synthetic: true,
    agent_role: 'proof_test_agent',
    source_role: 'atlas_fixture',
    provider: 'ollama_local',
    model,
    authority: 'C1',
    task_id: task.id,
    execution_context_id: execution.executionContextId,
    execution_outcome_id: execution.executionOutcomeId,
    terminal_status: readback.terminal_status,
    lease_state: readback.lease_state,
    lease_events: Number(readback.lease_event_count),
    attempt_count: Number(readback.attempt_count),
    max_attempts: Number(readback.max_attempts),
    request_fingerprint: execution.requestFingerprint,
    result: readback.summary,
  };
  const artifactPath = process.env.FOUNDRY_HANDOFF_ARTIFACT ?? 'artifacts/foundry-test-handoff-evidence.json';
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '# Foundry Test handoff completed',
        '',
        '- Environment: isolated CI database',
        '- Input: synthetic ATLAS role fixture',
        '- Executing profile: PROOF Test Agent 161',
        `- Provider/model: ollama_local / ${model}`,
        '- Lease: completed after one attempt',
        `- Execution outcome: ${readback.terminal_status}`,
        '',
        '## PROOF response',
        '',
        readback.summary,
        '',
        'This run used local Ollama. It did not access live Supabase or OpenAI.',
        '',
      ].join('\n'),
      { flag: 'a' }
    );
  }
  console.log(JSON.stringify({ ...artifact, result: '[captured in artifact and step summary]' }));
} finally {
  await pool.end();
}
