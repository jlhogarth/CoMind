import assert from 'node:assert/strict';
import pg from 'pg';

export const COMPETITIVE_CP03_TRACKING_KEY = 'CINT-CP03-001';

export function coMindTestDatabaseConfig(raw) {
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
    application_name: 'comind-competitive-execution-proof-readonly',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    max: 1,
  };
}

export async function loadCanonicalCompetitiveContinuity({
  rawDatabaseUrl,
  consumerRef,
  providerRef,
  actorRef,
}) {
  const { resolveContinuityHandoff } = await import('../../dist/continuity/handoff.js');
  const pool = new pg.Pool(coMindTestDatabaseConfig(rawDatabaseUrl));
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    const query = async (sql, params = []) => ({ rows: (await client.query(sql, params)).rows });

    const readOnly = await query("SELECT current_setting('transaction_read_only') AS value");
    assert.equal(readOnly.rows[0]?.value, 'on');

    const proofResult = await query(
      `SELECT status, canonical_payload
         FROM comind_development.entity
        WHERE tracking_key=$1`,
      [COMPETITIVE_CP03_TRACKING_KEY]
    );
    assert.equal(proofResult.rows.length, 1, 'Canonical CP-03 proof record must exist');
    assert.equal(proofResult.rows[0].status, 'pass', 'CP-03 must be fully accepted before execution proofs');

    const payload = proofResult.rows[0].canonical_payload;
    const predecessorCheckpointId = payload.initial_checkpoint_id;
    const currentCheckpointId = payload.successor_checkpoint_id;
    const scopeId = payload.scope_id;
    assert.match(predecessorCheckpointId, /^[0-9a-f-]{36}$/i);
    assert.match(currentCheckpointId, /^[0-9a-f-]{36}$/i);
    assert.match(scopeId, /^[0-9a-f-]{36}$/i);
    assert.notEqual(predecessorCheckpointId, currentCheckpointId);

    const scopeResult = await query(
      `SELECT semantic_key
         FROM comind.cm_threadkeeper_scope
        WHERE scope_id=$1::uuid`,
      [scopeId]
    );
    assert.equal(scopeResult.rows.length, 1, 'CP-03 ThreadKeeper scope must exist');
    const scopeSemanticKey = scopeResult.rows[0].semantic_key;

    const handoff = await resolveContinuityHandoff(query, {
      scopeSemanticKey,
      expectedCheckpointId: currentCheckpointId,
      consumerRef,
      providerRef,
      actorRef,
      resolvedAt: new Date().toISOString(),
    });
    assert.equal(handoff.currentCheckpoint.checkpointId, currentCheckpointId);
    assert.equal(handoff.currentCheckpoint.parentCheckpointId, predecessorCheckpointId);
    assert.equal(handoff.lineage.checkpointIds.at(-1), currentCheckpointId);

    await client.query('COMMIT');
    transactionOpen = false;
    return {
      trackingKey: COMPETITIVE_CP03_TRACKING_KEY,
      scopeId,
      scopeSemanticKey,
      predecessorCheckpointId,
      currentCheckpointId,
      handoff,
      transactionReadOnly: true,
    };
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

export function continuitySemanticPrompt(continuity) {
  return [
    'This is a bounded continuity verification. Do not infer a different current state.',
    `The accepted current checkpoint is ${continuity.currentCheckpointId}.`,
    `Its historical predecessor is ${continuity.predecessorCheckpointId}.`,
    'The predecessor remains evidence and lineage but is not current.',
    'Receiving this context does not transfer execution authority.',
    'Return these four lines with no changed values:',
    `CURRENT_CHECKPOINT_ID=${continuity.currentCheckpointId}`,
    `PREDECESSOR_CHECKPOINT_ID=${continuity.predecessorCheckpointId}`,
    'PREDECESSOR_IS_CURRENT=false',
    'AUTHORITY_INHERITED=false',
  ].join('\n');
}

export function evaluateContinuitySemanticResponse(text, continuity) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Provider returned an empty continuity response.');
  }

  const currentMatches = [...text.matchAll(/CURRENT_CHECKPOINT_ID=([0-9a-f-]{36})/gi)];
  const predecessorMatches = [...text.matchAll(/PREDECESSOR_CHECKPOINT_ID=([0-9a-f-]{36})/gi)];
  const predecessorFalse = [...text.matchAll(/PREDECESSOR_IS_CURRENT=false/gi)];
  const authorityFalse = [...text.matchAll(/AUTHORITY_INHERITED=false/gi)];

  assert.equal(currentMatches.length, 1, 'Provider must emit exactly one current checkpoint marker');
  assert.equal(predecessorMatches.length, 1, 'Provider must emit exactly one predecessor marker');
  assert.equal(predecessorFalse.length, 1, 'Provider must explicitly state predecessor_is_current=false');
  assert.equal(authorityFalse.length, 1, 'Provider must explicitly state authority_inherited=false');
  assert.equal(currentMatches[0][1].toLowerCase(), continuity.currentCheckpointId.toLowerCase());
  assert.equal(predecessorMatches[0][1].toLowerCase(), continuity.predecessorCheckpointId.toLowerCase());
  assert.equal(/PREDECESSOR_IS_CURRENT=true/i.test(text), false, 'Provider contradicted predecessor currentness');
  assert.equal(/AUTHORITY_INHERITED=true/i.test(text), false, 'Provider contradicted authority boundary');

  return {
    current_checkpoint_id: currentMatches[0][1],
    predecessor_checkpoint_id: predecessorMatches[0][1],
    predecessor_is_current: false,
    authority_inherited: false,
  };
}
