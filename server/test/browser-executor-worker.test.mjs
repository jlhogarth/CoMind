import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFoundryBrowserLeaseVerifier } from '../dist/browser-executor/lease.js';
import { executeBrowserJob } from '../dist/browser-executor/worker.js';

const policy = { allowedHosts: ['github.com'], maxTimeoutMs: 60_000 };

function job(overrides = {}) {
  return {
    jobId: randomUUID(),
    caller: 'cbe-unit-test',
    targetUrl: 'https://github.com/jlhogarth/CoMind?token=raw',
    actions: ['navigate', 'read'],
    timeoutMs: 10_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 7,
      workerInstanceId: 'cbe-unit-worker',
    },
    expectedResult: {
      requireOkResponse: true,
      finalHost: 'github.com',
      titleIncludes: 'CoMind',
    },
    ...overrides,
  };
}

test('rejects an invalid canonical lease before constructing a browser driver', async () => {
  let factoryCalls = 0;
  const result = await executeBrowserJob(job(), policy, {
    leaseVerifier: async () => ({ valid: false, reason: 'lease_expired' }),
    driverFactory: () => {
      factoryCalls += 1;
      throw new Error('driver must not be constructed');
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'lease_expired');
  assert.equal(factoryCalls, 0);
});

test('returns a bounded recoverable failure when the browser is interrupted', async () => {
  const result = await executeBrowserJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async navigate() {
        throw new Error('browser process exited');
      },
      async close() {},
    }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'browser_interrupted');
  assert.equal(result.recoverable, true);
});

test('returns bounded redacted evidence for a successful browser observation', async () => {
  const currentJob = job();
  const result = await executeBrowserJob(currentJob, policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async navigate() {
        return {
          finalUrl: 'https://github.com/jlhogarth/CoMind?token=raw#fragment',
          title: 'GitHub - jlhogarth/CoMind',
          statusCode: 200,
          ok: true,
          screenshot: { sha256: 'abc123', byteLength: 42 },
        };
      },
      async close() {},
    }),
  });
  assert.equal(result.status, 'succeeded');
  const serialized = JSON.stringify(result.evidence);
  assert.equal(serialized.includes('raw'), false);
  assert.equal(serialized.includes(currentJob.lease.leaseToken), false);
  assert.equal(serialized.includes('abc123'), true);
});

test('canonical Foundry lease verifier checks token, worker, fencing epoch, and expiry', async () => {
  const taskId = randomUUID();
  const leaseToken = randomUUID();
  const query = async (sql, params) => {
    assert.match(sql, /comind\.cm_foundry_work_lease/);
    assert.deepEqual(params, [taskId]);
    return {
      rows: [{
        state: 'leased',
        worker_instance_id: 'cbe-unit-worker',
        lease_token: leaseToken,
        fencing_epoch: '9',
        lease_expires_at: '2026-10-31T08:00:00.000Z',
      }],
    };
  };
  const verifier = createFoundryBrowserLeaseVerifier(query);
  assert.deepEqual(
    await verifier(
      {
        taskId,
        leaseToken,
        fencingEpoch: 9,
        workerInstanceId: 'cbe-unit-worker',
      },
      '2026-10-31T07:00:00.000Z'
    ),
    { valid: true }
  );
});
