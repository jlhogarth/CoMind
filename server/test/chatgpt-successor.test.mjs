import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  evaluateChatgptSuccessorJob,
  executeChatgptSuccessorJob,
  formatChatgptSuccessorContinuity,
} from '../dist/browser-executor/chatgpt-successor.js';

const policy = {
  maxTimeoutMs: 60_000,
  maxMessageChars: 8_000,
  maxProvenanceRefs: 12,
};

const successorUrl = 'https://chatgpt.com/c/12345678-1234-4234-8234-123456789abc';

function job(overrides = {}) {
  return {
    jobId: randomUUID(),
    caller: 'aed-successor-controller',
    timeoutMs: 30_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 8,
      workerInstanceId: 'aed-005-worker',
    },
    authorityRef: 'l4a-standing-authority',
    clearApproved: true,
    capsule: {
      continuityId: 'continuity-aed-005-001',
      laneId: 'AED',
      workKey: 'AED-005',
      verifiedCheckpoint: 'CBE-MOBILE-003 merged and AED-005 branch created from accepted main.',
      nextAction: 'Continue AED-005 from the next dependency-valid action.',
      authorityRef: 'l4a-standing-authority',
      issue: '#504',
      branch: 'aed-005-successor-conversation-continuity',
      headSha: '1fbe1196900ab6510a03866f4ee2ed3a84cff0f4',
      predecessorRefSha256: 'a'.repeat(64),
      provenanceRefs: ['github:issue-504', 'github:main-1fbe1196'],
    },
    ...overrides,
  };
}

test('formats a bounded successor continuity message without a private predecessor URL', () => {
  const message = formatChatgptSuccessorContinuity(job().capsule);
  assert.match(message, /\[CoMind AED Successor Continuity\]/);
  assert.match(message, /Continuity ID: continuity-aed-005-001/);
  assert.match(message, /Proceed autonomously under the CoMind Application Development Contract/);
  assert.equal(message.includes('https://chatgpt.com/c/'), false);
});

test('accepts a valid governed successor job', () => {
  const decision = evaluateChatgptSuccessorJob(job(), policy);
  assert.equal(decision.allowed, true);
  assert.match(decision.message, /work_key/);
});

test('rejects authority mismatch and malformed predecessor hash', () => {
  const authorityMismatch = evaluateChatgptSuccessorJob(job({
    capsule: { ...job().capsule, authorityRef: 'different-authority' },
  }), policy);
  assert.equal(authorityMismatch.allowed, false);
  assert.equal(authorityMismatch.reason, 'authority_reference_mismatch');

  const invalidHash = evaluateChatgptSuccessorJob(job({
    capsule: { ...job().capsule, predecessorRefSha256: 'not-a-hash' },
  }), policy);
  assert.equal(invalidHash.allowed, false);
  assert.equal(invalidHash.reason, 'invalid_continuity_capsule');
});

test('rejects stale lease before constructing a browser driver', async () => {
  let factoryCalls = 0;
  const result = await executeChatgptSuccessorJob(job(), policy, {
    leaseVerifier: async () => ({ valid: false, reason: 'lease_epoch_mismatch' }),
    driverFactory: () => {
      factoryCalls += 1;
      throw new Error('browser must not be constructed');
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'lease_epoch_mismatch');
  assert.equal(factoryCalls, 0);
});

test('verified successor creation returns the private binding separately from redacted evidence', async () => {
  const currentJob = job();
  const result = await executeChatgptSuccessorJob(currentJob, policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async create(input) {
        assert.match(input.message, /Continuity ID: continuity-aed-005-001/);
        return {
          finalUrl: successorUrl,
          posted: true,
          responseStarted: true,
        };
      },
      async close() {},
    }),
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.reason, 'successor_active');
  assert.equal(result.successorConversationUrl, successorUrl);
  const evidence = JSON.stringify(result.evidence);
  assert.equal(evidence.includes(successorUrl), false);
  assert.equal(evidence.includes(currentJob.lease.leaseToken), false);
  assert.match(evidence, /successorConversationRefSha256/);
});

test('response start is mandatory before a successor can become active', async () => {
  const result = await executeChatgptSuccessorJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async create() {
        return {
          finalUrl: successorUrl,
          posted: true,
          responseStarted: false,
        };
      },
      async close() {},
    }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'successor_verification_failed');
  assert.equal(result.successorConversationUrl, undefined);
});

test('browser failure is recoverable and does not invent a successor binding', async () => {
  const result = await executeChatgptSuccessorJob(job(), policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async create() {
        const error = new Error('timeout');
        error.name = 'TimeoutError';
        throw error;
      },
      async close() {},
    }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'browser_timeout');
  assert.equal(result.recoverable, true);
  assert.equal(result.successorConversationUrl, undefined);
});
