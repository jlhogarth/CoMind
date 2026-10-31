import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { evaluateBrowserJob, redactEvidence } from '../dist/browser-executor/policy.js';

const policy = { allowedHosts: ['github.com'], maxTimeoutMs: 60_000 };
const base = {
  jobId: 'CBE-T1',
  caller: 'test',
  targetUrl: 'https://github.com/',
  actions: ['navigate'],
  timeoutMs: 10_000,
  lease: {
    taskId: randomUUID(),
    leaseToken: randomUUID(),
    fencingEpoch: 1,
    workerInstanceId: 'cbe-test-worker',
  },
  expectedResult: { finalHost: 'github.com' },
};

test('allows bounded read-only navigation to allowlisted host', () => {
  assert.deepEqual(evaluateBrowserJob(base, policy), {
    allowed: true,
    reason: 'allowed',
    consequential: false,
  });
});

test('rejects navigation outside allowlist', () => {
  assert.equal(
    evaluateBrowserJob({ ...base, targetUrl: 'https://playwright.dev/' }, policy).reason,
    'host_not_allowed'
  );
});

test('rejects embedded URL credentials', () => {
  assert.equal(
    evaluateBrowserJob({ ...base, targetUrl: 'https://user:pass@github.com/' }, policy).reason,
    'embedded_credentials_forbidden'
  );
});

test('rejects consequential action without authority and CLEAR', () => {
  assert.equal(evaluateBrowserJob({ ...base, actions: ['click'] }, policy).reason, 'clear_required');
});

test('allows consequential action only with authority and CLEAR', () => {
  assert.equal(
    evaluateBrowserJob({ ...base, actions: ['click'], authorityRef: 'L4A', clearApproved: true }, policy).allowed,
    true
  );
});

test('redacts credential material and strips URL query and fragment evidence', () => {
  assert.deepEqual(
    redactEvidence({
      targetUrl: 'https://github.com/jlhogarth/CoMind?token=raw#fragment',
      cookie: 'x',
      nested: { accessToken: 'y', ok: 1 },
    }),
    {
      targetUrl: 'https://github.com/jlhogarth/CoMind',
      cookie: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', ok: 1 },
    }
  );
});
