import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const PROFILE_ID = '16100000-0000-4000-8000-000000000006';
const CAPABILITY_ID = '16100000-0000-4000-8000-000000000007';
const GRANT_ID = '16100000-0000-4000-8000-000000000008';
const TASK_ID = '16100000-0000-4000-8000-000000000009';
const PROJECT_ID = '16100000-0000-4000-8000-000000000003';
const AUTHORIZATION_REQUEST_ID = '16100000-0000-4000-8000-00000000000a';
const AUTHORIZATION_DECISION_ID = '16100000-0000-4000-8000-00000000000b';
const CAPABILITY_CODE = 'foundry.test.proof.verify';
const TARGET_REF = 'jlhogarth/CoMind';
const EXPECTED_MODEL = 'qwen2.5:0.5b';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } =
  await import('../../dist/foundry-runtime.js');
const { createLocalOllamaFoundryAdapter } =
  await import('../../dist/providers/ollama-foundry-adapter.js');

function liveTestDatabaseConfig(raw) {
  if (!raw) throw new Error('SUPABASE_SESSION_DATABASE_URL is required.');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Supabase connection URL is invalid.');
  }

  const username = decodeURIComponent(parsed.username);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || parsed.hostname !== 'aws-0-us-east-1.pooler.supabase.com'
    || parsed.port !== '5432'
    || username !== 'postgres.sbgfuanxiqepcoboxzcl'
    || database !== 'postgres'
    || !parsed.password) {
    throw new Error('Refusing connection outside the exact CoMind Test Supabase pooler target.');
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port),
    user: username,
    password: decodeURIComponent(parsed.password),
    database,
    ssl: { rejectUnauthorized: true },
    application_name: 'comind-foundry-test-issue164',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    max: 2,
  };
}

const pool = new Pool(liveTestDatabaseConfig(process.env.SUPABASE_SESSION_DATABASE_URL));
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL ?? EXPECTED_MODEL;
const workerId = 'issue164-' + randomUUID();

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rows: result.rows };
}

async function one(sql, params = []) {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1, 'Expected one row from guarded live Test query');
  return result.rows[0];
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function writeEvidence(evidence) {
  const artifactPath = process.env.FOUNDRY_HANDOFF_ARTIFACT
    ?? 'artifacts/foundry-test-161-live-evidence.json';
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Foundry Test live one-shot handoff',
      '',
      '- Environment: CoMind Test Supabase, synthetic task only',
      '- Source role: ATLAS fixture, not a separate running Agent',
      '- Recipient: PROOF Test Agent 161',
      '- Provider/model: ollama_local / ' + model,
      '- Authority: C1, non-cost-bearing',
      '- Lease state: ' + evidence.lease_state,
      '- Lease attempts: ' + evidence.attempt_count + ' of ' + evidence.max_attempts,
      '- Execution outcome: ' + evidence.terminal_status,
      '- Lease events: ' + evidence.lease_events,
      '',
      '## PROOF response',
      '',
      evidence.result ?? 'No adapter output was returned.',
      '',
      'This is one live Test execution using synthetic input. It does not prove separate ChatGPT GPT sessions communicated and does not touch production or OpenAI.',
      '',
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
  }
}

async function finishLease(claim, completed) {
  const result = await one(
    'SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, $5::boolean) AS ok',
    [TASK_ID, workerId, claim.lease_token, claim.fencing_epoch, completed]
  );
  assert.equal(result.ok, true, 'Lease owner could not finish the exact claimed task');
}

