import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enrichBackgroundBundleWithStructuredSignals,
  validateStructuredTransientSignal,
} from '../../scripts/lane_health_transient_signal.mjs';

const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function context(overrides = {}) {
  return {
    runId: 100,
    exactHeadSha: head,
    workflow: 'Lane Health Sentinel Retry Proof',
    ...overrides,
  };
}

function workflowRun(overrides = {}) {
  return {
    id: 100,
    name: 'Lane Health Sentinel Retry Proof',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'failure',
    head_sha: head,
    run_attempt: 1,
    ...overrides,
  };
}

function signal(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'comind_transient_retry_signal',
    producer: 'comind_transient_wrapper_v1',
    retrySafe: true,
    classification: 'resource_timeout',
    exitCode: 124,
    runId: 100,
    runAttempt: 1,
    headSha: head,
    workflow: 'Lane Health Sentinel Retry Proof',
    event: 'pull_request',
    step: 'Execute controlled retry fixture',
    ...overrides,
  };
}

function backgroundBundle() {
  return {
    schemaVersion: 1,
    kind: 'github_lane_health_background_bundle',
    repository: 'jlhogarth/CoMind',
    snapshots: [{
      prNumber: 207,
      exactHeadSha: head,
      workflowResults: [{
        workflow: 'Lane Health Sentinel Retry Proof',
        state: 'terminal_failure',
        severity: 'critical',
        reason: 'Workflow failed.',
        observedHeadSha: head,
        runId: 100,
        runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/100',
        runEvent: 'pull_request',
        allowTransientRetrigger: true,
      }],
    }],
  };
}

test('exact reviewed resource timeout signal is accepted', () => {
  const review = validateStructuredTransientSignal({
    signal: signal(),
    context: context(),
    workflowRun: workflowRun(),
  });

  assert.equal(review.accepted, true);
  assert.equal(review.signal.validated, true);
  assert.equal(review.signal.classification, 'resource_timeout');
  assert.equal(review.signal.exitCode, 124);
});

test('unknown transient class and unreviewed exit code fail closed', () => {
  const unknown = validateStructuredTransientSignal({
    signal: signal({ classification: 'network_flake', exitCode: 75 }),
    context: context(),
    workflowRun: workflowRun(),
  });
  assert.equal(unknown.accepted, false);
  assert.match(unknown.reason, /not reviewed as retry-safe/);

  const wrongExit = validateStructuredTransientSignal({
    signal: signal({ exitCode: 137 }),
    context: context(),
    workflowRun: workflowRun(),
  });
  assert.equal(wrongExit.accepted, false);
  assert.match(wrongExit.reason, /not reviewed/);
});

test('run, attempt, head, workflow, or event mismatch rejects the signal', () => {
  const cases = [
    signal({ runId: 101 }),
    signal({ runAttempt: 2 }),
    signal({ headSha: 'b'.repeat(40) }),
    signal({ workflow: 'CI' }),
    signal({ event: 'workflow_dispatch' }),
  ];

  for (const candidateSignal of cases) {
    const review = validateStructuredTransientSignal({
      signal: candidateSignal,
      context: context(),
      workflowRun: workflowRun(),
    });
    assert.equal(review.accepted, false);
  }
});

test('trusted enrichment upgrades only an exact validated generic failure', async () => {
  const enriched = await enrichBackgroundBundleWithStructuredSignals({
    bundle: backgroundBundle(),
    repositoryFullName: 'jlhogarth/CoMind',
    getJson: async (path) => {
      assert.match(path, /actions\/runs\/100$/);
      return workflowRun();
    },
    loadSignal: async ({ runId, runAttempt }) => {
      assert.equal(runId, 100);
      assert.equal(runAttempt, 1);
      return {
        signal: signal(),
        artifact: { id: 500, name: 'lane-health-transient-signal-attempt-1' },
      };
    },
  });

  const result = enriched.snapshots[0].workflowResults[0];
  assert.equal(result.originalState, 'terminal_failure');
  assert.equal(result.state, 'structured_transient_failure');
  assert.equal(result.structuredTransientSignal.validated, true);
  assert.equal(result.structuredTransientSignal.artifactId, 500);
  assert.equal(enriched.structuredTransientReview.acceptedCount, 1);
  assert.equal(enriched.structuredTransientReview.rejectedCount, 0);
});

test('missing or rejected signal remains an ordinary deterministic failure', async () => {
  const missing = await enrichBackgroundBundleWithStructuredSignals({
    bundle: backgroundBundle(),
    repositoryFullName: 'jlhogarth/CoMind',
    getJson: async () => workflowRun(),
    loadSignal: async () => null,
  });
  assert.equal(missing.snapshots[0].workflowResults[0].state, 'terminal_failure');
  assert.equal(missing.structuredTransientReview.acceptedCount, 0);

  const rejected = await enrichBackgroundBundleWithStructuredSignals({
    bundle: backgroundBundle(),
    repositoryFullName: 'jlhogarth/CoMind',
    getJson: async () => workflowRun(),
    loadSignal: async () => ({
      signal: signal({ exitCode: 1 }),
      artifact: { id: 501, name: 'lane-health-transient-signal-attempt-1' },
    }),
  });
  assert.equal(rejected.snapshots[0].workflowResults[0].state, 'terminal_failure');
  assert.equal(rejected.structuredTransientReview.acceptedCount, 0);
  assert.equal(rejected.structuredTransientReview.rejectedCount, 1);
});
