import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  evaluateChatgptHandoffJob,
  executeChatgptHandoffJob,
  formatChatgptRecoveryHandoff,
  normalizeChatgptConversationUrl,
} from '../dist/browser-executor/chatgpt-handoff.js';

const conversationUrl = 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc';
const policy = { maxTimeoutMs: 60_000, maxMessageChars: 8_000 };

function handoff(overrides = {}) {
  return {
    recoveryId: 'recovery-001',
    workKey: 'TEST-LANE-001',
    reasonCode: 'stalled_ci_recovery',
    repairSummary: 'Reconciled the stale branch and repaired the bounded failing fixture.',
    verifiedState: 'Exact-head acceptance resumed with no observed failures.',
    nextAction: 'Continue the existing lane through exact-head acceptance and merge when gates are satisfied.',
    issue: '#100',
    branch: 'test-lane-001',
    pullRequest: '#101',
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    jobId: randomUUID(),
    caller: 'aed-recovery-controller',
    targetUrl: conversationUrl,
    registeredConversationUrl: conversationUrl,
    timeoutMs: 30_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 4,
      workerInstanceId: 'cbe-002-worker',
    },
    authorityRef: 'l4a-standing-authority',
    clearApproved: true,
    handoff: handoff(),
    ...overrides,
  };
}

test('normalizes only stable chatgpt.com conversation URLs', () => {
  assert.equal(
    normalizeChatgptConversationUrl(`${conversationUrl}?utm_source=test#fragment`),
    conversationUrl
  );
  assert.equal(normalizeChatgptConversationUrl('https://example.com/c/123'), null);
  assert.equal(normalizeChatgptConversationUrl('http://chatgpt.com/c/123'), null);
  assert.equal(normalizeChatgptConversationUrl('https://chatgpt.com/'), null);
});

test('formats a bounded provenance-marked AED recovery handoff', () => {
  const message = formatChatgptRecoveryHandoff(handoff());
  assert.match(message, /^\[CoMind AED Recovery Handoff\]/);
  assert.match(message, /Recovery ID: recovery-001/);
  assert.match(message, /RECOVERY DATA/);
  assert.match(message, /CoMind Application Development Contract/);
});

test('rejects a mismatched registered conversation before browser execution', async () => {
  const currentJob = job({
    registeredConversationUrl: 'https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  });
  const decision = evaluateChatgptHandoffJob(currentJob, policy);
  assert.deepEqual(decision, { allowed: false, reason: 'conversation_binding_mismatch' });
});

test('rejects consequential handoff without CLEAR approval', () => {
  const decision = evaluateChatgptHandoffJob(job({ clearApproved: false }), policy);
  assert.deepEqual(decision, { allowed: false, reason: 'clear_required' });
});

test('rejects unsupported host and malformed handoff', () => {
  assert.deepEqual(
    evaluateChatgptHandoffJob(
      job({ targetUrl: 'https://example.com/c/123', registeredConversationUrl: 'https://example.com/c/123' }),
      policy
    ),
    { allowed: false, reason: 'invalid_target_conversation' }
  );
  assert.deepEqual(
    evaluateChatgptHandoffJob(job({ handoff: handoff({ nextAction: '' }) }), policy),
    { allowed: false, reason: 'invalid_handoff' }
  );
});

test('rejects a stale canonical lease before constructing the browser driver', async () => {
  let factoryCalls = 0;
  const result = await executeChatgptHandoffJob(job(), policy, {
    leaseVerifier: async () => ({ valid: false, reason: 'fencing_epoch_mismatch' }),
    driverFactory: () => {
      factoryCalls += 1;
      throw new Error('driver must not be constructed');
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'fencing_epoch_mismatch');
  assert.equal(factoryCalls, 0);
});

test('executes a verified bounded handoff without exposing URL or lease token in evidence', async () => {
  const currentJob = job();
  const result = await executeChatgptHandoffJob(currentJob, policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async deliver(input) {
        assert.equal(input.targetUrl, conversationUrl);
        assert.match(input.message, /Recovery ID: recovery-001/);
        return {
          finalUrl: conversationUrl,
          posted: true,
          alreadyPresent: false,
          responseStarted: true,
        };
      },
      async close() {},
    }),
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.reason, 'completed');
  const serialized = JSON.stringify(result.evidence);
  assert.equal(serialized.includes(conversationUrl), false);
  assert.equal(serialized.includes(currentJob.lease.leaseToken), false);
  assert.equal(serialized.includes('messageSha256'), true);
  assert.equal(serialized.includes('responseStarted'), true);
});

test('treats an already-present recovery ID as an idempotent success', async () => {
  const result = await executeChatgptHandoffJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async deliver() {
        return {
          finalUrl: conversationUrl,
          posted: false,
          alreadyPresent: true,
          responseStarted: true,
        };
      },
      async close() {},
    }),
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.reason, 'already_delivered');
  assert.equal(result.evidence.alreadyPresent, true);
});

test('fails closed when final browser identity does not match the registered conversation', async () => {
  const result = await executeChatgptHandoffJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async deliver() {
        return {
          finalUrl: 'https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          posted: true,
          alreadyPresent: false,
          responseStarted: true,
        };
      },
      async close() {},
    }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'conversation_identity_mismatch');
  assert.equal(result.recoverable, false);
});

test('does not report success until response start is observed', async () => {
  const result = await executeChatgptHandoffJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async deliver() {
        return {
          finalUrl: conversationUrl,
          posted: true,
          alreadyPresent: false,
          responseStarted: false,
        };
      },
      async close() {},
    }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'handoff_verification_failed');
  assert.equal(result.recoverable, true);
});