async function readExecution(execution = null) {
  const readbackSql = [
    'SELECT l.state AS lease_state, l.attempt_count, l.max_attempts,',
    '       count(DISTINCT ev.event_id)::int AS lease_event_count,',
    '       count(DISTINCT ec.execution_context_id)::int AS execution_count,',
    '       count(DISTINCT eo.execution_outcome_id)::int AS outcome_count,',
    '       min(eo.terminal_status) AS terminal_status,',
    '       min(aror.result_ref) AS result_ref, min(aror.summary) AS summary,',
    '       min(ec.execution_context_id::text) AS execution_context_id,',
    '       min(eo.execution_outcome_id::text) AS execution_outcome_id',
    'FROM comind.cm_foundry_work_lease l',
    'JOIN comind.cm_task t ON t.task_id = l.task_id',
    'LEFT JOIN comind.cm_foundry_execution_context ec ON ec.task_id = t.task_id',
    'LEFT JOIN comind.cm_foundry_execution_outcome eo ON eo.execution_context_id = ec.execution_context_id',
    'LEFT JOIN comind.cm_foundry_adapter_operation_result aror',
    '  ON aror.adapter_operation_result_id = eo.adapter_operation_result_id',
    'LEFT JOIN comind.cm_foundry_work_lease_event ev ON ev.task_id = t.task_id',
    'WHERE t.task_id = $1::uuid',
    'GROUP BY l.state, l.attempt_count, l.max_attempts',
  ].join('\n');
  const row = await one(readbackSql, [TASK_ID]);

  const evidence = {
    evidence_version: 'foundry-test-161-live-001',
    issue: 161,
    follow_up_issue: 164,
    environment: 'test',
    synthetic: true,
    profile_id: PROFILE_ID,
    agent_role: 'proof_test_agent',
    source_role: 'atlas_fixture',
    provider: 'ollama_local',
    model,
    authority: 'C1',
    project_id: PROJECT_ID,
    task_id: TASK_ID,
    execution_context_id: row.execution_context_id,
    execution_outcome_id: row.execution_outcome_id,
    execution_count: Number(row.execution_count),
    outcome_count: Number(row.outcome_count),
    terminal_status: row.terminal_status ?? 'not_recorded',
    lease_state: row.lease_state,
    lease_events: Number(row.lease_event_count),
    attempt_count: Number(row.attempt_count),
    max_attempts: Number(row.max_attempts),
    result_ref: row.result_ref,
    request_fingerprint: execution?.requestFingerprint ?? null,
    result: row.summary,
  };
  writeEvidence(evidence);
  return evidence;
}

