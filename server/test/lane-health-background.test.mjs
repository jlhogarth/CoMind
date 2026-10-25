import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectBackgroundBundle,
  resolveBackgroundPullRequests,
} from '../../scripts/lane_health_background.mjs';

const repositoryFullName = 'jlhogarth/CoMind';

function getJsonForRoutes(routes) {
  return async function getJson(path) {
    if (!(path in routes)) throw new Error(`Unexpected fake route: ${path}`);
    return routes[path];
  };
}

test('workflow_run uses directly associated PR numbers without an extra lookup', async () => {
  const getJson = async (path) => {
    throw new Error(`No lookup expected, received ${path}`);
  };

  const numbers = await resolveBackgroundPullRequests({
    eventName: 'workflow_run',
    event: {
      workflow_run: {
        event: 'pull_request',
        pull_requests: [{ number: 180 }, { number: 180 }],
      },
    },
    repositoryFullName,
    getJson,
  });

  assert.deepEqual(numbers, [180]);
});

test('workflow_run falls back to commit-associated open PRs when direct association is absent', async () => {
  const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const getJson = getJsonForRoutes({
    [`/repos/jlhogarth/CoMind/commits/${sha}/pulls`]: [
      { number: 180, state: 'open' },
      { number: 179, state: 'closed' },
    ],
  });

  const numbers = await resolveBackgroundPullRequests({
    eventName: 'workflow_run',
    event: {
      workflow_run: {
        event: 'pull_request',
        head_sha: sha,
        pull_requests: [],
      },
    },
    repositoryFullName,
    getJson,
  });

  assert.deepEqual(numbers, [180]);
});

test('non-PR workflow_run events do not create a lane target', async () => {
  const numbers = await resolveBackgroundPullRequests({
    eventName: 'workflow_run',
    event: {
      workflow_run: {
        event: 'push',
        head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pull_requests: [],
      },
    },
    repositoryFullName,
    getJson: async () => {
      throw new Error('No lookup expected.');
    },
  });

  assert.deepEqual(numbers, []);
});

test('scheduled fallback scans all open PRs against main', async () => {
  const getJson = getJsonForRoutes({
    '/repos/jlhogarth/CoMind/pulls?state=open&base=main&per_page=100': [
      { number: 180 },
      { number: 149 },
    ],
  });

  const numbers = await resolveBackgroundPullRequests({
    eventName: 'schedule',
    event: {},
    repositoryFullName,
    getJson,
  });

  assert.deepEqual(numbers, [180, 149]);
});

test('manual target PR overrides scheduled discovery', async () => {
  const numbers = await resolveBackgroundPullRequests({
    eventName: 'workflow_dispatch',
    event: {},
    repositoryFullName,
    targetPrNumber: 180,
    getJson: async () => {
      throw new Error('No lookup expected.');
    },
  });

  assert.deepEqual(numbers, [180]);
});

test('background bundle records an empty non-PR trigger without inventing attention', async () => {
  const bundle = await collectBackgroundBundle({
    eventName: 'workflow_run',
    event: {
      workflow_run: {
        id: 123,
        name: 'CI',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pull_requests: [],
      },
    },
    repositoryFullName,
    policy: { defaults: {}, workflows: [] },
    getJson: async () => {
      throw new Error('No lookup expected.');
    },
    now: new Date('2026-10-25T22:00:00Z'),
  });

  assert.deepEqual(bundle.prNumbers, []);
  assert.deepEqual(bundle.snapshots, []);
  assert.equal(bundle.attentionRequired, false);
  assert.equal(bundle.active, false);
  assert.equal(bundle.trigger.workflowRunId, 123);
  assert.equal(bundle.authorityBoundary, 'observe_only');
});
