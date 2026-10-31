import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const { VeLifecycleCoordinator, VeLifecycleError } = await import('../../dist/ve-lifecycle-coordinator.js');

const TEST_HOST = 'aws-0-us-east-1.pooler.supabase.com';
const TEST_USER = 'postgres.sbgfuanxiqepcoboxzcl';
const TEST_DATABASE = 'postgres';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['activate', 'suspend', 'retire']);

function requiredText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function requiredUuid(value, name) {
  const normalized = requiredText(value, name);
  if (!UUID_RE.test(normalized)) throw new Error(`${name} must be a UUID`);
  return normalized;
}

export function liveTestDatabaseConfig(raw, applicationName = 'comind-ve-lifecycle-test') {
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
    || parsed.hostname !== TEST_HOST
    || parsed.port !== '5432'
    || username !== TEST_USER
    || database !== TEST_DATABASE
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
    application_name: applicationName,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    max: 2,
  };
}

export function createLiveLifecycleHarness({
  connectionString,
  applicationName = 'comind-ve-lifecycle-test',
  artifactPath = 'artifacts/ve-lifecycle-test-evidence.json',
} = {}) {
  const pool = new Pool(liveTestDatabaseConfig(connectionString, applicationName));

  async function query(text, params = []) {
    const result = await pool.query(text, params);
    return { rows: result.rows };
  }

  async function one(text, params = []) {
    const result = await query(text, params);
    assert.equal(result.rows.length, 1, 'Expected exactly one row from governed Test query');
    return result.rows[0];
  }

  async function verifyDatabaseIdentity() {
    const identity = await one(
      `SELECT current_database()::text AS database_name,
              current_user::text AS database_user,
              current_setting('server_version_num')::integer AS server_version_num,
              current_setting('transaction_read_only')::text AS transaction_read_only`
    );
    assert.equal(identity.database_name, TEST_DATABASE);
    assert.equal(identity.database_user, 'postgres');
    assert.ok(identity.server_version_num >= 170000, 'Expected PostgreSQL 17 or newer');
    assert.equal(identity.transaction_read_only, 'off', 'Lifecycle acceptance requires the bounded Test write path');
    return identity;
  }

  async function snapshot(profileId, idempotencyKey = null) {
    requiredUuid(profileId, 'profileId');
    const row = await one(
      `SELECT p.profile_id::text AS profile_id,
              p.actor_id::text AS actor_id,
              p.status,
              p.activated_at,
              p.retired_at,
              (SELECT count(*)::int FROM comind.cm_actor_external_resource r
                 WHERE r.actor_id = p.actor_id) AS external_resources,
              (SELECT count(*)::int FROM comind.cm_audit_log a
                 WHERE a.target_table = 'cm_foundry_agent_profile'
                   AND a.target_id = p.profile_id
                   AND a.action LIKE 've.lifecycle.%') AS lifecycle_audits,
              (SELECT count(*)::int FROM comind.cm_audit_log a
                 WHERE a.target_table = 'cm_foundry_agent_profile'
                   AND a.target_id = p.profile_id
                   AND a.action IN ('ve.lifecycle.completed', 've.lifecycle.partial')
                   AND ($2::text IS NOT NULL AND a.details->>'idempotency_key' = $2::text)) AS matching_terminal_audits
       FROM comind.cm_foundry_agent_profile p
       WHERE p.profile_id = $1::uuid`,
      [profileId, idempotencyKey]
    );
    return {
      ...row,
      external_resources: Number(row.external_resources),
      lifecycle_audits: Number(row.lifecycle_audits),
      matching_terminal_audits: Number(row.matching_terminal_audits),
    };
  }

  async function authorization(decisionId) {
    requiredUuid(decisionId, 'authorizationDecisionId');
    return one(
      `SELECT ad.authorization_decision_id::text,
              ad.authorization_request_id::text,
              ad.decision,
              ad.effective_until,
              ar.requesting_actor_id::text,
              ar.status AS request_status,
              ar.authority_level,
              ar.environment,
              ar.target_kind,
              ar.target_ref,
              ar.expires_at AS request_expires_at,
              c.capability_code
       FROM comind.cm_foundry_authorization_decision ad
       JOIN comind.cm_foundry_authorization_request ar
         ON ar.authorization_request_id = ad.authorization_request_id
       JOIN comind.cm_foundry_capability c ON c.capability_id = ar.capability_id
       WHERE ad.authorization_decision_id = $1::uuid`,
      [decisionId]
    );
  }

  async function terminalAudit(profileId, idempotencyKey) {
    const result = await query(
      `SELECT audit_id::text, actor_id::text, action, target_id::text, details, created_at
       FROM comind.cm_audit_log
       WHERE target_table = 'cm_foundry_agent_profile'
         AND target_id = $1::uuid
         AND action IN ('ve.lifecycle.completed', 've.lifecycle.partial')
         AND details->>'idempotency_key' = $2::text
       ORDER BY created_at, audit_id`,
      [profileId, idempotencyKey]
    );
    return result.rows;
  }

  async function execute({
    action,
    profileId,
    requestedByActorId,
    authorizationDecisionId,
    reason,
    idempotencyKey,
    expectedFromState,
    expectedToState,
    expectedErrorCode = null,
    requireNoExternalResources = true,
  }) {
    if (!ACTIONS.has(action)) throw new Error('action must be activate, suspend, or retire');
    requiredUuid(profileId, 'profileId');
    requiredUuid(requestedByActorId, 'requestedByActorId');
    requiredUuid(authorizationDecisionId, 'authorizationDecisionId');
    requiredText(reason, 'reason');
    requiredText(idempotencyKey, 'idempotencyKey');

    await verifyDatabaseIdentity();
    const before = await snapshot(profileId, idempotencyKey);
    if (expectedFromState) assert.equal(before.status, expectedFromState, 'Unexpected lifecycle starting state');
    if (requireNoExternalResources) {
      assert.equal(before.external_resources, 0, 'Refusing provider reconciliation in the provider-free lifecycle harness');
    }

    const auth = await authorization(authorizationDecisionId);
    assert.equal(auth.requesting_actor_id, requestedByActorId, 'Authorization requester mismatch');
    assert.equal(auth.capability_code, `ve.lifecycle.${action}`, 'Authorization capability mismatch');
    assert.equal(auth.authority_level, 'C2', 'Lifecycle harness requires exact C2 authorization');
    assert.equal(auth.environment, 'isolated', 'Lifecycle harness refuses non-isolated authorization');
    assert.equal(auth.target_kind, 'foundry_agent_profile', 'Authorization target kind mismatch');
    assert.equal(auth.target_ref, profileId, 'Authorization target reference mismatch');

    const coordinator = new VeLifecycleCoordinator(query, {});
    let result = null;
    let error = null;
    try {
      result = await coordinator.transition(action, {
        profileId,
        requestedByActorId,
        authorizationDecisionId,
        reason,
        idempotencyKey,
      });
    } catch (caught) {
      error = caught;
    }

    const after = await snapshot(profileId, idempotencyKey);
    if (expectedErrorCode) {
      assert.ok(error instanceof VeLifecycleError, 'Expected a governed lifecycle error');
      assert.equal(error.code, expectedErrorCode, 'Unexpected lifecycle error code');
      assert.equal(after.status, before.status, 'Rejected lifecycle action mutated profile state');
      assert.equal(after.lifecycle_audits, before.lifecycle_audits, 'Rejected lifecycle action wrote lifecycle audit evidence before authorization');
      return {
        outcome: 'rejected_as_expected',
        expected_error_code: expectedErrorCode,
        actual_error_code: error.code,
        error_message: error.message,
        authorization: auth,
        before,
        after,
      };
    }

    if (error) throw error;
    assert.ok(result, 'Lifecycle coordinator returned no result');
    assert.equal(result.status, 'succeeded', 'Provider-free lifecycle acceptance must complete without partial status');
    if (expectedToState) assert.equal(after.status, expectedToState, 'Unexpected lifecycle ending state');
    assert.equal(after.matching_terminal_audits, 1, 'Expected exactly one terminal audit for lifecycle idempotency key');
    const terminal = await terminalAudit(profileId, idempotencyKey);
    assert.equal(terminal.length, 1, 'Lifecycle terminal audit did not resolve uniquely');
    assert.equal(terminal[0].details?.authorization_decision_id, authorizationDecisionId);

    return {
      outcome: 'succeeded',
      authorization: auth,
      coordinator_result: result,
      terminal_audit: terminal[0],
      before,
      after,
    };
  }

  function writeEvidence(evidence, path = artifactPath) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [
        '# VE lifecycle Test acceptance',
        '',
        `- Outcome: ${evidence.outcome ?? 'composite'}`,
        `- Profile: ${evidence.profile_id ?? evidence.after?.profile_id ?? 'see artifact'}`,
        '- Environment: isolated CoMind Test Supabase',
        '- Provider adapters: none',
        '- Production: not touched',
        '',
      ];
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
    }
  }

  return Object.freeze({
    pool,
    query,
    one,
    verifyDatabaseIdentity,
    snapshot,
    authorization,
    terminalAudit,
    execute,
    writeEvidence,
    close: () => pool.end(),
  });
}
