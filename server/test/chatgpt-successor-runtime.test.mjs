import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  executeGovernedChatgptSuccessor,
  parseChatgptSuccessorJob,
} from '../dist/browser-executor/chatgpt-successor-runtime.js';

const policy = {
  maxTimeoutMs: 60_000,
  maxMessageChars: 8_000,
  maxProvenanceRefs: 12,
};

function job(overrides = {}) {
  return {
    jobId: randomUUID(),
    caller: 'aed-successor-controller',
    timeoutMs: 30_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 9,
      workerInstanceId: 'aed-005-worker',
    },
    authorityRef: 'l4a-standing-authority',
    clearApproved: true,
    capsule: {
      continuityId: 'continuity-aed-005-runtime',
      laneId: 'AED',
      workKey: 'AED-005',
      verifiedCheckpoint: 'Durable lane state reconciled.',
      nextAction: 'Continue from the next dependency-valid action.',
      authorityRef: 'l4a-standing-authority',
      issue: '#504',
      branch: 'aed-005-successor-conversation-continuity',
      headSha: '1fbe1196900ab6510a03866f4ee2ed3a84cff0f4',
      predecessorBindingEventId: '11111111-1111-4111-8111-111111111111',
      predecessorRefSha256: 'b'.repeat(64),
      provenanceRefs: ['runbook:aed-005'],
    },
    ...overrides,
  };
}

test('strict parser accepts governed successor jobs and rejects authentication material', () => {
  const parsed = parseChatgptSuccessorJob(job());
  assert.equal(parsed.capsule.workKey, 'AED-005');
  assert.throws(
    () => parseChatgptSuccessorJob({ ...job(), cookies: [{ name: 'session', value: 'secret' }] }),
    /Unrecognized key|unrecognized/i
  );
});

test('strict parser rejects raw predecessor conversation URLs as undeclared fields', () => {
  const current = job();
  assert.throws(
    () => parseChatgptSuccessorJob({
      ...current,
      capsule: {
        ...current.capsule,
        predecessorConversationUrl: 'https://chatgpt.com/c/private-id',
      },
    }),
    /Unrecognized key|unrecognized/i
  );
});

test('runtime executes a verified successor without leaking lease capability into evidence', async () => {
  const current = job();
  const successorUrl = 'https://chatgpt.com/c/12345678-1234-4234-8234-123456789abc';
  const result = await executeGovernedChatgptSuccessor(current, policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async create() {
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
  assert.equal(result.successorConversationUrl, successorUrl);
  const evidence = JSON.stringify(result.evidence);
  assert.equal(evidence.includes(current.lease.leaseToken), false);
  assert.equal(evidence.includes(successorUrl), false);
});
