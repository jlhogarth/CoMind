import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEscalationPayload,
  normalizeJobEvidence,
  selectPrimaryJobEvidence,
} from '../../scripts/lane_health_evidence.mjs';

const repositoryFullName = 'jlhogarth/CoMind';
const runId = 40234029706;
const exactHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function laneSummary(overrides = {}) {
  return {
    schemaVersion: 1,
    prNumber: 180,
    prUrl: 'https://github.com/jlhogarth/CoMind/pull/180',
    expectedHeadSha: exactHeadSha,
    state: 'attention_required',
    severity: 'critical',
    alertFingerprint: 'f'.repeat(64),
    ...overrides,
  };
}

function workflowResult(overrides = {}) {
  return {
    schemaVersion: 1,
    workflow: 'CI',
    expectedHeadSha: exactHeadSha,
    observedHeadSha: exactHeadSha,
    runId,
    runUrl: `https://github.com/jlhogarth/CoMind/actions/runs/${runId}`,
    state: 'terminal_failure',
    severity: 'critical',
    reason: 'Workflow completed with a deterministic failure.',
    ...overrides,
  };
}

test('normalizes authoritative job IDs into direct GitHub job evidence', () => {
  const evidence = normalizeJobEvidence({
    repositoryFullName,
    runId,
    jobs: [{
      id: 121291631518,
      name: 'build',
      status: 'completed',
      conclusion: 'failure',
      steps: [
        { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success' },
        { number: 6, name: 'Run server tests', status: 'completed', conclusion: 'failure' },
      ],
    }],
  });

  assert.equal(evidence.length, 1);
  assert.equal(
    evidence[0].jobUrl,
    'https://github.com/jlhogarth/CoMind/actions/runs/40234029706/job/121291631518'
  );
  assert.deepEqual(evidence[0].focalStep, {
    number: 6,
    name: 'Run server tests',
    status: 'completed',
    conclusion: 'failure',
  });
});

test('selects the active step when a job is still progressing', () => {
  const [evidence] = normalizeJobEvidence({
    repositoryFullName,
    runId,
    jobs: [{
      id: 200,
      name: 'devcontainer-runtime',
      status: 'in_progress',
      conclusion: null,
      steps: [
        { number: 5, name: 'Validate compose configuration', status: 'completed', conclusion: 'success' },
        { number: 6, name: 'Build and verify devcontainer runtime', status: 'in_progress', conclusion: null },
      ],
    }],
  });

  assert.equal(evidence.focalStep.number, 6);
  assert.equal(evidence.focalStep.status, 'in_progress');
});

test('primary job evidence prefers terminal failure over queued or successful jobs', () => {
  const evidence = normalizeJobEvidence({
    repositoryFullName,
    runId,
    jobs: [
      { id: 1, name: 'alpha', status: 'completed', conclusion: 'success', steps: [] },
      { id: 2, name: 'beta', status: 'queued', conclusion: null, steps: [] },
      { id: 3, name: 'gamma', status: 'completed', conclusion: 'failure', steps: [] },
    ],
  });

  assert.equal(selectPrimaryJobEvidence(evidence).jobName, 'gamma');
});

test('escalation payload preserves exact evidence and explicit human authority boundary', () => {
  const [primaryJob] = normalizeJobEvidence({
    repositoryFullName,
    runId,
    jobs: [{
      id: 121291631518,
      name: 'build',
      status: 'completed',
      conclusion: 'failure',
      steps: [{ number: 6, name: 'Run server tests', status: 'completed', conclusion: 'failure' }],
    }],
  });

  const payload = buildEscalationPayload({
    laneSummary: laneSummary(),
    workflowResult: workflowResult(),
    primaryJob,
    authorityBoundary: 'observe_only',
    requiresHuman: true,
    recommendedAction: 'Review the failing server test before any rerun or code change.',
  });

  assert.equal(payload.kind, 'lane_health_escalation');
  assert.equal(payload.exactHeadSha, exactHeadSha);
  assert.equal(payload.jobId, 121291631518);
  assert.equal(payload.stepNumber, 6);
  assert.equal(payload.stepName, 'Run server tests');
  assert.equal(payload.authorityBoundary, 'observe_only');
  assert.equal(payload.requiresHuman, true);
  assert.equal(payload.alertFingerprint, 'f'.repeat(64));
});

test('escalation payload fails closed on cross-head evidence', () => {
  assert.throws(
    () => buildEscalationPayload({
      laneSummary: laneSummary(),
      workflowResult: workflowResult({ expectedHeadSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
      recommendedAction: 'Investigate.',
    }),
    /same exact head/
  );
});