try {
  requireCondition(model === EXPECTED_MODEL, 'Refusing an unapproved live Test model.');
  const identity = await one(
    'SELECT current_database() AS database_name, current_user AS database_user, '
      + 'current_setting(\'server_version_num\')::integer AS server_version_num, '
      + 'current_setting(\'transaction_read_only\') AS transaction_read_only'
  );
  assert.equal(identity.database_name, 'postgres');
  assert.equal(identity.database_user, 'postgres');
  assert.ok(identity.server_version_num >= 170000, 'Expected PostgreSQL 17 or newer');
  assert.equal(identity.transaction_read_only, 'off', 'Refusing a read-only connection before claim');

  const fixtureSql = [
    'SELECT p.profile_id::text AS profile_id, p.role_code, p.status AS profile_status,',
    '       p.authority_floor, p.authority_ceiling, p.runtime_defaults,',
    '       c.capability_id::text AS capability_id, c.capability_code, c.adapter, c.cost_bearing,',
    '       g.grant_id::text AS grant_id, g.environment AS grant_environment,',
    '       g.authority_ceiling AS grant_authority_ceiling, g.scope AS grant_scope,',
    '       g.revoked_at, g.expires_at AS grant_expires_at,',
    '       t.task_id::text AS task_id, t.project_id::text AS project_id,',
    '       t.title AS task_title, t.status AS task_status,',
    '       l.state AS lease_state, l.attempt_count, l.max_attempts, l.fencing_epoch,',
    '       ar.authorization_request_id::text AS authorization_request_id,',
    '       ar.status AS authorization_status, ar.authority_level AS requested_authority,',
    '       ar.environment AS requested_environment, ar.target_kind, ar.target_ref,',
    '       ar.expires_at AS authorization_expires_at,',
    '       ad.authorization_decision_id::text AS authorization_decision_id,',
    '       ad.decision, ad.effective_until AS decision_expires_at,',
    '       (SELECT count(*) FROM comind.cm_foundry_execution_context ec',
    '        WHERE ec.task_id=t.task_id)::int AS execution_contexts,',
    '       (SELECT count(*) FROM comind.cm_foundry_work_lease_event ev',
    '        WHERE ev.task_id=t.task_id)::int AS lease_events',
    'FROM comind.cm_foundry_agent_profile p',
    'JOIN comind.cm_foundry_capability c ON c.capability_id=$2::uuid',
    'JOIN comind.cm_foundry_capability_grant g',
    '  ON g.profile_id=p.profile_id AND g.capability_id=c.capability_id',
    'JOIN comind.cm_foundry_authorization_request ar',
    '  ON ar.requesting_profile_id=p.profile_id AND ar.capability_id=c.capability_id',
    'JOIN comind.cm_foundry_authorization_decision ad',
    '  ON ad.authorization_request_id=ar.authorization_request_id',
    'JOIN comind.cm_task t ON t.task_id=ar.task_id',
    'JOIN comind.cm_foundry_work_lease l ON l.task_id=t.task_id',
    'WHERE p.profile_id=$1::uuid AND g.grant_id=$3::uuid',
    '  AND t.task_id=$4::uuid AND t.project_id=$5::uuid',
    '  AND ar.authorization_request_id=$6::uuid',
    '  AND ad.authorization_decision_id=$7::uuid',
  ].join('\n');
  const fixture = await one(fixtureSql, [
    PROFILE_ID, CAPABILITY_ID, GRANT_ID, TASK_ID, PROJECT_ID,
    AUTHORIZATION_REQUEST_ID, AUTHORIZATION_DECISION_ID,
  ]);

  assert.equal(fixture.profile_id, PROFILE_ID);
  assert.equal(fixture.role_code, 'proof_test_agent');
  assert.equal(fixture.profile_status, 'active');
  assert.equal(fixture.authority_floor, 'C0');
  assert.equal(fixture.authority_ceiling, 'C1');
  assert.equal(fixture.runtime_defaults?.provider, 'ollama');
  assert.equal(fixture.runtime_defaults?.model, EXPECTED_MODEL);
  assert.equal(fixture.capability_code, CAPABILITY_CODE);
  assert.equal(fixture.adapter, 'ollama_local');
  assert.equal(fixture.cost_bearing, false);
  assert.equal(fixture.grant_environment, 'isolated');
  assert.equal(fixture.grant_authority_ceiling, 'C1');
  assert.equal(fixture.grant_id, GRANT_ID);
  assert.equal(fixture.revoked_at, null);
  assert.ok(!fixture.grant_expires_at || new Date(fixture.grant_expires_at) > new Date());
  assert.equal(fixture.grant_scope?.max_tasks, 1);
  assert.equal(fixture.grant_scope?.synthetic_only, true);
  assert.ok(Array.isArray(fixture.grant_scope?.target_refs));
  assert.ok(fixture.grant_scope.target_refs.includes(TARGET_REF));
  assert.equal(fixture.task_id, TASK_ID);
  assert.equal(fixture.project_id, PROJECT_ID);
  assert.equal(fixture.task_title, 'Verify synthetic ATLAS to PROOF handoff');
  assert.equal(fixture.task_status, 'in_progress');
  assert.equal(fixture.lease_state, 'ready');
  assert.equal(Number(fixture.attempt_count), 0);
  assert.equal(Number(fixture.max_attempts), 1);
  assert.equal(Number(fixture.fencing_epoch), 0);
  assert.equal(fixture.authorization_request_id, AUTHORIZATION_REQUEST_ID);
  assert.equal(fixture.authorization_status, 'approved');
  assert.equal(fixture.requested_authority, 'C1');
  assert.equal(fixture.requested_environment, 'isolated');
  assert.equal(fixture.target_kind, 'repository');
  assert.equal(fixture.target_ref, TARGET_REF);
  assert.equal(fixture.authorization_decision_id, AUTHORIZATION_DECISION_ID);
  assert.equal(fixture.decision, 'approved');
  assert.ok(!fixture.authorization_expires_at || new Date(fixture.authorization_expires_at) > new Date());
  assert.ok(!fixture.decision_expires_at || new Date(fixture.decision_expires_at) > new Date());
  assert.equal(Number(fixture.execution_contexts), 0);
  assert.equal(Number(fixture.lease_events), 0);

  const eligibleSql = [
    'SELECT l.task_id::text AS task_id',
    'FROM comind.cm_foundry_work_lease l',
    'JOIN comind.cm_task t ON t.task_id=l.task_id',
    'WHERE (l.state=\'ready\' OR (l.state=\'leased\' AND l.lease_expires_at <= clock_timestamp()))',
    '  AND l.not_before <= clock_timestamp()',
    '  AND l.attempt_count < l.max_attempts',
    '  AND t.status NOT IN (\'blocked\',\'done\')',
  ].join('\n');
  const eligible = await query(eligibleSql);
  assert.equal(eligible.rows.length, 1, 'Refusing to claim while any other eligible lease exists');
  assert.equal(eligible.rows[0].task_id, TASK_ID);

  const claim = await one(
    'SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch '
      + 'FROM comind.cm_foundry_claim_work($1::text, 240)',
    [workerId]
  );
  assert.equal(claim.task_id, TASK_ID);
  assert.equal(Number(claim.fencing_epoch), 1);

  const registry = new FoundryAdapterRegistry();
  registry.register('ollama_local', createLocalOllamaFoundryAdapter({
    baseUrl: ollamaBaseUrl,
    model,
    timeoutMs: 120_000,
    maxOutputTokens: 128,
  }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);
  const syntheticPrompt = [
    'You are PROOF receiving one synthetic handoff from the ATLAS role.',
    'Confirm receipt in one or two concise sentences. State that this is a live CoMind Test Supabase execution using the local ollama_local adapter at C1 authority.',
    'ATLAS fixture report: the task is Verify synthetic ATLAS to PROOF handoff. Its grant is synthetic-only, scoped to jlhogarth/CoMind, non-cost-bearing, and limited to one task. The task is being executed once with qwen2.5:0.5b.',
    'No user data, production resource, OpenAI API, or separate ChatGPT GPT session is involved.',
    'State one limitation: this proves one live Test database execution, but not communication between separate ChatGPT GPT sessions or production readiness. Do not say the task is unexecuted or incomplete.',
  ].join(' ');

  let execution;
  try {
    execution = await orchestrator.execute({
      profileId: PROFILE_ID,
      capabilityCode: CAPABILITY_CODE,
      authorizationDecisionId: AUTHORIZATION_DECISION_ID,
      authorityLevel: 'C1',
      environment: 'isolated',
      targetKind: 'repository',
      targetRef: TARGET_REF,
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      idempotencyKey: 'issue164-live-' + randomUUID(),
      input: {
        prompt: syntheticPrompt,
        source_role: 'atlas_fixture',
        recipient_role: 'proof_test_agent',
        source_ref: 'github:issue-164-live-test-fixture',
      },
    });
  } catch (error) {
    await finishLease(claim, false);
    await readExecution();
    throw error;
  }

  const finished = await one(
    'SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, true) AS ok',
    [TASK_ID, workerId, claim.lease_token, claim.fencing_epoch]
  );
  assert.equal(finished.ok, true);
  assert.equal(execution.terminalStatus, 'succeeded');

  const evidence = await readExecution(execution);
  assert.equal(evidence.terminal_status, 'succeeded');
  assert.equal(evidence.lease_state, 'completed');
  assert.equal(evidence.attempt_count, 1);
  assert.equal(evidence.max_attempts, 1);
  assert.equal(evidence.lease_events, 2);
  assert.equal(evidence.execution_count, 1);
  assert.equal(evidence.outcome_count, 1);
  assert.ok(evidence.execution_context_id);
  assert.ok(evidence.execution_outcome_id);
  assert.match(evidence.result_ref, /^ollama-local:\/\/qwen2\.5:0\.5b\/[a-f0-9]{64}$/);
  assert.ok(typeof evidence.result === 'string' && evidence.result.length > 0);

  console.log(JSON.stringify({
    issue: 161,
    follow_up_issue: 164,
    environment: 'test',
    task_id: TASK_ID,
    terminal_status: evidence.terminal_status,
    lease_state: evidence.lease_state,
    attempt_count: evidence.attempt_count,
    lease_events: evidence.lease_events,
    execution_context_id: evidence.execution_context_id,
    execution_outcome_id: evidence.execution_outcome_id,
    request_fingerprint: evidence.request_fingerprint,
    result: '[stored in evidence artifact and GitHub step summary]',
  }));
} finally {
  await pool.end();
}
