import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBackgroundPullRequests } from '../../scripts/lane_health_background.mjs';

const repositoryFullName = 'jlhogarth/CoMind';

test('pull_request_target resolves only the event PR without an API lookup', async () => {
  const numbers = await resolveBackgroundPullRequests({
    eventName: 'pull_request_target',
    event: {
      pull_request: {
        number: 190,
        head: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    },
    repositoryFullName,
    getJson: async (path) => {
      throw new Error(`No API lookup expected, received ${path}`);
    },
  });

  assert.deepEqual(numbers, [190]);
});

test('pull_request_target fails closed to no targets when event PR number is absent', async () => {
  const numbers = await resolveBackgroundPullRequests({
    eventName: 'pull_request_target',
    event: { pull_request: { head: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } },
    repositoryFullName,
    getJson: async () => {
      throw new Error('No API lookup expected.');
    },
  });

  assert.deepEqual(numbers, []);
});
