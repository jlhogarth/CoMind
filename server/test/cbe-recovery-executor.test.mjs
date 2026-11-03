import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedRecoveryExecutor, readPrivateHandoffJob } from '../dist/cbe-control/recovery-executor.js';

const url = 'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';
const request = { action: 'wake_conversation', work_key: 'TEST-LANE', recovery_id: 'test-recovery', environment: 'development-test', production_change: false, requested_at: new Date().toISOString() };
function setup(options = {}) {
  const job = {
    jobId: randomUUID(), caller: 'test-controller', targetUrl: url, registeredConversationUrl: url,
    timeoutMs: 30000, authorityRef: 'test-authority', clearApproved: true,
    lease: { taskId: randomUUID(), leaseToken: randomUUID(), fencingEpoch: 1, workerInstanceId: 'test-worker' },
    handoff: { recoveryId: request.recovery_id, workKey: request.work_key, reasonCode: 'test-repair', repairSummary: 'Synthetic repair verified.', verifiedState: 'Synthetic acceptance passed.', nextAction: 'Continue synthetic test lane.' },
  };
  const counts = { drivers: 0, closed: 0, released: 0, bindingReads: 0 };
  const execute = createStagedRecoveryExecutor({
    jobFile: '/synthetic/private-job.json', profileDir: '/synthetic/profile',
    readJob: async () => options.badJob ? { ...job, cookies: 'private-material' } : job,
    query: async (sql) => {
      if (sql.includes('resolve_lane_conversation_binding')) {
        counts.bindingReads++;
        return { rows: [{ binding: { status: options.inactive ? 'conversation_binding_inactive' : 'active', registeredConversationUrl: options.changed || (options.changeAfterLock && counts.bindingReads > 1) ? 'https://chatgpt.com/c/22222222-2222-4222-8222-222222222222' : url } }] };
      }
      return { rows: [{ state: 'leased', worker_instance_id: job.lease.workerInstanceId, lease_token: job.lease.leaseToken, fencing_epoch: options.stale ? 2 : 1, lease_expires_at: new Date(Date.now() + 60000) }] };
    },
    acquireLock: async () => options.busy ? { acquired: false, reason: 'busy' } : { acquired: true, handle: { release: async () => { counts.released++; if (options.releaseFailure) throw new Error('private-path'); } } },
    driverFactory: () => {
      counts.drivers++;
      return {
        deliver: async input => {
          assert.equal(input.targetUrl, url);
          assert.match(input.message, /Proceed autonomously/);
          if (options.deliveryFailure) throw new Error('private-material');
          return { finalUrl: url, posted: true, alreadyPresent: false, responseStarted: !options.noResponse };
        },
        close: async () => { counts.closed++; },
      };
    },
  });
  return { execute, counts, job };
}

test('matching staged job returns to original conversation with canonical binding and lease checks', async () => {
  const { execute, counts, job } = setup();
  const result = await execute(request);
  assert.equal(result.status, 'RETURNED');
  assert.equal(result.correlation_id, job.jobId);
  assert.equal(counts.bindingReads, 2);
  assert.equal(counts.closed, 1);
  assert.equal(counts.released, 1);
  assert.ok(!JSON.stringify(result).includes(job.lease.leaseToken));
  assert.ok(!JSON.stringify(result).includes(url));
});
for (const [label, options, altered, reason] of [
  ['wrong recovery', {}, { recovery_id: 'other' }, 'recovery_job_mismatch'],
  ['wrong lane', {}, { work_key: 'OTHER-LANE' }, 'recovery_job_mismatch'],
  ['missing recovery', {}, { recovery_id: null }, 'recovery_identity_required'],
  ['repair request', {}, { action: 'retry_recovery' }, 'semantic_recovery_executor_unavailable'],
  ['Production request', {}, { production_change: true }, 'environment_invalid'],
  ['undeclared auth', { badJob: true }, {}, 'handoff_job_unavailable'],
  ['inactive binding', { inactive: true }, {}, 'conversation_binding_unavailable'],
  ['changed binding', { changed: true }, {}, 'conversation_binding_changed'],
  ['busy profile', { busy: true }, {}, 'browser_profile_busy'],
]) {
  test(`${label} never constructs browser`, async () => {
    const { execute, counts } = setup(options);
    await assert.rejects(execute({ ...request, ...altered }), e => e.reason === reason && !e.message.includes('private-material'));
    assert.equal(counts.drivers, 0);
  });
}
for (const options of [{ stale: true }, { changeAfterLock: true }]) {
  test(`late preflight rejection releases lock: ${JSON.stringify(options)}`, async () => {
    const { execute, counts } = setup(options);
    assert.equal((await execute(request)).status, 'RETURN_FAILED');
    assert.equal(counts.drivers, 0);
    assert.equal(counts.released, 1);
  });
}
for (const options of [{ noResponse: true }, { deliveryFailure: true }]) {
  test(`failed delivery never reports returned: ${JSON.stringify(options)}`, async () => {
    const { execute, counts } = setup(options);
    const result = await execute(request);
    assert.equal(result.status, 'RETURN_FAILED');
    assert.equal(counts.closed, 1);
    assert.equal(counts.released, 1);
    assert.ok(!JSON.stringify(result).includes('private-material'));
  });
}
test('lock release failure cannot report success or disclose paths', async () => {
  const { execute } = setup({ releaseFailure: true });
  await assert.rejects(execute(request), e => e.reason === 'browser_profile_release_failed' && !e.message.includes('private-path'));
});
test('private file reader accepts bounded owner-only file and rejects broad permissions, symlink, and oversize', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cbe-job-test-'));
  const path = join(dir, 'job.json');
  try {
    await writeFile(path, '{"synthetic":true}', { mode: 0o600 });
    assert.deepEqual(await readPrivateHandoffJob(path), { synthetic: true });
    await chmod(path, 0o644);
    await assert.rejects(readPrivateHandoffJob(path));
    await chmod(path, 0o600);
    await symlink(path, join(dir, 'link.json'));
    await assert.rejects(readPrivateHandoffJob(join(dir, 'link.json')));
    await writeFile(path, 'x'.repeat(32769));
    await assert.rejects(readPrivateHandoffJob(path));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('authorized HTTP control request reaches the staged original-return executor', async () => {
  const { default: Fastify } = await import('fastify');
  const { createCbeControlExecutor } = await import('../dist/cbe-control/executor.js');
  const { registerCbeControlRoutes } = await import('../dist/routes/cbe-control.js');
  const { execute, job } = setup();
  const app = Fastify();
  const executor = createCbeControlExecutor({ recoveryExecutor: execute });
  registerCbeControlRoutes(app, executor, 'synthetic-control-token');
  try {
    const response = await app.inject({ method: 'POST', url: '/api/cbe-control', headers: { authorization: 'Bearer synthetic-control-token' }, payload: request });
    assert.equal(response.statusCode, 202);
    assert.equal(response.json().status, 'RETURNED');
    assert.ok(!response.body.includes(job.lease.leaseToken));
    assert.ok(!response.body.includes(url));
  } finally { await app.close(); await executor.close(); }
});
