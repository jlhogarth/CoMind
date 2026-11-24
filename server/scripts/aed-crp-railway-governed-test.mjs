import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validatePrincipals } from '../dist/runbook/security.js';
import { createEnvelope, sha256 } from '../dist/return-protocol/core.js';
import { createClearReturnVerifier, createFoundryReturnAuthority,
  stageGovernedFallback } from '../dist/return-protocol/authority.js';
import { PostgresReturnStore } from '../dist/return-protocol/postgres.js';
import { parseHostedTestConfig } from '../dist/return-protocol/hosted-test-host.js';

// Bounded synthetic origins against the canonical Foundry SQL lease functions
// in the isolated Railway Test database. No consumer ChatGPT post is attempted.
const config = parseHostedTestConfig(process.env);
const principals = validatePrincipals(JSON.parse(config.principalsJson));
const owners = ['crp-test-origin-a', 'crp-test-origin-b'];
if (owners.some(id => !principals.some(p => p.id === id))) {
  throw new Error('governed_test_principals_missing');
}
const pool = new Pool({ connectionString: config.databaseUrl, max: 4,
  connectionTimeoutMillis: 3000, query_timeout: 10000 });
const store = new PostgresReturnStore(pool);
const executionId = 'AED-CRP-RAILWAY-CANONICAL-TEST-20261124';
const safety = Object.freeze({ l4aAuthorized: true, oneIssueOneBranchOnePr: true,
  noPlaceholder: true, collisionClear: true, freshnessClear: true,
  dependencyValid: true, costGuardrailClear: true, productionChange: false,
  productionAuthorized: false, secretsPresent: false });
try {
  const prior = await pool.query(
    "SELECT return_id FROM comind.cm_aed_crp_return WHERE envelope->>'executionId'=$1",
    [executionId]);
  if (prior.rowCount === 0) {
    const records = await Promise.all(owners.map(async (ownerBinding, index) => {
      const taskId = randomUUID();
      const workerInstanceId = `crp-test-exact-${index}`;
      const origin = { originId: randomUUID(), surface: 'chatgpt_consumer',
        conversationId: randomUUID(), ownerBinding, workKey: 'CBE-004',
        authorityRef: 'isolated-canonical-test' };
      await pool.query("INSERT INTO comind.cm_task(task_id,title,status,priority) VALUES ($1,$2,'blocked',100)",
        [taskId, `CBE return: ${origin.originId}`]);
      await pool.query('INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts) VALUES ($1,2)', [taskId]);
      const global = await pool.query('SELECT * FROM comind.cm_foundry_claim_work($1,60)',
        [workerInstanceId]);
      assert.equal(global.rowCount, 0, 'global queue must not claim blocked CBE task');
      const claimed = await pool.query(
        'SELECT * FROM comind.cm_cbe_claim_return_work($1::uuid,$2::text,300)',
        [taskId, workerInstanceId]);
      assert.equal(claimed.rowCount, 1, 'exact task must be claimed');
      const row = claimed.rows[0];
      assert.equal(row.task_id, taskId);
      const lease = { taskId, leaseToken: row.lease_token,
        fencingEpoch: Number(row.fencing_epoch), workerInstanceId };
      const authorizationRef = `isolated-canonical-test:${taskId}`;
      const envelope = createEnvelope({ origin, executionId,
        recoveryId: 'bounded-canonical-test', lease,
        contextArtifactRef: `urn:comind:test:context:${origin.originId}`,
        contextDigest: sha256(`Test context ${index}`),
        resultArtifactRef: `urn:comind:test:result:${origin.originId}`,
        resultText: `Isolated canonical Test result for origin ${index === 0 ? 'A' : 'B'}`,
        adapter: 'comind_fallback', authorizationRef, clearApproved: true,
        expiresAt: new Date(Date.now() + 45 * 60_000).toISOString() });
      await store.registerOrigin(origin);
      const authority = createFoundryReturnAuthority({ store,
        query: (sql, values) => pool.query(sql, values),
        verifyClear: createClearReturnVerifier(async ref =>
          ref === authorizationRef ? safety : null) });
      await assert.rejects(stageGovernedFallback({ envelope, store, authority,
        authenticatedOwnerBinding: owners[1 - index] }), /owner_binding_mismatch/);
      const staleAuthority = createFoundryReturnAuthority({ store,
        query: (sql, values) => pool.query(sql, values),
        verifyClear: async () => true });
      await assert.rejects(stageGovernedFallback({ envelope: { ...envelope,
        lease: { ...lease, fencingEpoch: lease.fencingEpoch - 1 } }, store,
        authority: staleAuthority, authenticatedOwnerBinding: ownerBinding }), /lease_invalid/);
      const deniedAuthority = createFoundryReturnAuthority({ store,
        query: (sql, values) => pool.query(sql, values),
        verifyClear: createClearReturnVerifier(async () => ({ ...safety,
          collisionClear: false })) });
      await assert.rejects(stageGovernedFallback({ envelope, store,
        authority: deniedAuthority, authenticatedOwnerBinding: ownerBinding }), /clear_invalid/);
      const staged = await stageGovernedFallback({ envelope, store, authority,
        authenticatedOwnerBinding: ownerBinding });
      assert.equal(staged.state, 'QUEUED');
      return { returnId: staged.envelope.returnId, originId: origin.originId,
        taskId, ownerBinding, digest: staged.envelope.resultDigest,
        fencingEpoch: lease.fencingEpoch, leaseExpiresAt: row.lease_expires_at };
    }));
    for (const record of records) process.stdout.write(JSON.stringify({
      proof: 'AED-CRP-isolated-canonical-test', executionId, ...record,
      gates: ['exact_claim','global_queue_denied','owner_denied','stale_fence_denied','clear_denied','clear_allowed'],
    }) + '\n');
  } else if (prior.rowCount !== 2) {
    throw new Error('canonical_test_partial_or_duplicate_returns');
  } else {
    const rows = await pool.query(
      "SELECT return_id,owner_binding,state,envelope->'origin'->>'originId' AS origin_id," +
      " envelope->>'resultDigest' AS digest FROM comind.cm_aed_crp_return " +
      "WHERE envelope->>'executionId'=$1 ORDER BY owner_binding", [executionId]);
    for (const row of rows.rows) process.stdout.write(JSON.stringify({
      proof: 'AED-CRP-isolated-canonical-test-readback', executionId,
      returnId: row.return_id, ownerBinding: row.owner_binding,
      originId: row.origin_id, digest: row.digest, state: row.state,
    }) + '\n');
  }
} finally { await pool.end(); }
