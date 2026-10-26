import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeRetryFromBundle,
  findRetryCandidates,
  planRetryAgainstCurrentEvidence,
} from '../../scripts/lane_health_retry.mjs';

const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function workflowResult(overrides = {}) {
  return {
    workflow: 'CI',
    state: 'timed_out',
    severity: 'critical',
    reason: 'Workflow exceeded its execution timeout.',
    observedHeadSha: head,
    runId: 100,
    runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/100',
    runEvent: 'pull_request',
    allowTransientRetrigger: true,
    ...overrides,
  };
}

function bundle(results = [workflowResult()]) {
  return {
    schemaVersion: 1,
    repository: 'jlhogarth/CoMind',
    snapshots: [{
      prNumber: 194,
      exactHeadSha: head,
      workflowResults: results,
    }],
  };
}

function currentRun(overrides = {}) {
  return {
    id: 100,
    name: 'CI',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'timed_out',
    head_sha: head,
    run_attempt: 1,
    ...overrides,
  };
}

const pull = {
  state: 'open',
  head: { sha: head },
};

test('timed_out and startup_failure are the only initial retry-safe transient states', () => {
  const candidates = findRetryCandidates({
    bundle: bundle([
      workflowResult({ workflow: 'CI', runId: 100, state: 'timed_out' }),
      workflowResult({ workflow: 'Repository Config', runId: 101, state: 'terminal_startup_failure' }),
      workflowResult({ workflow: 'Tests', runId: 102, state: 'terminal_failure' }),
      workflowResult({ workflow: 'Cancelled', runId: 103, state: 'cancelled' }),
      workflowResult({ workflow: 'Action', runId: 104, state: 'action_required' }),
    ]),
    maxAutoRetriggers: 1,
  });
  assert.deepEqual(candidates.map((candidate) => candidate.runId), [100, 101]);
  assert.deepEqual(candidates.map((candidate) => candidate.transientConclusion), ['timed_out', 'startup_failure']);
});

test('policy opt-out, stale-head evidence, and non-PR executions are never candidates', () => {
  const candidates = findRetryCandidates({
    bundle: bundle([
      workflowResult({ runId: 100, allowTransientRetrigger: false }),
      workflowResult({ runId: 101, observedHeadSha: 'b'.repeat(40) }),
      workflowResult({ runId: 102, runEvent: 'workflow_dispatch' }),
    ]),
    maxAutoRetriggers: 1,
  });
  assert.deepEqual(candidates, []);
});

test('retry ceiling other than exactly one fails closed', () => {
  assert.throws(
    () => findRetryCandidates({ bundle: bundle(), maxAutoRetriggers: 2 }),
    /exactly one/
  );
});

test('attempt one exact-head timeout is eligible for one rerun', () => {
  const candidate = findRetryCandidates({ bundle: bundle(), maxAutoRetriggers: 1 })[0];
  const plan = planRetryAgainstCurrentEvidence({
    candidate,
    pullRequest: pull,
    workflowRun: currentRun(),
    maxAutoRetriggers: 1,
  });
  assert.equal(plan.action, 'rerun');
  assert.equal(plan.runAttempt, 1);
  assert.equal(plan.retryAttempt, 2);
});

test('attempt two cannot be automatically retriggered again', () => {
  const candidate = findRetryCandidates({ bundle: bundle(), maxAutoRetriggers: 1 })[0];
  const plan = planRetryAgainstCurrentEvidence({
    candidate,
    pullRequest: pull,
    workflowRun: currentRun({ run_attempt: 2 }),
    maxAutoRetriggers: 1,
  });
  assert.equal(plan.action, 'noop');
  assert.match(plan.reason, /ceiling already consumed/);
});

test('head movement or changed conclusion blocks retry before mutation', () => {
  const candidate = findRetryCandidates({ bundle: bundle(), maxAutoRetriggers: 1 })[0];
  const stale = planRetryAgainstCurrentEvidence({
    candidate,
    pullRequest: { state: 'open', head: { sha: 'b'.repeat(40) } },
    workflowRun: currentRun(),
    maxAutoRetriggers: 1,
  });
  assert.equal(stale.action, 'reject_stale');

  const changed = planRetryAgainstCurrentEvidence({
    candidate,
    pullRequest: pull,
    workflowRun: currentRun({ conclusion: 'failure' }),
    maxAutoRetriggers: 1,
  });
  assert.equal(changed.action, 'noop');
});

test('executor issues one rerun POST and records machine-readable retry evidence', async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET' });
    if (path.endsWith('/pulls/194')) return { status: 200, data: pull };
    if (path.endsWith('/actions/runs/100') && (options.method || 'GET') === 'GET') {
      return { status: 200, data: currentRun() };
    }
    if (path.endsWith('/actions/runs/100/rerun') && options.method === 'POST') {
      return { status: 201, data: null };
    }
    throw new Error(`Unexpected request ${options.method || 'GET'} ${path}`);
  };

  const result = await executeRetryFromBundle({
    bundle: bundle(),
    policy: { defaults: { maxAutoRetriggers: 1 } },
    repositoryFullName: 'jlhogarth/CoMind',
    request,
    now: new Date('2026-10-26T02:00:00.000Z'),
  });

  assert.equal(result.rerunRequested, true);
  assert.equal(result.outcomes[0].action, 'rerun_requested');
  assert.equal(result.outcomes[0].originalAttempt, 1);
  assert.equal(result.outcomes[0].retryAttempt, 2);
  assert.equal(result.outcomes[0].retryCount, 1);
  assert.match(result.outcomes[0].retryAttemptUrl, /actions\/runs\/100\/attempts\/2$/);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('executor serializes multiple eligible candidates into at most one rerun request', async () => {
  const two = bundle([
    workflowResult({ workflow: 'CI', runId: 100 }),
    workflowResult({ workflow: 'No Placeholder Policy', runId: 101 }),
  ]);
  const posts = [];
  const request = async (path, options = {}) => {
    const method = options.method || 'GET';
    if (path.endsWith('/pulls/194')) return { status: 200, data: pull };
    if (path.endsWith('/actions/runs/100') && method === 'GET') return { status: 200, data: currentRun() };
    if (path.endsWith('/actions/runs/100/rerun') && method === 'POST') {
      posts.push(path);
      return { status: 201, data: null };
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  };

  const result = await executeRetryFromBundle({
    bundle: two,
    policy: { defaults: { maxAutoRetriggers: 1 } },
    repositoryFullName: 'jlhogarth/CoMind',
    request,
  });
  assert.equal(posts.length, 1);
  assert.equal(result.outcomes[0].action, 'rerun_requested');
  assert.equal(result.outcomes[1].action, 'noop');
  assert.match(result.outcomes[1].reason, /prior candidate already consumed/);
});

test('deterministic failure fixture produces zero API writes', async () => {
  let requests = 0;
  const result = await executeRetryFromBundle({
    bundle: bundle([workflowResult({ state: 'terminal_failure' })]),
    policy: { defaults: { maxAutoRetriggers: 1 } },
    repositoryFullName: 'jlhogarth/CoMind',
    request: async () => {
      requests += 1;
      throw new Error('request should not be called');
    },
  });
  assert.equal(result.rerunRequested, false);
  assert.equal(result.candidateCount, 0);
  assert.equal(requests, 0);
});
