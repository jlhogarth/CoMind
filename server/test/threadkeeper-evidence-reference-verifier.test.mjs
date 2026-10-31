import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadEvidenceBindings,
  verifyGitHubRunReferences,
} from '../../scripts/governed_evidence_verifier.mjs';
import {
  loadThreadKeeperC2Matrix,
  validateThreadKeeperC2Matrix,
} from '../../scripts/threadkeeper_c2_matrix.mjs';
import { loadThreadKeeperC3Matrix } from '../../scripts/threadkeeper_c3_matrix.mjs';
import { loadThreadKeeperC4Matrix } from '../../scripts/threadkeeper_c4_matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function bindingFetch({ mutate = () => {} } = {}) {
  const bindings = loadEvidenceBindings(repoRoot);
  const byRun = new Map();
  for (const lane of Object.values(bindings.lanes)) {
    for (const [runId, binding] of Object.entries(lane.githubRuns ?? {})) {
      byRun.set(Number(runId), binding);
    }
  }
  return async (url) => {
    const runId = Number(String(url).split('/').pop());
    const binding = byRun.get(runId);
    if (!binding) return response(404, { message: 'Not Found' });
    const run = {
      id: runId,
      repository: { full_name: bindings.repository },
      status: 'completed',
      conclusion: binding.conclusion,
      head_sha: binding.expectedHeadSha,
      path: binding.workflowPath,
      event: binding.event,
    };
    mutate(run, runId, binding);
    return response(200, run);
  };
}

for (const [name, loadMatrix] of [
  ['C2', loadThreadKeeperC2Matrix],
  ['C3', loadThreadKeeperC3Matrix],
  ['C4', loadThreadKeeperC4Matrix],
]) {
  test(`${name} live external evidence accepts only exact governed run facts`, async () => {
    const errors = await verifyGitHubRunReferences(loadMatrix(), {
      repoRoot,
      token: 'unit-test-token',
      fetchImpl: bindingFetch(),
    });
    assert.deepEqual(errors, []);
  });
}

test('a fabricated positive GitHub run ID cannot become evidence by syntax alone', () => {
  const matrix = structuredClone(loadThreadKeeperC2Matrix());
  const run = matrix.gateRequirements.find((item) => item.id === 'C2-03').evidence
    .find((item) => item.type === 'github_run');
  run.runId = 99999999999;
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes('has no governed external binding')), errors.join('\n'));
});

test('a fabricated nonempty CDE key cannot become evidence by syntax alone', () => {
  const matrix = structuredClone(loadThreadKeeperC2Matrix());
  const cde = matrix.gateRequirements.find((item) => item.id === 'C2-16').evidence
    .find((item) => item.type === 'cde_key');
  cde.key = 'JRN-FAKE-BUT-NONEMPTY';
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes('has no governed CDE binding')), errors.join('\n'));
});

test('a bound GitHub run that cannot be retrieved fails closed', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC2Matrix(), {
    repoRoot,
    token: 'unit-test-token',
    fetchImpl: async () => response(404, { message: 'Not Found' }),
  });
  assert.ok(errors.some((message) => message.includes('could not be verified')), errors.join('\n'));
});

test('wrong head SHA cannot satisfy governed GitHub evidence', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC2Matrix(), {
    repoRoot,
    token: 'unit-test-token',
    fetchImpl: bindingFetch({
      mutate(run, runId) {
        if (runId === 40436467686) run.head_sha = '0'.repeat(40);
      },
    }),
  });
  assert.ok(errors.some((message) => message.includes('head SHA mismatch')), errors.join('\n'));
});

test('failed or cancelled run cannot satisfy governed GitHub evidence', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC3Matrix(), {
    repoRoot,
    token: 'unit-test-token',
    fetchImpl: bindingFetch({
      mutate(run, runId) {
        if (runId === 40562386747) run.conclusion = 'failure';
      },
    }),
  });
  assert.ok(errors.some((message) => message.includes('conclusion mismatch')), errors.join('\n'));
});

test('wrong workflow and event cannot satisfy governed GitHub evidence', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC3Matrix(), {
    repoRoot,
    token: 'unit-test-token',
    fetchImpl: bindingFetch({
      mutate(run, runId) {
        if (runId === 40562386747) {
          run.path = '.github/workflows/ci.yml';
          run.event = 'push';
        }
      },
    }),
  });
  assert.ok(errors.some((message) => message.includes('workflow mismatch')), errors.join('\n'));
  assert.ok(errors.some((message) => message.includes('event mismatch')), errors.join('\n'));
});

test('C4 retained live run cannot satisfy evidence if its exact workflow fact changes', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC4Matrix(), {
    repoRoot,
    token: 'unit-test-token',
    fetchImpl: bindingFetch({
      mutate(run, runId) {
        if (runId === 40594328128) run.path = '.github/workflows/ci.yml';
      },
    }),
  });
  assert.ok(errors.some((message) => message.includes('workflow mismatch')), errors.join('\n'));
});

test('live GitHub verification refuses to run without explicit read token', async () => {
  const errors = await verifyGitHubRunReferences(loadThreadKeeperC2Matrix(), {
    repoRoot,
    token: '',
    fetchImpl: bindingFetch(),
  });
  assert.deepEqual(errors, ['GitHub evidence verification requires GITHUB_TOKEN']);
});
