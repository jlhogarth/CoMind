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

test('canonical ThreadKeeper C4 matrix validates after governed promotion closure', () => {
  const matrix = loadThreadKeeperC4Matrix();
  assert.deepEqual(validateThreadKeeperC4Matrix(matrix, { repoRoot }), []);
  const summary = matrixSummary(matrix);
  assert.equal(summary.gateRequirementCount, 16);
  assert.equal(summary.scenarioRequirementCount, 12);
  assert.equal(summary.byStatus.proven, 28);
  assert.equal(summary.byStatus.partial ?? 0, 0);
  assert.equal(summary.byStatus.missing ?? 0, 0);
  assert.equal(summary.currentMaturity, 'C4 Operational');
  assert.equal(summary.targetMaturity, 'C4 Operational');
  assert.equal(summary.promotionReady, true);
  assert.deepEqual(summary.unresolvedIds, []);
  assert.equal(matrix.promotionBoundary.promotionJournalKey, 'JRN-20261028-0001');
  assert.equal(matrix.promotionBoundary.automaticPromotionAllowed, false);
  assert.equal(matrix.promotionBoundary.productionActivationRequired, false);
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

test('C4 cannot remain promotion-ready if a required acceptance gate regresses', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  const acceptance = matrix.gateRequirements.find(item => item.id === 'C4-13');
  acceptance.status = 'partial';
  acceptance.nextAction = 'Restore explicit governed acceptance evidence.';
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('required entries remain partial or missing')), errors.join('\n'));
  assert.ok(errors.some(message => message.includes('requires C4-13 to be proven')), errors.join('\n'));
});

test('C4 final state requires the governed promotion journal', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  matrix.promotionBoundary.promotionJournalKey = null;
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('promotionBoundary.ready requires promotionJournalKey')), errors.join('\n'));
});

test('C4 promotion journal cannot appear in a pre-promotion state', () => {
  const matrix = clone(loadThreadKeeperC4Matrix());
  matrix.promotionBoundary.ready = false;
  matrix.promotionBoundary.currentMaturity = 'C3 Integrated';
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
  matrix.promotionBoundary.ready = false;
  matrix.promotionBoundary.promotionJournalKey = null;
  const errors = validateThreadKeeperC4Matrix(matrix, { repoRoot });
  assert.ok(errors.some(message => message.includes('pre-promotion matrix must remain C3 Integrated')), errors.join('\n'));
});
