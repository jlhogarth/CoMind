import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecentRuntimeSamples,
  collectLaneHealthSnapshot,
  isBotLogin,
  latestMeaningfulTransitionAt,
  selectGovernedWorkflows,
  selectLatestRunByWorkflow,
  successfulRunDurationSeconds,
} from '../../scripts/lane_health_github.mjs';

const repositoryFullName = 'jlhogarth/CoMind';
const exactHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const policy = Object.freeze({
  schemaVersion: 1,
  defaults: {
    expectedRunAfterSeconds: 75,
    queueStallSeconds: 90,
    runtimeStallMultiplier: 2,
    minimumRuntimeStallSeconds: 120,
    recentSuccessSampleSize: 5,
  },
  workflows: [
    {
      name: 'CI',
      requiredForAllPullRequests: true,
      fallbackNormalSeconds: 420,
      allowTransientRetrigger: true,
    },
    {
      name: 'No Placeholder Policy',
      requiredForAllPullRequests: true,
      fallbackNormalSeconds: 45,
      allowTransientRetrigger: true,
    },
    {
      name: 'Optional Workflow',
      requiredForAllPullRequests: false,
      fallbackNormalSeconds: 60,
      allowTransientRetrigger: false,
    },
  ],
});

function workflowRun(overrides = {}) {
  return {
    id: 101,
    name: 'CI',
    head_sha: exactHeadSha,
    status: 'completed',
    conclusion: 'success',
    event: 'pull_request',
    created_at: '2026-10-25T21:00:10Z',
    run_started_at: '2026-10-25T21:00:20Z',
    updated_at: '2026-10-25T21:01:00Z',
    html_url: 'https://github.com/jlhogarth/CoMind/actions/runs/101',
    actor: { login: 'jlhogarth' },
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: 201,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-10-25T21:00:22Z',
    completed_at: '2026-10-25T21:00:58Z',
    steps: [
      {
        number: 1,
        name: 'Set up job',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-25T21:00:22Z',
        completed_at: '2026-10-25T21:00:25Z',
      },
      {
        number: 6,
        name: 'Run server tests',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-25T21:00:40Z',
        completed_at: '2026-10-25T21:00:55Z',
      },
    ],
    ...overrides,
  };
}

function fakeGitHub({
  headActor = 'jlhogarth',
  currentRuns = [],
  recentRuns = [],
  jobsByRun = new Map(),
  headCommitDate = '2026-10-25T21:00:00Z',
} = {}) {
  return async function getJson(path) {
    if (path === '/repos/jlhogarth/CoMind/pulls/180') {
      return {
        number: 180,
        html_url: 'https://github.com/jlhogarth/CoMind/pull/180',
        created_at: '2026-10-25T20:00:00Z',
        updated_at: '2026-10-25T21:00:00Z',
        head: { sha: exactHeadSha, user: { login: headActor } },
      };
    }
    if (path === `/repos/jlhogarth/CoMind/commits/${exactHeadSha}`) {
      return {
        author: { login: headActor },
        commit: {
          author: { date: headCommitDate },
          committer: { date: headCommitDate },
        },
      };
    }
    if (path.startsWith('/repos/jlhogarth/CoMind/actions/runs?head_sha=')) {
      return { workflow_runs: currentRuns };
    }
    if (path === '/repos/jlhogarth/CoMind/actions/runs?status=success&event=pull_request&per_page=100') {
      return { workflow_runs: recentRuns };
    }
    const jobsMatch = path.match(/^\/repos\/jlhogarth\/CoMind\/actions\/runs\/(\d+)\/jobs\?per_page=100$/);
    if (jobsMatch) return { jobs: jobsByRun.get(Number(jobsMatch[1])) || [] };
    throw new Error(`Unexpected fake GitHub path: ${path}`);
  };
}

test('meaningful transition prefers the latest job or step transition while a run is active', () => {
  const run = workflowRun({
    status: 'in_progress',
    conclusion: null,
    updated_at: '2026-10-25T21:05:00Z',
  });
  const activeJob = job({
    status: 'in_progress',
    conclusion: null,
    completed_at: null,
    steps: [
      {
        number: 1,
        name: 'Set up job',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-25T21:00:22Z',
        completed_at: '2026-10-25T21:00:25Z',
      },
      {
        number: 2,
        name: 'Run tests',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-10-25T21:02:10Z',
        completed_at: null,
      },
    ],
  });

  assert.equal(
    latestMeaningfulTransitionAt({ run, jobs: [activeJob] }),
    '2026-10-25T21:02:10.000Z'
  );
});

test('successful run duration uses run start and terminal update timestamps', () => {
  assert.equal(successfulRunDurationSeconds(workflowRun()), 40);
  assert.equal(successfulRunDurationSeconds(workflowRun({ conclusion: 'failure' })), null);
});

test('only required workflows and optional workflows present on the exact head are governed', () => {
  const selected = selectGovernedWorkflows({
    policy,
    exactHeadRuns: [workflowRun(), workflowRun({ name: 'Optional Workflow', id: 103 })],
  });
  assert.deepEqual(selected.map((item) => item.name), [
    'CI',
    'No Placeholder Policy',
    'Optional Workflow',
  ]);

  const requiredOnly = selectGovernedWorkflows({ policy, exactHeadRuns: [workflowRun()] });
  assert.deepEqual(requiredOnly.map((item) => item.name), ['CI', 'No Placeholder Policy']);
});

