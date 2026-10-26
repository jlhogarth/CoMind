import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SENTINEL_COMMENT_MARKER,
  extractCommentMetadata,
  planNotification,
  renderSentinelComment,
} from '../../scripts/lane_health_notify.mjs';

const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function snapshot(overrides = {}) {
  return {
    observedAt: '2026-10-26T01:30:00.000Z',
    prNumber: 193,
    exactHeadSha: head,
    laneSummary: {
      state: 'attention_required',
      severity: 'critical',
      attentionRequired: true,
      alertFingerprint: 'f'.repeat(64),
    },
    escalations: [{
      workflow: 'CI',
      workflowState: 'terminal_failure',
      workflowReason: 'Workflow completed with a deterministic failure.',
      runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/100',
      jobUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/100/job/200',
      stepNumber: 6,
      stepName: 'Run server tests',
      recommendedAction: 'Inspect the failing server test before remediation.',
    }],
    ...overrides,
  };
}

function existingFrom(rendered) {
  return { id: 42, body: rendered };
}

test('first actionable state creates one sentinel comment', () => {
  const plan = planNotification({ snapshot: snapshot(), currentHeadSha: head });
  assert.equal(plan.action, 'create');
  assert.match(plan.body, /CoMind Lane Health Sentinel/);
  assert.match(plan.body, /Run server tests/);
  assert.match(plan.body, /actions\/runs\/100\/job\/200/);
});

test('unchanged fingerprint on the same exact head is a no-op', () => {
  const rendered = renderSentinelComment({ snapshot: snapshot() });
  const plan = planNotification({
    snapshot: snapshot(),
    existingComment: existingFrom(rendered),
    currentHeadSha: head,
  });
  assert.equal(plan.action, 'noop');
  assert.match(plan.reason, /Unchanged alert fingerprint/);
});

test('changed fingerprint updates the existing comment in place', () => {
  const first = renderSentinelComment({ snapshot: snapshot() });
  const changed = snapshot({
    laneSummary: {
      state: 'attention_required',
      severity: 'critical',
      attentionRequired: true,
      alertFingerprint: 'e'.repeat(64),
    },
  });
  const plan = planNotification({
    snapshot: changed,
    existingComment: existingFrom(first),
    currentHeadSha: head,
  });
  assert.equal(plan.action, 'update');
  assert.equal(plan.fingerprint, 'e'.repeat(64));
});

test('stale artifact is rejected before any notification mutation', () => {
  const plan = planNotification({
    snapshot: snapshot(),
    currentHeadSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(plan.action, 'reject_stale');
});

test('healthy exact head with a prior sentinel comment resolves it in place', () => {
  const prior = renderSentinelComment({ snapshot: snapshot() });
  const healthy = snapshot({
    exactHeadSha: head,
    laneSummary: {
      state: 'healthy',
      severity: 'ok',
      attentionRequired: false,
      alertFingerprint: null,
    },
    escalations: [],
  });
  const plan = planNotification({
    snapshot: healthy,
    existingComment: existingFrom(prior),
    currentHeadSha: head,
  });
  assert.equal(plan.action, 'update');
  assert.equal(plan.fingerprint, `resolved:${head}`);
  assert.match(plan.body, /State: `resolved`/);
});

test('healthy lane with no prior comment stays silent', () => {
  const healthy = snapshot({
    laneSummary: {
      state: 'healthy',
      severity: 'ok',
      attentionRequired: false,
      alertFingerprint: null,
    },
    escalations: [],
  });
  const plan = planNotification({ snapshot: healthy, currentHeadSha: head });
  assert.equal(plan.action, 'noop');
});

test('metadata marker round-trips fingerprint and exact head', () => {
  const body = renderSentinelComment({ snapshot: snapshot() });
  assert.ok(body.includes(SENTINEL_COMMENT_MARKER));
  const metadata = extractCommentMetadata(body);
  assert.equal(metadata.fingerprint, 'f'.repeat(64));
  assert.equal(metadata.exactHeadSha, head);
  assert.equal(metadata.state, 'attention_required');
});
