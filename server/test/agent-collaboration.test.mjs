import assert from 'node:assert/strict';
import test from 'node:test';

const { COLLABORATION_ROLES, runMdoCollaboration } = await import('../dist/agent-collaboration.js');
const { MDO_ROLE_CAPABILITIES } = await import('../dist/mdo-orchestrator.js');

const planId = '11111111-1111-4111-8111-111111111111';
const assignments = COLLABORATION_ROLES.map((role, index) => ({
  role,
  profileId: `profile-${index}`,
  workerInstanceId: `worker-${index}`,
}));

function fixture({ corruptAt = -1, failAt = -1 } = {}) {
  let next = 0;
  const calls = [];
  const releases = [];
  const dependencies = {
    mdo: {
      async claimWork({ profileId }) {
        const index = next++;
        assert.equal(profileId, assignments[index].profileId);
        return {
          taskId: `task-${index}`,
          planId,
          capabilityCode: MDO_ROLE_CAPABILITIES[assignments[index].role],
          leaseToken: `lease-${index}`,
          fencingEpoch: 1,
          leaseExpiresAt: '2099-01-01T00:00:00Z',
        };
      },
      async loadTaskContext(taskId) {
        const index = Number(taskId.split('-')[1]);
        return {
          taskId,
          planId,
          roleCode: assignments[index].role,
          sequenceNo: index + 1,
          requiredCapabilityCode: MDO_ROLE_CAPABILITIES[assignments[index].role],
          priorContributions: Array.from({ length: index }, (_, prior) => ({
            evidence_ids: prior === corruptAt ? [] : [`evidence-${prior}`],
          })),
        };
      },
    },
    worker: {
      async executeClaim(input) {
        calls.push(input);
        const index = Number(input.claim.taskId.split('-')[1]);
        if (index === failAt) throw new Error('provider failed; worker owns release');
        return {
          taskId: input.claim.taskId,
          planId,
          contributionId: `contribution-${index}`,
          evidenceId: `evidence-${index}`,
          execution: { executionContextId: `execution-${index}`, terminalStatus: 'succeeded' },
          provider: 'ollama_local',
          model: 'qwen3:0.6b',
        };
      },
    },
    async authorizeClaim(claim) {
      return `decision-${claim.taskId.split('-')[1]}`;
    },
    async releaseMismatchedClaim(claim, workerInstanceId) {
      releases.push({ claim, workerInstanceId });
    },
  };
  return { dependencies, calls, releases };
}

test('ten specialists hand off only after evidence-backed predecessor completion', async () => {
  const { dependencies, calls, releases } = fixture();
  const outcome = await runMdoCollaboration(dependencies, planId, assignments, 'collaboration-test');
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.receipts.length, 10);
  assert.deepEqual(outcome.receipts.map((receipt) => receipt.role), COLLABORATION_ROLES);
  assert.deepEqual(calls.map((call) => call.authorizationDecisionId), Array.from({ length: 10 }, (_, i) => `decision-${i}`));
  assert.deepEqual(calls.map((call) => call.idempotencyKey), Array.from({ length: 10 }, (_, i) => `collaboration-test:${i + 1}`));
  assert.equal(releases.length, 0);
});

test('missing predecessor evidence blocks the next specialist and releases its lease', async () => {
  const { dependencies, calls, releases } = fixture({ corruptAt: 1 });
  const outcome = await runMdoCollaboration(dependencies, planId, assignments, 'missing-evidence');
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.blockedRole, 'external_capability_scout');
  assert.equal(outcome.receipts.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(releases.length, 1);
  assert.equal(releases[0].claim.taskId, 'task-2');
});

test('worker failure stops downstream work without double releasing a worker-owned lease', async () => {
  const { dependencies, calls, releases } = fixture({ failAt: 3 });
  const outcome = await runMdoCollaboration(dependencies, planId, assignments, 'provider-failure');
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.receipts.length, 3);
  assert.equal(calls.length, 4);
  assert.equal(releases.length, 0);
});

test('invalid role order refuses execution before claiming any work', async () => {
  const { dependencies, calls } = fixture();
  await assert.rejects(
    runMdoCollaboration(dependencies, planId, assignments.toReversed(), 'bad-order'),
    { code: 'invalid_assignments' }
  );
  assert.equal(calls.length, 0);
});
