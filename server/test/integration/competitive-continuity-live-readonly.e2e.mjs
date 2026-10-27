import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const TRACKING_KEY = 'CINT-CP03-001';

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
    application_name: 'comind-competitive-continuity-readonly-proof',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    max: 1,
  };
}

const rawDatabaseUrl = process.env.SUPABASE_SESSION_DATABASE_URL;
process.env.DATABASE_URL = rawDatabaseUrl;
process.env.ASSISTANT_PROVIDER = 'disabled';

const {
  ContinuityHandoffError,
  resolveContinuityHandoff,
} = await import('../../dist/continuity/handoff.js');
const { closePool } = await import('../../dist/db.js');

const pool = new Pool(testDatabaseConfig(rawDatabaseUrl));
const client = await pool.connect();
let transactionOpen = false;

function writeEvidence(evidence) {
  const artifactPath = process.env.COMPETITIVE_CONTINUITY_ARTIFACT
    ?? 'artifacts/competitive-continuity-live-readonly-evidence.json';
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Competitive continuity read-only proof',
      '',
      `- Canonical proof: ${TRACKING_KEY}`,
      `- CP-03: ${evidence.cp03.result}`,
      `- CP-01 continuity invariance: ${evidence.cp01.result}`,
      `- CP-02 actor handoff invariance: ${evidence.cp02.result}`,
      `- Current checkpoint: ${evidence.current_checkpoint_id}`,
      `- Predecessor checkpoint: ${evidence.predecessor_checkpoint_id}`,
      `- Read-only transaction: ${evidence.transaction_read_only}`,
      '',
      'No provider call, task execution, schema mutation, or database write occurred.',
      '',
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
  }
}

