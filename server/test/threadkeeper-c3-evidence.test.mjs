import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadThreadKeeperC3Matrix,
  matrixSummary,
  validateThreadKeeperC3Matrix,
} from '../../scripts/threadkeeper_c3_matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return structuredClone(value);
}

function firstProven(matrix) {
  return [...matrix.gateRequirements, ...matrix.scenarioRequirements]
    .find(item => item.status === 'proven');
}

test('canonical ThreadKeeper C3 matrix validates with only MCTRL and promotion controls unresolved', () => {
  const matrix = loadThreadKeeperC3Matrix();
  assert.deepEqual(validateThreadKeeperC3Matrix(matrix, { repoRoot }), []);
  const summary = matrixSummary(matrix);
  assert.equal(summary.gateRequirementCount, 17);
  assert.equal(summary.scenarioRequirementCount, 12);
  assert.equal(summary.byStatus.proven, 27);
  assert.equal(summary.byStatus.partial ?? 0, 0);
  assert.equal(summary.byStatus.missing, 2);
  assert.equal(summary.promotionReady, false);
  assert.deepEqual(summary.unresolvedIds, ['C3-16', 'C3-17']);
});

test('C3 proven claims fail without repository evidence', () => {
  const matrix = clone(loadThreadKeeperC3Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = (requirement.evidence ?? []).filter(item => item.type !== 'repo_path');
  const errors = validateThreadKeeperC3Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes(`${requirement.id}: proven entries require`)), errors.join('\n'));
});

test('C3 nonexistent evidence path fails validation', () => {
  const matrix = clone(loadThreadKeeperC3Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = [{ type: 'repo_path', path: 'not/a/real/c3-proof.file' }];
  const errors = validateThreadKeeperC3Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('evidence path does not exist')), errors.join('\n'));
});

test('C3 cannot promote while any evidence remains unresolved', () => {
  const matrix = clone(loadThreadKeeperC3Matrix());
  matrix.promotionBoundary.ready = true;
  matrix.promotionBoundary.currentMaturity = 'C3 Integrated';
  matrix.promotionBoundary.promotionJournalKey = 'JRN-premature-c3';
  const errors = validateThreadKeeperC3Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('required entries remain partial or missing')), errors.join('\n'));
  assert.ok(errors.some(message => message.includes('requires C3-17 to be proven')), errors.join('\n'));
});

test('C3 promotion journal cannot appear while ready is false', () => {
  const matrix = clone(loadThreadKeeperC3Matrix());
  matrix.promotionBoundary.promotionJournalKey = 'JRN-premature-c3';
  const errors = validateThreadKeeperC3Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('promotionJournalKey must remain null')), errors.join('\n'));
});

test('C3 required ids cannot be silently dropped or duplicated', () => {
  const missing = clone(loadThreadKeeperC3Matrix());
  missing.gateRequirements = missing.gateRequirements.filter(item => item.id !== 'C3-07');
  assert.ok(validateThreadKeeperC3Matrix(missing, { repoRoot }).some(message => message.includes('missing required id C3-07')));

  const duplicate = clone(loadThreadKeeperC3Matrix());
  duplicate.scenarioRequirements.push(clone(duplicate.scenarioRequirements[0]));
  assert.ok(validateThreadKeeperC3Matrix(duplicate, { repoRoot }).some(message => message.includes('duplicate scenario requirement id')));
});

test('C3 cannot claim current C3 maturity before promotion readiness', () => {
  const matrix = clone(loadThreadKeeperC3Matrix());
  matrix.promotionBoundary.currentMaturity = 'C3 Integrated';
  const errors = validateThreadKeeperC3Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('pre-promotion matrix must remain C2 Implemented')), errors.join('\n'));
});
