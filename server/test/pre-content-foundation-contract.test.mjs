import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadMatrix,
  matrixSummary,
  validateMatrix,
} from '../../scripts/pfc_matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return structuredClone(value);
}

function firstProven(matrix) {
  for (const domain of matrix.domains) {
    const scenario = domain.scenarios.find((candidate) => candidate.status === 'proven');
    if (scenario) return scenario;
  }
  throw new Error('fixture requires at least one proven scenario');
}

test('canonical PFC matrix validates and covers domains A-I', () => {
  const matrix = loadMatrix();
  const errors = validateMatrix(matrix, { repoRoot });
  assert.deepEqual(errors, []);

  assert.deepEqual(
    matrix.domains.map((domain) => domain.id),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  );

  const summary = matrixSummary(matrix);
  assert.equal(summary.scenarioCount, 44);
  assert.equal(summary.statuses.proven, 23);
  assert.equal(summary.statuses.partial, 10);
  assert.equal(summary.statuses.missing, 10);
  assert.equal(summary.statuses.deferred_content, 1);
});

test('proven claims fail without repository evidence', () => {
  const matrix = clone(loadMatrix());
  const scenario = firstProven(matrix);
  delete scenario.evidence;

  const errors = validateMatrix(matrix, { repoRoot });
  assert.ok(
    errors.some((message) => message.includes(`${scenario.id}: proven scenarios require`)),
    errors.join('\n'),
  );
});

test('nonexistent repository evidence fails validation', () => {
  const matrix = clone(loadMatrix());
  const scenario = firstProven(matrix);
  scenario.evidence = [{
    type: 'repo_path',
    path: 'definitely/not/a/real/pfc-proof.file',
  }];

  const errors = validateMatrix(matrix, { repoRoot });
  assert.ok(
    errors.some((message) => message.includes('evidence path does not exist')),
    errors.join('\n'),
  );
});

test('deferred content claims require an explicit rationale', () => {
  const matrix = clone(loadMatrix());
  const scenario = matrix.domains
    .flatMap((domain) => domain.scenarios)
    .find((candidate) => candidate.status === 'deferred_content');
  assert.ok(scenario, 'fixture requires deferred_content scenario');
  delete scenario.rationale;

  const errors = validateMatrix(matrix, { repoRoot });
  assert.ok(
    errors.some((message) => message.includes(`${scenario.id}: deferred_content requires rationale`)),
    errors.join('\n'),
  );
});

test('matrix evidence paths are repository-relative files', () => {
  const matrix = loadMatrix();
  for (const scenario of matrix.domains.flatMap((domain) => domain.scenarios)) {
    for (const evidence of scenario.evidence ?? []) {
      if (evidence.type !== 'repo_path') continue;
      const absolute = path.resolve(repoRoot, evidence.path);
      assert.ok(absolute.startsWith(`${repoRoot}${path.sep}`));
      assert.ok(fs.statSync(absolute).isFile(), `${evidence.path} must be a file`);
    }
  }
});
