import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveEffectiveRunStatus } from '../../scripts/lane_health_github.mjs';

test('active job evidence overrides a lagging queued run status', () => {
  const status = deriveEffectiveRunStatus({
    run: { status: 'queued', conclusion: null },
    jobs: [
      { status: 'in_progress', conclusion: null },
      { status: 'queued', conclusion: null },
    ],
  });

  assert.equal(status, 'in_progress');
});

test('terminal run conclusion remains authoritative over job evidence', () => {
  const status = deriveEffectiveRunStatus({
    run: { status: 'completed', conclusion: 'failure' },
    jobs: [{ status: 'in_progress', conclusion: null }],
  });

  assert.equal(status, 'completed');
});

test('queued jobs keep a nonterminal run queued when none is active', () => {
  const status = deriveEffectiveRunStatus({
    run: { status: 'queued', conclusion: null },
    jobs: [{ status: 'queued', conclusion: null }],
  });

  assert.equal(status, 'queued');
});
