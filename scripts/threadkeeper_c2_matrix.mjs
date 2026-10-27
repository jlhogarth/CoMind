#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

export const ALLOWED_STATUSES = new Set(['proven', 'partial', 'missing', 'not_applicable']);
export const ALLOWED_EVIDENCE_TYPES = new Set(['repo_path', 'github_run', 'cde_key']);

const REQUIRED_GATE_IDS = new Set(Array.from({ length: 16 }, (_, index) => `C2-${String(index + 1).padStart(2, '0')}`));
const REQUIRED_TEST_IDS = new Set([
  ...Array.from({ length: 20 }, (_, index) => `U-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `I-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_, index) => `B-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `F-${String(index + 1).padStart(2, '0')}`),
]);
const GROUP_PREFIX = new Map([
  ['unit', 'U-'],
  ['postgres', 'I-'],
  ['boundary', 'B-'],
  ['failure', 'F-'],
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function normalizeRepoPath(value) {
  return value.split('/').join(path.sep);
}

function isSafeRelativeRepoPath(value) {
  if (!nonEmptyString(value) || path.isAbsolute(value)) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

function validateEvidence(ownerId, evidence, root, errors) {
  const items = Array.isArray(evidence) ? evidence : [];
  let repoEvidenceCount = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${ownerId}: evidence items must be objects`);
      continue;
    }
    if (!ALLOWED_EVIDENCE_TYPES.has(item.type)) {
      errors.push(`${ownerId}: unsupported evidence type ${JSON.stringify(item.type)}`);
      continue;
    }
    if (item.type === 'repo_path') {
      repoEvidenceCount += 1;
      if (!isSafeRelativeRepoPath(item.path)) {
        errors.push(`${ownerId}: unsafe or invalid repo_path ${JSON.stringify(item.path)}`);
        continue;
      }
      const absolute = path.resolve(root, normalizeRepoPath(item.path));
      if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
        errors.push(`${ownerId}: repo_path escapes repository: ${item.path}`);
        continue;
      }
      if (!fs.existsSync(absolute)) {
        errors.push(`${ownerId}: evidence path does not exist: ${item.path}`);
        continue;
      }
      if (!fs.statSync(absolute).isFile()) {
        errors.push(`${ownerId}: evidence path is not a file: ${item.path}`);
      }
    }
    if (item.type === 'github_run' && (!Number.isInteger(item.runId) || item.runId <= 0)) {
      errors.push(`${ownerId}: github_run requires a positive integer runId`);
    }
    if (item.type === 'cde_key' && !nonEmptyString(item.key)) {
      errors.push(`${ownerId}: cde_key requires a non-empty key`);
    }
  }

  return repoEvidenceCount;
}

