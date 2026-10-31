import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBrowserJob, redactEvidence } from '../dist/browser-executor/policy.js';

const policy = { allowedHosts: ['github.com'], maxTimeoutMs: 60_000 };
const base = { jobId: 'CBE-T1', caller: 'test', targetUrl: 'https://github.com/', actions: ['navigate'], timeoutMs: 10_000, leaseId: 'lease-1' };

test('allows bounded read-only navigation to allowlisted host', () => {
  assert.deepEqual(evaluateBrowserJob(base, policy), { allowed: true, reason: 'allowed', consequential: false });
});

test('rejects navigation outside allowlist', () => {
  assert.equal(evaluateBrowserJob({ ...base, targetUrl: 'https://playwright.dev/' }, policy).reason, 'host_not_allowed');
});

test('rejects consequential action without authority and CLEAR', () => {
  assert.equal(evaluateBrowserJob({ ...base, actions: ['click'] }, policy).reason, 'clear_required');
});

test('allows consequential action only with authority and CLEAR', () => {
  assert.equal(evaluateBrowserJob({ ...base, actions: ['click'], authorityRef: 'L4A', clearApproved: true }, policy).allowed, true);
});

test('redacts credential material recursively', () => {
  assert.deepEqual(redactEvidence({ url: 'https://github.com', cookie: 'x', nested: { accessToken: 'y', ok: 1 } }), { url: 'https://github.com', cookie: '[REDACTED]', nested: { accessToken: '[REDACTED]', ok: 1 } });
});
