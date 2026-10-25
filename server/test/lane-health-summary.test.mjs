import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLaneAlertFingerprint,
  summarizeLaneHealth,
} from '../../scripts/lane_health_summary.mjs';

const expectedHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const prUrl = 'https://github.com/jlhogarth/CoMind/pull/180';

function workflow(overrides = {}) {
  return {
    schemaVersion: 1,
    workflow: 'CI',
    expectedHeadSha,
    observedHeadSha: expectedHeadSha,
    runId: 101,
    runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/101',
    normalRuntimeSeconds: 45,
    state: 'healthy_success',
    severity: 'ok',
    reason: 'Workflow completed successfully.',
    ...overrides,
  };
}

test('healthy exact-head workflows produce a healthy lane without an alert', () => {
  const result = summarizeLaneHealth({
    prNumber: 180,
    prUrl,
    expectedHeadSha,
    workflowResults: [
      workflow(),
      workflow({
        workflow: 'No Placeholder Policy',
        runId: 102,
        runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/102',
      }),
    ],
  });

  assert.equal(result.state, 'healthy');
  assert.equal(result.severity, 'ok');
  assert.equal(result.attentionRequired, false);
  assert.equal(result.shouldNotify, false);
  assert.equal(result.alertFingerprint, null);
  assert.deepEqual(result.evidenceUrls, [
    prUrl,
    'https://github.com/jlhogarth/CoMind/actions/runs/101',
    'https://github.com/jlhogarth/CoMind/actions/runs/102',
  ]);
});

test('an in-progress workflow keeps the lane visible without escalating it', () => {
  const result = summarizeLaneHealth({
    prNumber: 180,
    prUrl,
    expectedHeadSha,
    workflowResults: [workflow({ state: 'in_progress', severity: 'info', reason: 'Running.' })],
  });

  assert.equal(result.state, 'in_progress');
  assert.equal(result.severity, 'info');
  assert.equal(result.attentionRequired, false);
  assert.equal(result.shouldNotify, false);
});

test('a critical workflow produces a machine-readable attention-required lane', () => {
  const result = summarizeLaneHealth({
    prNumber: 180,
    prUrl,
    expectedHeadSha,
    workflowResults: [
      workflow(),
      workflow({
        workflow: 'Operator Console CI',
        runId: 113,
        runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/113',
        state: 'action_required_zero_jobs',
        severity: 'critical',
        reason: 'GitHub requires action but created no executable jobs.',
      }),
    ],
  });

  assert.equal(result.state, 'attention_required');
  assert.equal(result.severity, 'critical');
  assert.equal(result.attentionRequired, true);
  assert.equal(result.shouldNotify, true);
  assert.equal(result.attention.length, 1);
  assert.equal(result.attention[0].workflow, 'Operator Console CI');
  assert.match(result.alertFingerprint, /^[a-f0-9]{64}$/);
});

test('unchanged alerts are deduplicated by deterministic fingerprint', () => {
  const workflowResults = [
    workflow({
      state: 'terminal_failure',
      severity: 'critical',
      reason: 'Workflow completed with a deterministic failure.',
    }),
  ];

  const first = summarizeLaneHealth({
    prNumber: 180,
    prUrl,
    expectedHeadSha,
    workflowResults,
  });
  const second = summarizeLaneHealth({
    prNumber: 180,
    prUrl,
    expectedHeadSha,
    workflowResults,
    previousAlertFingerprint: first.alertFingerprint,
  });

  assert.equal(first.shouldNotify, true);
  assert.equal(second.shouldNotify, false);
  assert.equal(second.alertFingerprint, first.alertFingerprint);
});

test('a changed failure state creates a new fingerprint and notification transition', () => {
  const firstAttention = [{
    workflow: 'CI',
    state: 'terminal_failure',
    severity: 'critical',
    runId: 101,
    runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/101',
    reason: 'Workflow completed with a deterministic failure.',
  }];
  const secondAttention = [{
    ...firstAttention[0],
    state: 'timed_out',
    reason: 'Workflow exceeded its execution timeout.',
  }];

  const first = createLaneAlertFingerprint({ expectedHeadSha, attention: firstAttention });
  const second = createLaneAlertFingerprint({ expectedHeadSha, attention: secondAttention });

  assert.notEqual(first, second);
});

test('workflow result from a different head fails closed during lane aggregation', () => {
  assert.throws(
    () => summarizeLaneHealth({
      prNumber: 180,
      prUrl,
      expectedHeadSha,
      workflowResults: [workflow({ expectedHeadSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })],
    }),
    /different head/
  );
});
