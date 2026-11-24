import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validatePrincipals } from '../dist/runbook/security.js';
import { createEnvelope, sha256 } from '../dist/return-protocol/core.js';
import { PostgresReturnStore } from '../dist/return-protocol/postgres.js';
import { parseHostedTestConfig } from '../dist/return-protocol/hosted-test-host.js';

// Isolated synthetic acceptance data only. This deliberately does not claim a
// canonical Foundry lease or CLEAR decision.
const config = parseHostedTestConfig(process.env);
const principals = validatePrincipals(JSON.parse(config.principalsJson));
const owners = ['crp-test-origin-a', 'crp-test-origin-b'];
if (owners.some(id => !principals.some(principal => principal.id === id))) {
  throw new Error('synthetic_proof_principals_missing');
}
const pool = new Pool({ connectionString: config.databaseUrl, max: 2,
  connectionTimeoutMillis: 3000, query_timeout: 5000 });
const store = new PostgresReturnStore(pool);
const executionId = 'AED-CRP-RAILWAY-POC-20261123';
try {
  const existing = await pool.query(
    "SELECT envelope FROM comind.cm_aed_crp_return WHERE envelope->>'executionId'=$1 ORDER BY created_at",
    [executionId]);
  if (existing.rowCount === 0) {
    for (const [index, ownerBinding] of owners.entries()) {
      const origin = {
        originId: randomUUID(), surface: 'chatgpt_consumer',
        conversationId: randomUUID(), ownerBinding, workKey: 'CBE-004',
        authorityRef: 'synthetic-test-fixture',
      };
      await store.registerOrigin(origin);
      const envelope = createEnvelope({
        origin, executionId, recoveryId: 'synthetic-restart-proof',
        lease: { taskId: randomUUID(), leaseToken: randomUUID(),
          fencingEpoch: 1, workerInstanceId: 'synthetic-hosted-proof' },
        contextArtifactRef: 'urn:comind:test:synthetic-context',
        contextDigest: sha256(`Synthetic context ${index}`),
        resultArtifactRef: 'urn:comind:test:synthetic-result',
        resultText: `Synthetic AED result for origin ${index === 0 ? 'A' : 'B'}`,
        adapter: 'comind_fallback', authorizationRef: 'synthetic-test-fixture',
        clearApproved: true, expiresAt: '2026-12-01T00:00:00Z',
      });
      await store.stage(envelope);
    }
  } else if (existing.rowCount !== 2) {
    throw new Error('synthetic_proof_partial_or_duplicate_rows');
  }
  const rows = await pool.query(
    "SELECT return_id, owner_binding, state, envelope->'origin'->>'originId' AS origin_id, " +
    "envelope->>'resultDigest' AS digest FROM comind.cm_aed_crp_return " +
    "WHERE envelope->>'executionId'=$1 ORDER BY owner_binding", [executionId]);
  if (rows.rowCount !== 2 || rows.rows.some((row, index) => row.owner_binding !== owners[index])) {
    throw new Error('synthetic_proof_origin_mismatch');
  }
  for (const row of rows.rows) {
    process.stdout.write(JSON.stringify({ proof: 'AED-CRP-synthetic-hosted',
      executionId, returnId: row.return_id, ownerBinding: row.owner_binding,
      originId: row.origin_id, digest: row.digest, state: row.state }) + '\n');
  }
} finally {
  await pool.end();
}