function validateRequirement(item, expectedIds, seenIds, root, errors, options = {}) {
  const kind = options.kind ?? 'requirement';
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${kind}: entries must be objects`);
    return;
  }

  const id = item.id;
  if (!nonEmptyString(id)) {
    errors.push(`${kind}: every entry requires a non-empty id`);
    return;
  }
  if (!expectedIds.has(id)) errors.push(`${id}: unexpected ${kind} id`);
  if (seenIds.has(id)) errors.push(`${id}: duplicate ${kind} id`);
  seenIds.add(id);

  if (!nonEmptyString(item.title)) errors.push(`${id}: title is required`);
  if (!ALLOWED_STATUSES.has(item.status)) errors.push(`${id}: invalid status ${JSON.stringify(item.status)}`);
  if (options.requireGroup) {
    const prefix = GROUP_PREFIX.get(item.group);
    if (!prefix) errors.push(`${id}: invalid test group ${JSON.stringify(item.group)}`);
    else if (!id.startsWith(prefix)) errors.push(`${id}: id does not match group ${item.group}`);
  }

  const repoEvidenceCount = validateEvidence(id, item.evidence, root, errors);
  if (item.status === 'proven' && repoEvidenceCount === 0) errors.push(`${id}: proven entries require at least one repo_path evidence item`);
  if (item.status === 'not_applicable') {
    if (!nonEmptyString(item.rationale)) errors.push(`${id}: not_applicable requires rationale`);
    if (repoEvidenceCount === 0) errors.push(`${id}: not_applicable requires a repository source supporting the rationale`);
  }
  if ((item.status === 'partial' || item.status === 'missing') && !nonEmptyString(item.nextAction)) {
    errors.push(`${id}: ${item.status} entries require nextAction`);
  }
}

function assertExactIds(label, expected, seen, errors) {
  for (const id of expected) {
    if (!seen.has(id)) errors.push(`${label}: missing required id ${id}`);
  }
  if (seen.size !== expected.size) errors.push(`${label}: expected exactly ${expected.size} unique ids, found ${seen.size}`);
}

export function validateThreadKeeperC2Matrix(matrix, options = {}) {
  const root = options.repoRoot ? path.resolve(options.repoRoot) : repoRoot;
  const errors = [];

  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return ['matrix must be a JSON object'];
  if (matrix.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (matrix.lane !== 'TK-005') errors.push('lane must equal TK-005');
  if (matrix.issue !== 248) errors.push('issue must equal 248');
  if (!isSha(matrix.baseCommit)) errors.push('baseCommit must be a 40-character lowercase SHA');
  if (!nonEmptyString(matrix.purpose)) errors.push('purpose is required');

  const boundary = matrix.promotionBoundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) {
    errors.push('promotionBoundary is required');
  } else {
    if (boundary.targetMaturity !== 'C2 Implemented') errors.push('promotionBoundary.targetMaturity must equal C2 Implemented');
    if (boundary.automaticPromotionAllowed !== false) errors.push('automaticPromotionAllowed must be false');
    if (boundary.productionActivationRequired !== false) errors.push('productionActivationRequired must be false');
    if (boundary.publicHttpEndpointRequired !== false) errors.push('publicHttpEndpointRequired must be false');
    if (boundary.sdnRegistrationRequired !== false) errors.push('sdnRegistrationRequired must be false');
    if (typeof boundary.ready !== 'boolean') errors.push('promotionBoundary.ready must be boolean');
    if (boundary.ready === true && boundary.currentMaturity !== boundary.targetMaturity) {
      errors.push('promotion-ready matrix must report currentMaturity equal to targetMaturity');
    }
    if (boundary.ready === false && boundary.currentMaturity !== 'C1 Contracted') {
      errors.push('pre-promotion matrix must remain C1 Contracted');
    }
  }

  if (!Array.isArray(matrix.gateRequirements)) errors.push('gateRequirements must be an array');
  if (!Array.isArray(matrix.testRequirements)) errors.push('testRequirements must be an array');

  const gateSeen = new Set();
  for (const item of matrix.gateRequirements ?? []) validateRequirement(item, REQUIRED_GATE_IDS, gateSeen, root, errors, { kind: 'gate requirement' });
  assertExactIds('gateRequirements', REQUIRED_GATE_IDS, gateSeen, errors);

  const testSeen = new Set();
  for (const item of matrix.testRequirements ?? []) validateRequirement(item, REQUIRED_TEST_IDS, testSeen, root, errors, { kind: 'test requirement', requireGroup: true });
  assertExactIds('testRequirements', REQUIRED_TEST_IDS, testSeen, errors);

  const allItems = [...(matrix.gateRequirements ?? []), ...(matrix.testRequirements ?? [])];
  const unresolved = allItems.filter(item => item?.status === 'partial' || item?.status === 'missing');

  if (boundary?.ready === true) {
    if (unresolved.length > 0) errors.push(`promotionBoundary.ready cannot be true while ${unresolved.length} required entries remain partial or missing`);
    if (!nonEmptyString(boundary.promotionJournalKey)) errors.push('promotionBoundary.ready requires promotionJournalKey');
    const promotionRequirement = (matrix.gateRequirements ?? []).find(item => item.id === 'C2-16');
    if (promotionRequirement?.status !== 'proven') errors.push('promotionBoundary.ready requires C2-16 to be proven');
  } else if (boundary?.promotionJournalKey !== null) {
    errors.push('promotionJournalKey must remain null while promotionBoundary.ready is false');
  }

  return errors;
}

export function matrixSummary(matrix) {
  const allItems = [...(matrix.gateRequirements ?? []), ...(matrix.testRequirements ?? [])];
  const byStatus = {};
  const byGroup = {};
  for (const item of allItems) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    const group = item.group ?? 'gate';
    byGroup[group] ??= { total: 0, proven: 0, partial: 0, missing: 0, not_applicable: 0 };
    byGroup[group].total += 1;
    if (item.status in byGroup[group]) byGroup[group][item.status] += 1;
  }
  const unresolvedIds = allItems.filter(item => item.status === 'partial' || item.status === 'missing').map(item => item.id);
  return {
    lane: matrix.lane,
    issue: matrix.issue,
    currentMaturity: matrix.promotionBoundary?.currentMaturity,
    targetMaturity: matrix.promotionBoundary?.targetMaturity,
    promotionReady: matrix.promotionBoundary?.ready === true,
    gateRequirementCount: matrix.gateRequirements?.length ?? 0,
    testRequirementCount: matrix.testRequirements?.length ?? 0,
    byStatus,
    byGroup,
    unresolvedIds,
  };
}

export function loadThreadKeeperC2Matrix(matrixPath = 'config/threadkeeper-c2-evidence.v1.json') {
  const absolute = path.isAbsolute(matrixPath) ? matrixPath : path.resolve(repoRoot, matrixPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
}

if (isCliEntry()) {
  const matrixPath = process.argv[2] ?? 'config/threadkeeper-c2-evidence.v1.json';
  let matrix;
  try {
    matrix = loadThreadKeeperC2Matrix(matrixPath);
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', matrixPath, errors: [`unable to load matrix: ${error.message}`] }, null, 2));
    process.exit(1);
  }
  const errors = validateThreadKeeperC2Matrix(matrix);
  const summary = matrixSummary(matrix);
  console.log(JSON.stringify({ status: errors.length === 0 ? 'PASS' : 'FAIL', matrixPath, ...summary, errors }, null, 2));
  if (errors.length > 0) process.exit(1);
}
