import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyWorkflowHealth,
  deriveNormalRuntimeSeconds,
} from '../../scripts/lane_health_sentinel.mjs';

const expectedHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const now = new Date('2026-10-25T21:10:00Z');
const policy = Object.freeze({
  expectedRunAfterSeconds: 75,
  queueStallSeconds: 90,
  runtimeStallMultiplier: 2,
  minimumRuntimeStallSeconds: 120,
  fallbackNormalSeconds: 45,
});

function run(overrides = {}) {
  return {
    id: 113,
    html_url: 'https://github.com/jlhogarth/CoMind/actions/runs/113',
    head_sha: expectedHeadSha,
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-25T21:08:30Z',
    updated_at: '2026-10-25T21:09:15Z',
    ...overrides,
  };
}

function classify(overrides = {}) {
  return classifyWorkflowHealth({
    expectedHeadSha,
    workflowName: 'No Placeholder Policy',
    policy,
    run: run(),
    jobs: [{ id: 1 }],
    recentSuccessfulDurationsSeconds: [41, 44, 45, 46, 49],
    headObservedAt: '2026-10-25T21:08:00Z',
    now,
    ...overrides,
  });
}

test('derives a median recent runtime and falls back when samples are absent', () => {
  assert.equal(deriveNormalRuntimeSeconds([41, 49, 44, 46, 45], 90), 45);
  assert.equal(deriveNormalRuntimeSeconds([40, 60], 90), 50);
  assert.equal(deriveNormalRuntimeSeconds([], 90), 90);
});

test('rejects successful evidence from a stale head', () => {
  const result = classify({
    run: run({ head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
  });

  assert.equal(result.state, 'stale_head_evidence');
  assert.equal(result.severity, 'critical');
  assert.equal(result.expectedHeadSha, expectedHeadSha);
  assert.equal(result.observedHeadSha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
});

test('classifies the PR 113 zero-job action_required regression as an orchestration stall', () => {
  const result = classify({
    run: run({ status: 'completed', conclusion: 'action_required' }),
    jobs: [],
  });

  assert.equal(result.state, 'action_required_zero_jobs');
  assert.equal(result.severity, 'critical');
  assert.equal(result.jobCount, 0);
});

test('classifies an ordinary terminal failure without retrying it', () => {
  const result = classify({
    run: run({ conclusion: 'failure' }),
  });

  assert.equal(result.state, 'terminal_failure');
  assert.equal(result.severity, 'critical');
});

test('detects an expected workflow that never appeared', () => {
  const result = classify({
    run: null,
    jobs: [],
    headObservedAt: '2026-10-25T21:08:00Z',
  });

  assert.equal(result.state, 'expected_run_absent');
  assert.equal(result.ageSeconds, 120);
  assert.equal(result.thresholdSeconds, 75);
});

test('detects a queued workflow that exceeded its queue threshold', () => {
  const result = classify({
    run: run({
      status: 'queued',
      conclusion: null,
      created_at: '2026-10-25T21:08:00Z',
      updated_at: '2026-10-25T21:08:00Z',
    }),
    jobs: [],
  });

  assert.equal(result.state, 'queue_stall');
  assert.equal(result.ageSeconds, 120);
  assert.equal(result.thresholdSeconds, 90);
});

test('uses measured runtime history to detect an in-progress stall', () => {
  const result = classify({
    run: run({
      status: 'in_progress',
      conclusion: null,
      created_at: '2026-10-25T21:06:00Z',
      updated_at: '2026-10-25T21:07:30Z',
    }),
    lastMeaningfulTransitionAt: '2026-10-25T21:07:30Z',
  });

  assert.equal(result.normalRuntimeSeconds, 45);
  assert.equal(result.thresholdSeconds, 120);
  assert.equal(result.unchangedSeconds, 150);
  assert.equal(result.state, 'runtime_stall');
});

test('keeps an actively progressing workflow in progress', () => {
  const result = classify({
    run: run({
      status: 'in_progress',
      conclusion: null,
      created_at: '2026-10-25T21:08:00Z',
      updated_at: '2026-10-25T21:09:30Z',
    }),
    lastMeaningfulTransitionAt: '2026-10-25T21:09:30Z',
  });

  assert.equal(result.state, 'in_progress');
  assert.equal(result.unchangedSeconds, 30);
});

test('reports healthy exact-head completion with direct evidence fields', () => {
  const result = classify();

  assert.equal(result.state, 'healthy_success');
  assert.equal(result.severity, 'ok');
  assert.equal(result.runId, 113);
  assert.equal(result.runUrl, 'https://github.com/jlhogarth/CoMind/actions/runs/113');
  assert.equal(result.observedHeadSha, expectedHeadSha);
});
