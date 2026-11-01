import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  executeGovernedChatgptConversationReturn,
  mapChatgptExecutionToMp006,
  parseChatgptHandoffJob,
  unavailableConversationReturn,
} from '../dist/browser-executor/chatgpt-handoff-runtime.js';

const conversationUrl = 'https://chatgpt.com/c/12345678-1234-4234-8234-123456789abc';
const policy = { maxTimeoutMs: 60_000, maxMessageChars: 8_000 };

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
      fencingEpoch: 7,
      workerInstanceId: 'cbe-003-worker',
    },
    authorityRef: 'l4a-standing-authority',
    clearApproved: true,
    handoff: {
      recoveryId: 'recovery-cbe-003',
      workKey: 'NOTEBOOK-001',
      reasonCode: 'deterministic_ci_failure_repaired',
      repairSummary: 'Recovered the lane and verified semantic progress.',
      verifiedState: 'The repository is in a dependency-valid state.',
      nextAction: 'Continue the lane from the verified next action.',
      issue: '#480',
      branch: 'notebook-001-capture-review-test',
      pullRequest: '#152',
    },
    ...overrides,
  };
}

test('strict job parser accepts the governed lease contract and rejects browser authentication material', () => {
  const parsed = parseChatgptHandoffJob(job());
  assert.equal(parsed.targetUrl, conversationUrl);
  assert.throws(
    () => parseChatgptHandoffJob({ ...job(), cookies: [{ name: 'session', value: 'secret' }] }),
    /Unrecognized key|unrecognized/i
  );
});

test('maps verified handoff success to MP-006 RETURNED and releases controller ownership', () => {
  const mapped = mapChatgptExecutionToMp006({
    status: 'succeeded',
    reason: 'completed',
    recoverable: false,
    evidence: Object.freeze({ responseStarted: true }),
  });
  assert.equal(mapped.returnStatus, 'RETURNED');
  assert.equal(mapped.conversationReturned, true);
  assert.equal(mapped.conversationReturnImpossible, false);
  assert.equal(mapped.ownershipReleased, true);
  assert.equal(mapped.controllerMayContinueImplementation, false);
  assert.equal(mapped.retryEligible, false);
});

test('maps authentication absence to explicit RETURN_UNAVAILABLE rather than silent success', () => {
  const mapped = mapChatgptExecutionToMp006({
    status: 'failed',
    reason: 'authentication_required',
    recoverable: true,
    evidence: Object.freeze({}),
  });
  assert.equal(mapped.returnStatus, 'RETURN_UNAVAILABLE');
  assert.equal(mapped.conversationReturned, false);
  assert.equal(mapped.conversationReturnImpossible, true);
  assert.equal(mapped.returnReason, 'authentication_required');
  assert.equal(mapped.retryEligible, true);
  assert.equal(mapped.controllerMayContinueImplementation, false);
});

test('configuration failure is explicit and never grants controller implementation authority', () => {
  const mapped = unavailableConversationReturn('actuator_configuration_invalid', 'profile missing');
  assert.equal(mapped.returnStatus, 'RETURN_UNAVAILABLE');
  assert.equal(mapped.returnReason, 'actuator_configuration_invalid');
  assert.match(mapped.returnWhy, /profile missing/);
  assert.equal(mapped.controllerMayContinueImplementation, false);
  assert.equal(mapped.ownershipReleased, true);
});

test('runtime executes exact registered conversation handoff and produces no lease token evidence', async () => {
  const currentJob = job();
  const mapped = await executeGovernedChatgptConversationReturn(currentJob, policy, {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => ({
      async deliver(input) {
        assert.equal(input.targetUrl, conversationUrl);
        assert.match(input.message, /Recovery ID: recovery-cbe-003/);
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
  assert.equal(mapped.returnStatus, 'RETURNED');
  assert.equal(mapped.conversationReturned, true);
  assert.equal(JSON.stringify(mapped.evidence).includes(currentJob.lease.leaseToken), false);
  assert.equal(JSON.stringify(mapped.evidence).includes(conversationUrl), false);
});

test('stale fencing epoch remains a failed return and does not construct browser driver', async () => {
  let factoryCalls = 0;
  const mapped = await executeGovernedChatgptConversationReturn(job(), policy, {
    leaseVerifier: async () => ({ valid: false, reason: 'lease_epoch_mismatch' }),
    driverFactory: () => {
      factoryCalls += 1;
      throw new Error('must not construct browser');
    },
  });
  assert.equal(mapped.returnStatus, 'RETURN_FAILED');
  assert.equal(mapped.returnReason, 'lease_epoch_mismatch');
  assert.equal(mapped.conversationReturned, false);
  assert.equal(mapped.controllerMayContinueImplementation, false);
  assert.equal(factoryCalls, 0);
});

test('response not observed is never promoted to a successful return', async () => {
  const mapped = await executeGovernedChatgptConversationReturn(job(), policy, {
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
  assert.equal(mapped.returnStatus, 'RETURN_FAILED');
  assert.equal(mapped.returnReason, 'handoff_verification_failed');
  assert.equal(mapped.conversationReturned, false);
  assert.equal(mapped.retryEligible, true);
});