test('latest workflow selection ignores stale heads and keeps the newest exact-head run', () => {
  const selected = selectLatestRunByWorkflow([
    workflowRun({ id: 99, head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
    workflowRun({ id: 100, created_at: '2026-10-25T20:59:00Z' }),
    workflowRun({ id: 101, created_at: '2026-10-25T21:00:10Z' }),
  ], exactHeadSha);

  assert.equal(selected.get('CI').id, 101);
});

test('recent successful runtime samples are bounded per workflow', () => {
  const samples = buildRecentRuntimeSamples({
    sampleSize: 2,
    runs: [
      workflowRun({ id: 1, name: 'CI' }),
      workflowRun({ id: 2, name: 'CI', run_started_at: '2026-10-25T21:00:00Z' }),
      workflowRun({ id: 3, name: 'CI', run_started_at: '2026-10-25T20:59:00Z' }),
      workflowRun({ id: 4, name: 'No Placeholder Policy', run_started_at: '2026-10-25T21:00:30Z' }),
    ],
  });

  assert.deepEqual(samples.get('CI'), [40, 60]);
  assert.deepEqual(samples.get('No Placeholder Policy'), [30]);
});

test('live snapshot ingests exact-head jobs and produces direct job evidence', async () => {
  const ciRun = workflowRun();
  const placeholderRun = workflowRun({
    id: 102,
    name: 'No Placeholder Policy',
    created_at: '2026-10-25T21:00:15Z',
    run_started_at: '2026-10-25T21:00:20Z',
    updated_at: '2026-10-25T21:00:50Z',
  });
  const getJson = fakeGitHub({
    currentRuns: [ciRun, placeholderRun],
    recentRuns: [ciRun, placeholderRun],
    jobsByRun: new Map([[101, [job()]], [102, [job({ id: 202, name: 'policy' })]]]),
  });

  const snapshot = await collectLaneHealthSnapshot({
    repositoryFullName,
    prNumber: 180,
    policy,
    getJson,
    now: new Date('2026-10-25T21:02:00Z'),
  });

  assert.equal(snapshot.exactHeadSha, exactHeadSha);
  assert.equal(snapshot.laneSummary.state, 'healthy');
  assert.equal(snapshot.workflowResults.length, 2);
  assert.equal(snapshot.workflowResults[0].jobs[0].jobName, 'build');
  assert.equal(
    snapshot.workflowResults[0].jobs[0].jobUrl,
    'https://github.com/jlhogarth/CoMind/actions/runs/101/job/201'
  );
  assert.deepEqual(snapshot.suppressionSignals, []);
  assert.deepEqual(snapshot.escalations, []);
});

test('stale-head workflow evidence cannot satisfy a required exact-head workflow', async () => {
  const getJson = fakeGitHub({
    currentRuns: [workflowRun({ head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })],
    headCommitDate: '2026-10-25T21:00:00Z',
  });

  const snapshot = await collectLaneHealthSnapshot({
    repositoryFullName,
    prNumber: 180,
    policy,
    getJson,
    now: new Date('2026-10-25T21:02:00Z'),
  });

  assert.equal(snapshot.laneSummary.state, 'attention_required');
  assert.equal(snapshot.workflowResults[0].state, 'expected_run_absent');
  assert.equal(snapshot.workflowResults[1].state, 'expected_run_absent');
});

test('zero-job action_required creates an immediate suppression signal and escalation', async () => {
  const actionRequired = workflowRun({
    status: 'completed',
    conclusion: 'action_required',
    updated_at: '2026-10-25T21:00:30Z',
  });
  const placeholderRun = workflowRun({ id: 102, name: 'No Placeholder Policy' });
  const getJson = fakeGitHub({
    currentRuns: [actionRequired, placeholderRun],
    recentRuns: [placeholderRun],
    jobsByRun: new Map([[101, []], [102, [job({ id: 202 })]]]),
  });

  const snapshot = await collectLaneHealthSnapshot({
    repositoryFullName,
    prNumber: 180,
    policy,
    getJson,
    now: new Date('2026-10-25T21:01:00Z'),
  });

  assert.equal(snapshot.workflowResults[0].state, 'action_required_zero_jobs');
  assert.equal(snapshot.suppressionSignals[0].kind, 'action_required_zero_jobs');
  assert.equal(snapshot.escalations.length, 1);
  assert.equal(snapshot.escalations[0].authorityBoundary, 'observe_only');
});

test('bot-authored head with absent required runs surfaces actor suppression signals', async () => {
  const getJson = fakeGitHub({
    headActor: 'github-actions[bot]',
    currentRuns: [],
    recentRuns: [],
    headCommitDate: '2026-10-25T21:00:00Z',
  });

  const snapshot = await collectLaneHealthSnapshot({
    repositoryFullName,
    prNumber: 180,
    policy,
    getJson,
    now: new Date('2026-10-25T21:02:00Z'),
  });

  assert.equal(isBotLogin('github-actions[bot]'), true);
  assert.equal(snapshot.headIsBot, true);
  assert.deepEqual(
    snapshot.suppressionSignals.map((item) => item.kind),
    ['bot_authored_required_run_absent', 'bot_authored_required_run_absent']
  );
  assert.equal(snapshot.escalations.length, 2);
});
