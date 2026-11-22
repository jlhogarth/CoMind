import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createEnvelope, sha256 } from '../dist/return-protocol/core.js';
import { createClearReturnVerifier, createFoundryReturnAuthority,
  stageGovernedFallback } from '../dist/return-protocol/authority.js';
import { PostgresReturnStore } from '../dist/return-protocol/postgres.js';

const databaseUrl = process.env.AED_CRP_TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/comind_crp_acceptance' ||
    !['localhost', '127.0.0.1', 'db'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Isolated comind_crp_acceptance database required');
}
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const temp = await mkdtemp(join(tmpdir(), 'aed-crp-hosted-'));
const port = Number(process.env.AED_CRP_TEST_PORT ?? 3012);
let child;
const now = () => new Date().toISOString();
const safety = Object.freeze({
  l4aAuthorized: true, oneIssueOneBranchOnePr: true, noPlaceholder: true,
  collisionClear: true, freshnessClear: true, dependencyValid: true,
  costGuardrailClear: true, productionChange: false,
  productionAuthorized: false, secretsPresent: false,
});
const base = `http://127.0.0.1:${port}`;
const principals = [
  { id: 'crp_owner_A', token: randomBytes(32).toString('hex'),
    projects: ['COMIND'], expiresAt: new Date(Date.now() + 3600000).toISOString() },
  { id: 'crp_owner_B', token: randomBytes(32).toString('hex'),
    projects: ['COMIND'], expiresAt: new Date(Date.now() + 3600000).toISOString() },
];
const principalsFile = join(temp, 'principals.json');
const events = [];
const http = async (path, principal, method = 'GET', body) => {
  const response = await fetch(base + path, {
    method,
    headers: { ...(principal ? { authorization: `Bearer ${principal.token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};
async function startHost() {
  child = spawn(process.execPath, ['dist/return-protocol/test-host.js'], {
    cwd: process.cwd(), env: { ...process.env, AED_CRP_TEST_DATABASE_URL: databaseUrl,
      AED_CRP_PRINCIPALS_FILE: principalsFile, AED_CRP_TEST_ONLY: 'true',
      AED_CRP_TEST_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errorText = '';
  child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-1000); });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Test host exited: ' + errorText);
    try {
      const response = await http('/health');
      if (response.status === 200 && response.body.service === 'aed-crp-test-return') return;
    } catch {}
    await delay(100);
  }
  throw new Error('Test host did not become healthy: ' + errorText);
}
async function stopHost() {
  if (!child) return;
  const current = child; child = undefined;
  if (current.exitCode === null) {
    current.kill('SIGTERM');
    await Promise.race([once(current, 'exit'), delay(5000).then(() => {
      current.kill('SIGKILL'); throw new Error('Test host did not stop');
    })]);
  }
}
function fixture(index) {
  const principal = principals[index];
  const origin = { originId: randomUUID(), surface: 'openai_api',
    conversationId: `conv_crp_hosted_${index}_${randomUUID()}`,
    ownerBinding: principal.id, workKey: 'CBE-004', authorityRef: 'CRP-TEST-CLEAR' };
  const lease = { taskId: randomUUID(), leaseToken: randomUUID(),
    fencingEpoch: 1, workerInstanceId: `crp-hosted-worker-${index}` };
  const resultText = `Synthetic result for isolated origin ${index}`;
  const envelope = createEnvelope({
    origin, executionId: randomUUID(), recoveryId: randomUUID(), lease,
    contextArtifactRef: `private://crp-test/context/${index}`,
    contextDigest: sha256(`context-${index}`),
    resultArtifactRef: `private://crp-test/result/${index}`,
    resultText, adapter: 'comind_fallback',
    authorizationRef: `CRP-TEST-CLEAR-${index}`, clearApproved: true,
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  return { principal, origin, lease, envelope, resultText };
}
try {
  await writeFile(principalsFile, JSON.stringify(principals), { mode: 0o600, flag: 'wx' });
  await pool.query('CREATE SCHEMA IF NOT EXISTS comind');
  await pool.query(await readFile('../db/migrations/20261122_001_aed_crp_outbox.sql', 'utf8'));
  await pool.query(await readFile('../db/migrations/verify_20261122_001_aed_crp_outbox.sql', 'utf8'));
  // Fixture has only the columns read by the existing Foundry lease verifier.
  // It never substitutes for a live Foundry claim or production authority.
  await pool.query(`CREATE TABLE IF NOT EXISTS comind.cm_foundry_work_lease (
    task_id uuid PRIMARY KEY, state text NOT NULL, worker_instance_id text,
    lease_token uuid, fencing_epoch bigint NOT NULL, lease_expires_at timestamptz)`);
  const store = new PostgresReturnStore(pool);
  const cases = [fixture(0), fixture(1)];
  const safetyByRef = new Map(cases.map(c => [c.envelope.authorizationRef, safety]));
  const authority = createFoundryReturnAuthority({
    store, query: (sql, values) => pool.query(sql, values),
    verifyClear: createClearReturnVerifier(async ref => safetyByRef.get(ref) ?? null),
  });
  for (const c of cases) {
    await store.registerOrigin(c.origin);
    await pool.query(`INSERT INTO comind.cm_foundry_work_lease
      (task_id,state,worker_instance_id,lease_token,fencing_epoch,lease_expires_at)
      VALUES ($1,'leased',$2,$3,$4,clock_timestamp()+interval '15 minutes')`,
      [c.lease.taskId, c.lease.workerInstanceId, c.lease.leaseToken, c.lease.fencingEpoch]);
  }
  await assert.rejects(stageGovernedFallback({ envelope: cases[0].envelope, store,
    authority, authenticatedOwnerBinding: principals[1].id }), /owner_binding_mismatch/);
  const [a, b] = await Promise.all(cases.map(c => stageGovernedFallback({
    envelope: c.envelope, store, authority, authenticatedOwnerBinding: c.principal.id,
  })));
  assert.equal(a.state, 'QUEUED'); assert.equal(b.state, 'QUEUED');
  events.push({ test: 'dual_origin_admission', status: 'pass', at: now(),
    originIds: cases.map(c => c.origin.originId), returnIds: cases.map(c => c.envelope.returnId) });
  await startHost();
  for (let index = 0; index < 2; index++) {
    const c = cases[index];
    const path = `/v1/aed/returns/${c.envelope.returnId}`;
    assert.equal((await http(path)).status, 401);
    assert.equal((await http(path, principals[1-index])).status, 404);
    const read = await http(path, c.principal);
    assert.equal(read.status, 200);
    assert.equal(read.body.originId, c.origin.originId);
    assert.equal(read.body.resultText, c.resultText);
    assert.equal(read.body.resultDigest, sha256(read.body.resultText));
  }
  events.push({ test: 'owner_isolation_and_integrity', status: 'pass', at: now() });
  await stopHost();
  events.push({ test: 'worker_process_stopped', status: 'pass', at: now() });
  await startHost();
  const independentPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    for (const c of cases) {
      const path = `/v1/aed/returns/${c.envelope.returnId}`;
      const read = await http(path, c.principal);
      assert.equal(read.status, 200);
      assert.equal(read.body.originId, c.origin.originId);
      const ack = await http(path + '/receipt', c.principal, 'POST',
        { resultDigest: read.body.resultDigest });
      assert.equal(ack.status, 200);
      assert.equal(ack.body.state, 'ACKNOWLEDGED');
      const persisted = await independentPool.query(
        'SELECT state,receipt_digest FROM comind.cm_aed_crp_return WHERE return_id=$1',
        [c.envelope.returnId]);
      assert.equal(persisted.rows[0].state, 'ACKNOWLEDGED');
      assert.equal(persisted.rows[0].receipt_digest, c.envelope.resultDigest);
    }
  } finally { await independentPool.end(); }
  events.push({ test: 'restart_readback_and_receipts', status: 'pass', at: now(),
    assurance: 'CoMind fallback receipt; no consumer ChatGPT delivery' });
  await mkdir('../artifacts', { recursive: true });
  await writeFile('../artifacts/aed-crp-hosted-proof.jsonl',
    events.map(event => JSON.stringify({ ...event, environment: 'GitHub Actions isolated PostgreSQL 17',
      codeRevision: process.env.GITHUB_SHA ?? 'local' })).join('\n') + '\n');
  process.stdout.write('AED-CRP hosted bounded proof passed: two origins, restart, readback, owner isolation and receipts\n');
} finally {
  await stopHost().catch(() => {});
  await pool.end();
  await rm(temp, { recursive: true, force: true });
}
