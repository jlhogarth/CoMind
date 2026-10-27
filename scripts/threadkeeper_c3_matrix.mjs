#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

export const ALLOWED_STATUSES = new Set(['proven', 'partial', 'missing', 'not_applicable']);
export const ALLOWED_EVIDENCE_TYPES = new Set(['repo_path', 'github_run', 'cde_key']);
const REQUIRED_GATE_IDS = new Set(Array.from({ length: 17 }, (_, index) => `C3-${String(index + 1).padStart(2, '0')}`));
const REQUIRED_SCENARIO_IDS = new Set(Array.from({ length: 12 }, (_, index) => `E-${String(index + 1).padStart(2, '0')}`));

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
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
      const absolute = path.resolve(root, item.path.split('/').join(path.sep));
      if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
        errors.push(`${ownerId}: repo_path escapes repository: ${item.path}`);
        continue;
      }
      if (!fs.existsSync(absolute)) {
        errors.push(`${ownerId}: evidence path does not exist: ${item.path}`);
        continue;
      }
      if (!fs.statSync(absolute).isFile()) errors.push(`${ownerId}: evidence path is not a file: ${item.path}`);
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

function validateRequirement(item, expectedIds, seenIds, root, errors, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${label}: entries must be objects`);
    return;
  }
  const id = item.id;
  if (!nonEmptyString(id)) {
    errors.push(`${label}: every entry requires a non-empty id`);
    return;
  }
  if (!expectedIds.has(id)) errors.push(`${id}: unexpected ${label} id`);
  if (seenIds.has(id)) errors.push(`${id}: duplicate ${label} id`);
  seenIds.add(id);
  if (!nonEmptyString(item.title)) errors.push(`${id}: title is required`);
  if (!ALLOWED_STATUSES.has(item.status)) errors.push(`${id}: invalid status ${JSON.stringify(item.status)}`);
  const repoEvidenceCount = validateEvidence(id, item.evidence, root, errors);
  if (item.status === 'proven' && repoEvidenceCount === 0) {
    errors.push(`${id}: proven entries require at least one repo_path evidence item`);
  }
  if (item.status === 'not_applicable') {
    if (!nonEmptyString(item.rationale)) errors.push(`${id}: not_applicable requires rationale`);
    if (repoEvidenceCount === 0) errors.push(`${id}: not_applicable requires repository-backed rationale evidence`);
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

export function validateThreadKeeperC3Matrix(matrix, options = {}) {
  const root = options.repoRoot ? path.resolve(options.repoRoot) : repoRoot;
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return ['matrix must be a JSON object'];
  if (matrix.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (matrix.lane !== 'TK-006') errors.push('lane must equal TK-006');
  if (matrix.issue !== 256) errors.push('issue must equal 256');
  if (!isSha(matrix.baseCommit)) errors.push('baseCommit must be a 40-character lowercase SHA');
  if (!nonEmptyString(matrix.purpose)) errors.push('purpose is required');

  const boundary = matrix.promotionBoundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) {
    errors.push('promotionBoundary is required');
  } else {
    if (boundary.targetMaturity !== 'C3 Integrated') errors.push('promotionBoundary.targetMaturity must equal C3 Integrated');
    if (boundary.automaticPromotionAllowed !== false) errors.push('automaticPromotionAllowed must be false');
    if (boundary.productionActivationRequired !== false) errors.push('productionActivationRequired must be false');
    if (boundary.publicHttpEndpointRequired !== false) errors.push('publicHttpEndpointRequired must be false');
    if (boundary.operationalSlaRequired !== false) errors.push('operationalSlaRequired must be false for C3');
    if (typeof boundary.ready !== 'boolean') errors.push('promotionBoundary.ready must be boolean');
    if (boundary.ready === true && boundary.currentMaturity !== boundary.targetMaturity) {
      errors.push('promotion-ready matrix must report currentMaturity equal to targetMaturity');
    }
    if (boundary.ready === false && boundary.currentMaturity !== 'C2 Implemented') {
      errors.push('pre-promotion matrix must remain C2 Implemented');
    }
  }

  if (!Array.isArray(matrix.gateRequirements)) errors.push('gateRequirements must be an array');
  if (!Array.isArray(matrix.scenarioRequirements)) errors.push('scenarioRequirements must be an array');

  const gateSeen = new Set();
  for (const item of matrix.gateRequirements ?? []) {
    validateRequirement(item, REQUIRED_GATE_IDS, gateSeen, root, errors, 'gate requirement');
  }
  assertExactIds('gateRequirements', REQUIRED_GATE_IDS, gateSeen, errors);

  const scenarioSeen = new Set();
  for (const item of matrix.scenarioRequirements ?? []) {
    validateRequirement(item, REQUIRED_SCENARIO_IDS, scenarioSeen, root, errors, 'scenario requirement');
  }
  assertExactIds('scenarioRequirements', REQUIRED_SCENARIO_IDS, scenarioSeen, errors);

  const allItems = [...(matrix.gateRequirements ?? []), ...(matrix.scenarioRequirements ?? [])];
  const unresolved = allItems.filter(item => item?.status === 'partial' || item?.status === 'missing');
  if (boundary?.ready === true) {
    if (unresolved.length > 0) {
      errors.push(`promotionBoundary.ready cannot be true while ${unresolved.length} required entries remain partial or missing`);
    }
    if (!nonEmptyString(boundary.promotionJournalKey)) errors.push('promotionBoundary.ready requires promotionJournalKey');
    const promotion = (matrix.gateRequirements ?? []).find(item => item.id === 'C3-17');
    if (promotion?.status !== 'proven') errors.push('promotionBoundary.ready requires C3-17 to be proven');
  } else if (boundary?.promotionJournalKey !== null) {
    errors.push('promotionJournalKey must remain null while promotionBoundary.ready is false');
  }

  return errors;
}

export function matrixSummary(matrix) {
  const allItems = [...(matrix.gateRequirements ?? []), ...(matrix.scenarioRequirements ?? [])];
  const byStatus = {};
  for (const item of allItems) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  return {
    lane: matrix.lane,
    issue: matrix.issue,
    currentMaturity: matrix.promotionBoundary?.currentMaturity,
    targetMaturity: matrix.promotionBoundary?.targetMaturity,
    promotionReady: matrix.promotionBoundary?.ready === true,
    gateRequirementCount: matrix.gateRequirements?.length ?? 0,
    scenarioRequirementCount: matrix.scenarioRequirements?.length ?? 0,
    byStatus,
    unresolvedIds: allItems
      .filter(item => item.status === 'partial' || item.status === 'missing')
      .map(item => item.id),
  };
}

export function loadThreadKeeperC3Matrix(matrixPath = 'config/threadkeeper-c3-evidence.v1.json') {
  const absolute = path.isAbsolute(matrixPath) ? matrixPath : path.resolve(repoRoot, matrixPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const matrixPath = process.argv[2] ?? 'config/threadkeeper-c3-evidence.v1.json';
  let matrix;
  try {
    matrix = loadThreadKeeperC3Matrix(matrixPath);
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', matrixPath, errors: [`unable to load matrix: ${error.message}`] }, null, 2));
    process.exit(1);
  }
  const errors = validateThreadKeeperC3Matrix(matrix);
  const summary = matrixSummary(matrix);
  console.log(JSON.stringify({ status: errors.length === 0 ? 'PASS' : 'FAIL', matrixPath, ...summary, errors }, null, 2));
  if (errors.length > 0) process.exit(1);
}