try {
  await client.query('BEGIN READ ONLY');
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='5s'");

  const query = async (sql, params = []) => ({ rows: (await client.query(sql, params)).rows });
  const readOnly = await query("SELECT current_setting('transaction_read_only') AS value");
  assert.equal(readOnly.rows[0]?.value, 'on', 'Competitive proof must execute inside a read-only transaction');

  const proofResult = await query(
    `SELECT status, canonical_payload
       FROM comind_development.entity
      WHERE tracking_key=$1`,
    [TRACKING_KEY]
  );
  assert.equal(proofResult.rows.length, 1, 'Canonical CP-03 proof record must exist');
  const proof = proofResult.rows[0];
  assert.ok(['partial_pass', 'pass', 'verified'].includes(proof.status), 'CP-03 proof state is not eligible for read-only closure');

  const payload = proof.canonical_payload;
  const checkpointA = payload.initial_checkpoint_id;
  const checkpointB = payload.successor_checkpoint_id;
  const scopeId = payload.scope_id;
  assert.match(checkpointA, /^[0-9a-f-]{36}$/i);
  assert.match(checkpointB, /^[0-9a-f-]{36}$/i);
  assert.match(scopeId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(checkpointA, checkpointB);

  const scopeResult = await query(
    `SELECT semantic_key
       FROM comind.cm_threadkeeper_scope
      WHERE scope_id=$1::uuid`,
    [scopeId]
  );
  assert.equal(scopeResult.rows.length, 1, 'CP-03 ThreadKeeper scope must exist');
  const scopeSemanticKey = scopeResult.rows[0].semantic_key;

  // CP-03: actual canonical A -> B proof lineage resolves B and refuses stale A.
  const current = await resolveContinuityHandoff(query, {
    scopeSemanticKey,
    expectedCheckpointId: checkpointB,
    consumerRef: 'consumer:competitive-proof:live-cp03',
    providerRef: 'provider:read-only-control',
    actorRef: 'agent:read-only-control',
    resolvedAt: new Date().toISOString(),
  });
  assert.equal(current.currentCheckpoint.checkpointId, checkpointB);
  assert.equal(current.currentCheckpoint.parentCheckpointId, checkpointA);
  assert.equal(current.lineage.checkpointIds.at(-1), checkpointB);
  assert.ok(current.lineage.checkpointIds.includes(checkpointA));

  let staleRejected = false;
  try {
    await resolveContinuityHandoff(query, {
      scopeSemanticKey,
      expectedCheckpointId: checkpointA,
      consumerRef: 'consumer:competitive-proof:live-cp03-stale',
      providerRef: 'provider:read-only-control',
      actorRef: 'agent:read-only-control',
      resolvedAt: new Date().toISOString(),
    });
  } catch (error) {
    staleRejected = error instanceof ContinuityHandoffError && error.code === 'stale_checkpoint';
  }
  assert.equal(staleRejected, true, 'Stale checkpoint A must be rejected after B is accepted');

  // CP-01: switch provider identity while retaining identical governed continuity.
  const providerA = await resolveContinuityHandoff(query, {
    scopeSemanticKey,
    expectedCheckpointId: checkpointB,
    consumerRef: 'consumer:competitive-proof:live-cp01',
    providerRef: 'provider:alpha',
    actorRef: 'agent:stable-worker',
    resolvedAt: new Date().toISOString(),
  });
  const providerB = await resolveContinuityHandoff(query, {
    scopeSemanticKey,
    expectedCheckpointId: checkpointB,
    consumerRef: 'consumer:competitive-proof:live-cp01',
    providerRef: 'provider:beta',
    actorRef: 'agent:stable-worker',
    resolvedAt: new Date().toISOString(),
  });
  assert.notEqual(providerA.consumer.providerRef, providerB.consumer.providerRef);
  assert.equal(providerA.continuityDigest, providerB.continuityDigest);
  assert.deepEqual(providerA.lineage, providerB.lineage);
  assert.deepEqual(providerA.currentCheckpoint, providerB.currentCheckpoint);

  // CP-02: replace actor identity without transferring predecessor identity or authority.
  const predecessor = await resolveContinuityHandoff(query, {
    scopeSemanticKey,
    expectedCheckpointId: checkpointB,
    consumerRef: 'consumer:competitive-proof:live-cp02',
    providerRef: 'provider:beta',
    actorRef: 'agent:predecessor',
    resolvedAt: new Date().toISOString(),
  });
  const replacement = await resolveContinuityHandoff(query, {
    scopeSemanticKey,
    expectedCheckpointId: checkpointB,
    consumerRef: 'consumer:competitive-proof:live-cp02',
    providerRef: 'provider:beta',
    actorRef: 'agent:replacement',
    resolvedAt: new Date().toISOString(),
  });
  assert.notEqual(predecessor.consumer.actorRef, replacement.consumer.actorRef);
  assert.equal(predecessor.continuityDigest, replacement.continuityDigest);
  assert.equal(replacement.consumer.authorityMode, 'requires_independent_validation');
  assert.notEqual(replacement.currentCheckpoint.acceptedByRef, replacement.consumer.actorRef);

  const governedPayload = JSON.stringify({
    currentCheckpoint: replacement.currentCheckpoint,
    lineage: replacement.lineage,
    unresolvedCases: replacement.unresolvedCases,
    continuityDigest: replacement.continuityDigest,
  });
  assert.equal(governedPayload.includes('agent:predecessor'), false);
  assert.equal(governedPayload.includes('agent:replacement'), false);

  const evidence = {
    proof_version: 'competitive-continuity-live-readonly-v1',
    environment: 'CoMind Test Supabase',
    canonical_tracking_key: TRACKING_KEY,
    transaction_read_only: true,
    scope_id: scopeId,
    scope_semantic_key: scopeSemanticKey,
    predecessor_checkpoint_id: checkpointA,
    current_checkpoint_id: checkpointB,
    continuity_digest: current.continuityDigest,
    lineage_checkpoint_ids: current.lineage.checkpointIds,
    unresolved_case_count: current.unresolvedCases.length,
    cp03: {
      result: 'PASS',
      stale_predecessor_rejected: staleRejected,
      resolved_current_checkpoint_id: current.currentCheckpoint.checkpointId,
    },
    cp01: {
      result: 'SUPPORT_PASS',
      provider_a: providerA.consumer.providerRef,
      provider_b: providerB.consumer.providerRef,
      continuity_digest_equal: providerA.continuityDigest === providerB.continuityDigest,
      note: 'Proves provider-neutral continuity handoff state; does not yet prove live inference equivalence across two model providers.',
    },
    cp02: {
      result: 'SUPPORT_PASS',
      predecessor_actor: predecessor.consumer.actorRef,
      replacement_actor: replacement.consumer.actorRef,
      continuity_digest_equal: predecessor.continuityDigest === replacement.continuityDigest,
      authority_mode: replacement.consumer.authorityMode,
      note: 'Proves actor-neutral continuity handoff and non-inheritance of authority; does not yet prove a full replacement agent execution.',
    },
    production_change: false,
    database_write: false,
    provider_execution: false,
  };

  writeEvidence(evidence);
  await client.query('COMMIT');
  transactionOpen = false;
} finally {
  if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
  client.release();
  await pool.end();
  await closePool();
}
