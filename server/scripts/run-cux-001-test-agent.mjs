import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const TARGET_REF = 'apps/operator-console';
const CAPABILITY_CODE = 'console.usability.browser_test';
const ROLE_CODE = 'console_usability_auditor';
const PROJECT_CODE = 'COMIND';
const AUTHORITY = 'C1';
const ENVIRONMENT = 'isolated';
const BROWSERS = ['chromium'];

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } =
  await import('../dist/foundry-runtime.js');
const { createConsoleUsabilityFoundryAdapter } =
  await import('../dist/providers/console-usability-foundry-adapter.js');

function testDatabaseConfig(raw) {
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
    application_name: 'comind-cux-001-test-agent',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 35_000,
    max: 2,
  };
}

const pool = new Pool(testDatabaseConfig(process.env.SUPABASE_SESSION_DATABASE_URL));

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rows: result.rows };
}

async function one(sql, params = []) {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1, 'Expected exactly one guarded CUX Test row');
  return result.rows[0];
}

function writeEvidence(evidence) {
  const artifactPath = process.env.CUX_AGENT_EVIDENCE
    ?? 'artifacts/cux-001-test-agent-evidence.json';
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# CUX-001 Console Usability Auditor',
      '',
      '- Environment: CoMind Test / isolated',
      `- Profile: ${evidence.profile_id}`,
      `- Capability: ${CAPABILITY_CODE}`,
      `- Authority: ${AUTHORITY}`,
      `- Browser: ${BROWSERS.join(', ')}`,
      `- Terminal status: ${evidence.terminal_status}`,
      `- Findings summary: ${evidence.summary ?? 'not recorded'}`,
      `- Result reference: ${evidence.result_ref ?? 'not recorded'}`,
      '',
      'This is a governed Test-only Foundry execution. It does not authorize Production mutation or paid-provider use.',
      '',
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
  }
}

