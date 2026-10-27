import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadThreadKeeperC2Matrix,
  matrixSummary,
  validateThreadKeeperC2Matrix,
} from '../../scripts/threadkeeper_c2_matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return structuredClone(value);
}

function firstProven(matrix) {
  return [...matrix.gateRequirements, ...matrix.testRequirements]
    .find((candidate) => candidate.status === 'proven');
}

test('canonical ThreadKeeper C2 matrix validates as promotion-ready only after full evidence closure', () => {
  const matrix = loadThreadKeeperC2Matrix();
  assert.deepEqual(validateThreadKeeperC2Matrix(matrix, { repoRoot }), []);

  const summary = matrixSummary(matrix);
  assert.equal(summary.gateRequirementCount, 16);
  assert.equal(summary.testRequirementCount, 50);
  assert.equal(summary.byStatus.proven ?? 0, 65);
  assert.equal(summary.byStatus.partial ?? 0, 0);
  assert.equal(summary.byStatus.missing ?? 0, 0);
  assert.equal(summary.byStatus.not_applicable ?? 0, 1);
  assert.equal(summary.promotionReady, true);
  assert.deepEqual(summary.unresolvedIds, []);
  assert.equal(matrix.promotionBoundary.promotionJournalKey, 'JRN-20261027-0004');
});

test('proven claims fail without repository evidence', () => {
  const matrix = clone(loadThreadKeeperC2Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = (requirement.evidence ?? []).filter((item) => item.type !== 'repo_path');
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes(`${requirement.id}: proven entries require`)), errors.join('\n'));
});

test('nonexistent repository evidence fails validation', () => {
  const matrix = clone(loadThreadKeeperC2Matrix());
  const requirement = firstProven(matrix);
  requirement.evidence = [{ type: 'repo_path', path: 'definitely/not/a/real/threadkeeper-proof.file' }];
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes('evidence path does not exist')), errors.join('\n'));
});

test('promotion cannot remain ready if any C2 evidence regresses to unresolved', () => {
  const matrix = clone(loadThreadKeeperC2Matrix());
  const regressed = matrix.gateRequirements.find((item) => item.id === 'C2-14');
  regressed.status = 'partial';
  regressed.nextAction = 'Reconcile projection regression before promotion.';
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes('required entries remain partial or missing')), errors.join('\n'));
});

test('promotion journal cannot appear when promotion readiness is false', () => {
  const matrix = clone(loadThreadKeeperC2Matrix());
  matrix.promotionBoundary.ready = false;
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes('promotionJournalKey must remain null')), errors.join('\n'));
});

test('required C2 ids cannot be silently dropped or duplicated', () => {
  const missing = clone(loadThreadKeeperC2Matrix());
  missing.gateRequirements = missing.gateRequirements.filter((item) => item.id !== 'C2-12');
  assert.ok(validateThreadKeeperC2Matrix(missing, { repoRoot }).some((message) => message.includes('missing required id C2-12')));
  const duplicate = clone(loadThreadKeeperC2Matrix());
  duplicate.testRequirements.push(clone(duplicate.testRequirements[0]));
  assert.ok(validateThreadKeeperC2Matrix(duplicate, { repoRoot }).some((message) => message.includes('duplicate test requirement id')));
});

test('not-applicable evidence requires an explicit repository-backed rationale', () => {
  const matrix = clone(loadThreadKeeperC2Matrix());
  const item = matrix.testRequirements.find((candidate) => candidate.status === 'not_applicable');
  assert.ok(item, 'fixture requires one not_applicable test');
  delete item.rationale;
  const errors = validateThreadKeeperC2Matrix(matrix, { repoRoot });
  assert.ok(errors.some((message) => message.includes(`${item.id}: not_applicable requires rationale`)), errors.join('\n'));
});
