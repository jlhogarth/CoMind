import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySentinelNotifications,
  parseSentinelMarker,
  planSentinelNotification,
  renderSentinelComment,
} from '../../scripts/lane_health_notify.mjs';

const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function attentionSnapshot(overrides = {}) {
  return {
    prNumber: 191,
    prUrl: 'https://github.com/jlhogarth/CoMind/pull/191',
    exactHeadSha: head,
    laneSummary: {
      state: 'attention_required',
      severity: 'critical',
      attentionRequired: true,
      alertFingerprint: 'f'.repeat(64),
    },
    escalations: [{
      workflow: 'No Placeholder Policy',
      workflowState: 'terminal_failure',
      workflowReason: 'Workflow completed with a deterministic failure.',
      runUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/1',
      jobUrl: 'https://github.com/jlhogarth/CoMind/actions/runs/1/job/2',
      stepNumber: 4,
      stepName: 'Enforce no-placeholder policy',
      stepConclusion: 'failure',
    }],
    ...overrides,
  };
}

function healthySnapshot(overrides = {}) {
  return {
    prNumber: 191,
    prUrl: 'https://github.com/jlhogarth/CoMind/pull/191',
    exactHeadSha: head,
    laneSummary: {
      state: 'healthy',
      severity: 'ok',
      attentionRequired: false,
      alertFingerprint: null,
    },
    escalations: [],
    ...overrides,
  };
}

test('attention snapshot renders direct evidence and a stable hidden marker', () => {
  const rendered = renderSentinelComment(attentionSnapshot());
  assert.equal(rendered.state, 'attention_required');
  assert.equal(rendered.fingerprint, 'f'.repeat(64));
  assert.match(rendered.body, /No Placeholder Policy/);
  assert.match(rendered.body, /actions\/runs\/1\/job\/2/);
  assert.deepEqual(parseSentinelMarker(rendered.body), {
    state: 'attention_required',
    fingerprint: 'f'.repeat(64),
  });
});

test('new attention creates the single sentinel comment', () => {
  const plan = planSentinelNotification({ snapshot: attentionSnapshot(), comments: [] });
  assert.equal(plan.action, 'create');
  assert.equal(plan.reason, 'new_attention_transition');
});

test('unchanged attention fingerprint is a no-op', () => {
  const rendered = renderSentinelComment(attentionSnapshot());
  const plan = planSentinelNotification({
    snapshot: attentionSnapshot(),
    comments: [{ id: 7, body: rendered.body }],
  });
  assert.equal(plan.action, 'noop');
  assert.equal(plan.reason, 'unchanged_fingerprint');
  assert.equal(plan.commentId, 7);
});

test('changed attention fingerprint updates the existing comment', () => {
  const old = renderSentinelComment(attentionSnapshot({
    laneSummary: {
      state: 'attention_required',
      severity: 'critical',
      attentionRequired: true,
      alertFingerprint: 'a'.repeat(64),
    },
  }));
  const plan = planSentinelNotification({
    snapshot: attentionSnapshot(),
    comments: [{ id: 8, body: old.body }],
  });
  assert.equal(plan.action, 'update');
  assert.equal(plan.reason, 'attention_transition');
  assert.equal(plan.commentId, 8);
});

test('healthy lane without a prior sentinel comment stays silent', () => {
  const plan = planSentinelNotification({ snapshot: healthySnapshot(), comments: [] });
  assert.equal(plan.action, 'noop');
  assert.equal(plan.reason, 'healthy_without_prior_alert');
});

test('healthy recovery updates the existing alert comment rather than creating another', () => {
  const prior = renderSentinelComment(attentionSnapshot());
  const plan = planSentinelNotification({
    snapshot: healthySnapshot(),
    comments: [{ id: 9, body: prior.body }],
  });
  assert.equal(plan.action, 'update');
  assert.equal(plan.reason, 'recovery_transition');
  assert.equal(plan.commentId, 9);
  assert.match(plan.body, /Status: Resolved/);
});

test('apply fails closed on stale snapshot head before reading comments or writing', async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/repos/jlhogarth/CoMind/pulls/191') {
      return { state: 'open', head: { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } };
    }
    throw new Error(`Unexpected request ${path}`);
  };

  const result = await applySentinelNotifications({
    repositoryFullName: 'jlhogarth/CoMind',
    bundle: { observedAt: '2026-10-25T22:00:00Z', snapshots: [attentionSnapshot()] },
    request,
  });

  assert.equal(result.decisions[0].action, 'noop');
  assert.equal(result.decisions[0].reason, 'stale_snapshot_head');
  assert.equal(calls.length, 1);
});

test('apply creates one comment for current-head attention', async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/repos/jlhogarth/CoMind/pulls/191') {
      return { state: 'open', head: { sha: head } };
    }
    if (path === '/repos/jlhogarth/CoMind/issues/191/comments?per_page=100&page=1') {
      return [];
    }
    if (path === '/repos/jlhogarth/CoMind/issues/191/comments' && options.method === 'POST') {
      return { id: 42, body: options.body.body };
    }
    throw new Error(`Unexpected request ${options.method || 'GET'} ${path}`);
  };

  const result = await applySentinelNotifications({
    repositoryFullName: 'jlhogarth/CoMind',
    bundle: { observedAt: '2026-10-25T22:00:00Z', snapshots: [attentionSnapshot()] },
    request,
  });

  assert.equal(result.authorityBoundary, 'notification_only');
  assert.deepEqual(result.decisions[0], {
    prNumber: 191,
    action: 'create',
    reason: 'new_attention_transition',
    commentId: 42,
    fingerprint: 'f'.repeat(64),
    state: 'attention_required',
  });
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
});