try {
  const identity = await one(
    `SELECT current_database() AS database_name,
            current_user AS database_user,
            current_setting('server_version_num')::integer AS server_version_num,
            current_setting('transaction_read_only') AS transaction_read_only`
  );
  assert.equal(identity.database_name, 'postgres');
  assert.equal(identity.database_user, 'postgres');
  assert.ok(identity.server_version_num >= 170000, 'Expected PostgreSQL 17 or newer');
  assert.equal(identity.transaction_read_only, 'off');

  const fixture = await one(
    `SELECT
       p.profile_id::text,
       p.actor_id::text AS agent_actor_id,
       p.status AS profile_status,
       p.authority_floor,
       p.authority_ceiling,
       p.runtime_defaults,
       c.capability_id::text,
       c.cost_bearing,
       c.adapter,
       c.max_authority,
       g.grant_id::text,
       g.environment AS grant_environment,
       g.authority_ceiling AS grant_authority_ceiling,
       g.scope AS grant_scope,
       g.revoked_at,
       g.expires_at,
       pr.project_id::text,
       founder.actor_id::text AS founder_actor_id
     FROM comind.cm_foundry_agent_profile p
     JOIN comind.cm_foundry_capability c
       ON c.capability_code = $1::text
     JOIN comind.cm_foundry_capability_grant g
       ON g.profile_id = p.profile_id
      AND g.capability_id = c.capability_id
      AND g.revoked_at IS NULL
     JOIN comind.cm_project pr
       ON pr.project_id = g.project_id
      AND pr.project_code::text = $2::text
      AND pr.status = 'active'
     JOIN comind.cm_actor founder
       ON founder.org_id = p.org_id
      AND founder.handle::text = 'joseph.hogarth'
      AND founder.kind = 'person'
     WHERE p.role_code = $3::text
       AND g.environment = $4::text`,
    [CAPABILITY_CODE, PROJECT_CODE, ROLE_CODE, ENVIRONMENT]
  );

  assert.equal(fixture.profile_status, 'active');
  assert.equal(fixture.authority_floor, 'C0');
  assert.equal(fixture.authority_ceiling, AUTHORITY);
  assert.equal(fixture.max_authority, AUTHORITY);
  assert.equal(fixture.cost_bearing, false);
  assert.equal(fixture.adapter, 'console_usability');
  assert.equal(fixture.grant_environment, ENVIRONMENT);
  assert.equal(fixture.grant_authority_ceiling, AUTHORITY);
  assert.equal(fixture.revoked_at, null);
  assert.ok(!fixture.expires_at || new Date(fixture.expires_at) > new Date());
  assert.deepEqual(fixture.grant_scope, { target_refs: [TARGET_REF] });
  assert.equal(fixture.runtime_defaults?.production_target_allowed, false);
  assert.equal(fixture.runtime_defaults?.paid_provider_allowed, false);

  const authorizationRequest = await one(
    `INSERT INTO comind.cm_foundry_authorization_request (
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, authority_level, environment, target_kind, target_ref,
       reason, evidence_refs, status, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::uuid, $5::text, $6::text, 'operator_console', $7::text,
       $8::text, $9::jsonb, 'approved', clock_timestamp() + interval '20 minutes'
     )
     RETURNING authorization_request_id::text`,
    [
      fixture.profile_id,
      fixture.agent_actor_id,
      fixture.capability_id,
      fixture.project_id,
      AUTHORITY,
      ENVIRONMENT,
      TARGET_REF,
      'CUX-001 governed one-shot Test usability review authorized by the founder request in Issue #322.',
      JSON.stringify(['github:issue-322', 'github:pr-323']),
    ]
  );

  const authorizationDecision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision (
       authorization_request_id, decision, decided_by_actor_id,
       decision_basis, policy_refs, effective_until
     ) VALUES (
       $1::uuid, 'approved', $2::uuid,
       $3::text, $4::jsonb, clock_timestamp() + interval '20 minutes'
     )
     RETURNING authorization_decision_id::text`,
    [
      authorizationRequest.authorization_request_id,
      fixture.founder_actor_id,
      'Founder-authorized CUX-001 Test-only usability execution. Fixed Console target, C1 ceiling, non-cost-bearing, no Production mutation.',
      JSON.stringify(['CUX-001', 'Issue #322', 'PR #323']),
    ]
  );

  const registry = new FoundryAdapterRegistry();
  registry.register('console_usability', createConsoleUsabilityFoundryAdapter({
    browsers: BROWSERS,
    timeoutMs: 300_000,
  }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);
  const execution = await orchestrator.execute({
    profileId: fixture.profile_id,
    capabilityCode: CAPABILITY_CODE,
    authorizationDecisionId: authorizationDecision.authorization_decision_id,
    authorityLevel: AUTHORITY,
    environment: ENVIRONMENT,
    targetKind: 'operator_console',
    targetRef: TARGET_REF,
    projectId: fixture.project_id,
    idempotencyKey: `cux-001-test-${randomUUID()}`,
    input: {},
  });

  const readback = await one(
    `SELECT
       ec.execution_context_id::text,
       eo.execution_outcome_id::text,
       eo.terminal_status,
       aror.result_ref,
       aror.summary,
       aror.error_code,
       ao.adapter,
       ao.operation_name,
       ao.target_ref
     FROM comind.cm_foundry_execution_context ec
     JOIN comind.cm_foundry_execution_outcome eo
       ON eo.execution_context_id = ec.execution_context_id
     LEFT JOIN comind.cm_foundry_adapter_operation_result aror
       ON aror.adapter_operation_result_id = eo.adapter_operation_result_id
     JOIN comind.cm_foundry_adapter_operation ao
       ON ao.execution_context_id = ec.execution_context_id
     WHERE ec.execution_context_id = $1::uuid`,
    [execution.executionContextId]
  );

  assert.equal(readback.adapter, 'console_usability');
  assert.equal(readback.operation_name, 'browser_test');
  assert.equal(readback.target_ref, TARGET_REF);
  assert.equal(readback.terminal_status, execution.terminalStatus);
  assert.ok(readback.result_ref);
  assert.ok(readback.summary);

  const evidence = {
    evidence_version: 'cux-001-test-agent-001',
    issue: 322,
    pull_request: 323,
    environment: 'test',
    authority: AUTHORITY,
    profile_id: fixture.profile_id,
    capability_code: CAPABILITY_CODE,
    authorization_request_id: authorizationRequest.authorization_request_id,
    authorization_decision_id: authorizationDecision.authorization_decision_id,
    execution_context_id: execution.executionContextId,
    execution_outcome_id: execution.executionOutcomeId,
    adapter_operation_id: execution.adapterOperationId,
    adapter_operation_result_id: execution.adapterOperationResultId,
    request_fingerprint: execution.requestFingerprint,
    terminal_status: execution.terminalStatus,
    result_ref: readback.result_ref,
    error_code: readback.error_code,
    summary: readback.summary,
    target_ref: TARGET_REF,
    browsers: BROWSERS,
    production_authorized: false,
    paid_provider_authorized: false,
  };
  writeEvidence(evidence);

  if (execution.terminalStatus !== 'succeeded') {
    throw new Error(`CUX-001 governed Test execution ended ${execution.terminalStatus}: ${readback.summary}`);
  }

  console.log(JSON.stringify({
    issue: 322,
    environment: 'test',
    profile_id: fixture.profile_id,
    execution_context_id: execution.executionContextId,
    terminal_status: execution.terminalStatus,
    result_ref: readback.result_ref,
    summary: readback.summary,
  }));
} finally {
  await pool.end();
}
