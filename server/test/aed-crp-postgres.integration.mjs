import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createEnvelope, sha256 } from '../dist/return-protocol/core.js';
import { PostgresReturnStore } from '../dist/return-protocol/postgres.js';

const url = process.env.AED_CRP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/comind_crp_acceptance') {
  throw new Error('AED_CRP_TEST_DATABASE_URL must target the isolated comind_crp_acceptance database');
}

const pool = new pg.Pool({ connectionString: url, max: 4 });
test.after(async () => pool.end());

function fixture(ownerBinding, conversationId) {
  const origin = { originId: randomUUID(), surface: 'openai_api', conversationId,
    ownerBinding, workKey: 'CBE-004', authorityRef: 'isolated-test' };
  const envelope = createEnvelope({ origin, executionId: randomUUID(), recoveryId: randomUUID(),
    lease: { taskId: randomUUID(), leaseToken: randomUUID(), fencingEpoch: 1,
      workerInstanceId: 'isolated-test-worker' },
    contextArtifactRef: 'private://isolated-context', contextDigest: sha256('isolated context'),
    resultArtifactRef: 'private://isolated-result', resultText: `Return for ${conversationId}`,
    adapter: 'comind_fallback', authorizationRef: 'isolated-test-clear', clearApproved: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString() });
  return { origin, envelope };
}

test('PostgreSQL 17 persists distinct origins, duplicate-safe outbox and owner-bound fallback across pool restart', async () => {
  const store = new PostgresReturnStore(pool);
  const a = fixture('owner-A', 'conv_isolatedA');
  const b = fixture('owner-B', 'conv_isolatedB');
  await Promise.all([store.registerOrigin(a.origin), store.registerOrigin(b.origin)]);
  const [ra, rb] = await Promise.all([store.stage(a.envelope), store.stage(b.envelope)]);
  assert.equal(ra.state, 'QUEUED'); assert.equal(rb.state, 'QUEUED');
  const duplicate = createEnvelope({ ...a.envelope, returnId: randomUUID(),
    origin: a.origin, clearApproved: true, resultText: a.envelope.resultText });
  assert.equal((await store.stage(duplicate)).envelope.returnId, ra.envelope.returnId);

  const restartedPool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    const restarted = new PostgresReturnStore(restartedPool);
    assert.equal((await restarted.get(a.envelope.returnId)).envelope.resultDigest,
      sha256(a.envelope.resultText));
    await assert.rejects(restarted.readFallback(a.envelope.returnId, 'owner-B'),
      /return_not_available/);
    assert.equal((await restarted.readFallback(a.envelope.returnId, 'owner-A')).state, 'QUEUED');
    const acknowledged = await restarted.acknowledgeFallback(
      a.envelope.returnId, 'owner-A', a.envelope.resultDigest);
    assert.equal(acknowledged.state, 'ACKNOWLEDGED');
    assert.equal((await restarted.acknowledgeFallback(
      a.envelope.returnId, 'owner-A', a.envelope.resultDigest)).state, 'ACKNOWLEDGED');
    assert.equal((await restarted.readFallback(b.envelope.returnId, 'owner-B')).state, 'QUEUED');
    const events = await restartedPool.query(
      `SELECT event_type, state FROM comind.cm_aed_crp_event
       WHERE return_id=$1 ORDER BY event_id`, [a.envelope.returnId]);
    assert.deepEqual(events.rows.map(e => e.event_type), ['staged', 'recipient_acknowledged']);
    await assert.rejects(restartedPool.query(
      'DELETE FROM comind.cm_aed_crp_event WHERE return_id=$1', [a.envelope.returnId]),
      /append-only/);
  } finally { await restartedPool.end(); }
});

test('PostgreSQL fenced claims prevent concurrent worker takeover', async () => {
  const store = new PostgresReturnStore(pool);
  const { origin, envelope } = fixture('owner-C', 'conv_isolatedC');
  await store.registerOrigin(origin); await store.stage(envelope);
  const [first, second] = await Promise.all([
    store.claim(envelope.returnId, 'worker-1'), store.claim(envelope.returnId, 'worker-2')]);
  assert.equal(Number(Boolean(first)) + Number(Boolean(second)), 1);
  const winner = first ?? second;
  const worker = first ? 'worker-1' : 'worker-2';
  await assert.rejects(store.transition(envelope.returnId, worker, randomUUID(),
    'DELIVERY_UNCERTAIN', { reason: 'stale' }), /claim_lost/);
  const transitioned = await store.transition(envelope.returnId, worker, winner.claimToken,
    'DELIVERY_UNCERTAIN', { reason: 'isolated interruption' });
  assert.equal(transitioned.state, 'DELIVERY_UNCERTAIN');
  assert.equal((await store.get(envelope.returnId)).attemptCount, 1);
});
