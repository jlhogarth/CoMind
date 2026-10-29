import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadThreadKeeperC4Matrix,
  matrixSummary,
  validateThreadKeeperC4Matrix,
} from '../../scripts/threadkeeper_c4_matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return structuredClone(value);
}

function firstProven(matrix) {
  return [...matrix.gateRequirements, ...matrix.scenarioRequirements]
    .find(item => item.status === 'proven');
}

test('canonical ThreadKeeper C4 matrix validates while promotion remains explicitly gated', () => {
  const matrix = loadThreadKeeperC4Matrix();
  assert.deepEqual(validateThreadKeeperC4Matrix(matrix, { repoRoot }), []);
  const summary = matrixSummary(matrix);
  assert.equal(summary.gateRequirementCount, 16);
  assert.equal(summary.scenarioRequirementCount, 12);
  assert.equal(summary.byStatus.proven, 25);
  assert.equal(summary.byStatus.partial, 1);
  assert.equal(summary.byStatus.missing, 2);
  assert.equal(summary.currentMaturity, 'C3 Integrated');
  assert.equal(summary.targetMaturity, 'C4 Operational');
  assert.equal(summary.promotionReady, false);
  assert.deepEqual(summary.unresolvedIds, ['C4-13', 'C4-14', 'C4-16']);
  assert.equal(matrix.promotionBoundary.promotionJournalKey, null);
});

test('C4 proven claims fail without repository evidence', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = (requirement.evidence ?? []).filter(item => item.type !== 'repo_path');
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes(`${requirement.id}: proven entries require`)), errors.join('\n'));
});

test('C4 nonexistent evidence path fails validation', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = [{ type: 'repo_path', path: 'not/a/real/c4-proof.file' }];
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('evidence path does not exist')), errors.join('\n'));
});

test('C4 cannot become promotion-ready while any required evidence is unresolved', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  matrix.promotionBoundary.ready = true;
  matrix.promotionBoundary.currentMaturity = 'C4 Operational';
  matrix.promotionBoundary.promotionJournalKey = 'JRN-20990101-0001';
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('required entries remain partial or missing')), errors.join('\n'));
  assert.ok(errors.some(message => message.includes('requires C4-13 to be proven')), errors.join('\n'));
  assert.ok(errors.some(message => message.includes('requires C4-14 to be proven')), errors.join('\n'));
  assert.ok(errors.some(message => message.includes('requires C4-16 to be proven')), errors.join('\n'));
});

test('C4 promotion journal cannot appear before promotion readiness', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  matrix.promotionBoundary.promotionJournalKey = 'JRN-20990101-0001';
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('promotionJournalKey must remain null')), errors.join('\n'));
});

test('C4 required ids cannot be silently dropped or duplicated', () => {
  const missing = clone(loadThreadKeeperC4Matrix());
  missing.gateRequirements = missing.gateRequirements.filter(item => item.id !== 'C4-07');
  assert.ok(validateThreadKeeperC4Matrix(missing, { repoRoot }).some(message => message.includes('missing required id C4-07')));

  const duplicate = clone(loadThreadKeeperC4Matrix());
  duplicate.scenarioRequirements.push(clone(duplicate.scenarioRequirements[0]));
  assert.ok(validateThreadKeeperC4Matrix(duplicate, { repoRoot }).some(message => message.includes('duplicate scenario requirement id')));
});

test('C4 cannot claim current C4 maturity before promotion readiness', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  matrix.promotionBoundary.currentMaturity = 'C4 Operational';
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('pre-promotion matrix must remain C3 Integrated')), errors.join('\n'));
});
