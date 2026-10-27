#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

export const ALLOWED_STATUSES = new Set([
  'proven',
  'partial',
  'missing',
  'not_applicable',
  'deferred_content',
]);

export const ALLOWED_PRIORITIES = new Set(['P0', 'P1', 'P2']);
const REQUIRED_DOMAINS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeRepoPath(value) {
  return value.split('/').join(path.sep);
}

function isSafeRelativeRepoPath(value) {
  if (!nonEmptyString(value) || path.isAbsolute(value)) return false;
  const normalized = path.normalize(value);
  return !normalized.startsWith(`..${path.sep}`) && normalized !== '..';
}

function collectScenarios(matrix) {
  return (matrix.domains ?? []).flatMap((domain) =>
    (domain.scenarios ?? []).map((scenario) => ({ domain, scenario })),
  );
}

export function validateMatrix(matrix, options = {}) {
  const root = options.repoRoot ? path.resolve(options.repoRoot) : repoRoot;
  const errors = [];

  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['matrix must be a JSON object'];
  }
  if (matrix.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (matrix.lane !== 'PFC-001') errors.push('lane must equal PFC-001');
  if (matrix.issue !== 234) errors.push('issue must equal 234');

  if (!matrix.contentBoundary || typeof matrix.contentBoundary !== 'object') {
    errors.push('contentBoundary is required');
  } else {
    for (const [key, expected] of Object.entries({
      realConversationHistoryRequired: false,
      semanticQualityClaimsAllowed: false,
      productionMutationAllowed: false,
      automaticPromotionAllowed: false,
    })) {
      if (matrix.contentBoundary[key] !== expected) {
        errors.push(`contentBoundary.${key} must be ${expected}`);
      }
    }
  }

  if (!Array.isArray(matrix.domains) || matrix.domains.length === 0) {
    errors.push('domains must be a non-empty array');
    return errors;
  }

  const domainIds = new Set();
  const scenarioIds = new Set();

  for (const domain of matrix.domains) {
    if (!nonEmptyString(domain.id)) {
      errors.push('every domain requires a non-empty id');
      continue;
    }
    if (domainIds.has(domain.id)) errors.push(`duplicate domain id: ${domain.id}`);
    domainIds.add(domain.id);
    if (!REQUIRED_DOMAINS.has(domain.id)) errors.push(`unknown domain id: ${domain.id}`);
    if (!nonEmptyString(domain.title)) errors.push(`domain ${domain.id} requires a title`);
    if (!Array.isArray(domain.scenarios) || domain.scenarios.length === 0) {
      errors.push(`domain ${domain.id} requires scenarios`);
      continue;
    }

    for (const scenario of domain.scenarios) {
      const id = scenario?.id;
      if (!nonEmptyString(id)) {
        errors.push(`domain ${domain.id} contains a scenario without an id`);
        continue;
      }
      if (!id.startsWith(`${domain.id}-`)) {
        errors.push(`${id}: id must begin with ${domain.id}-`);
      }
      if (scenarioIds.has(id)) errors.push(`duplicate scenario id: ${id}`);
      scenarioIds.add(id);

      if (!nonEmptyString(scenario.title)) errors.push(`${id}: title is required`);
      if (!ALLOWED_PRIORITIES.has(scenario.priority)) {
        errors.push(`${id}: invalid priority ${JSON.stringify(scenario.priority)}`);
      }
      if (!ALLOWED_STATUSES.has(scenario.status)) {
        errors.push(`${id}: invalid status ${JSON.stringify(scenario.status)}`);
      }
      if (!nonEmptyString(scenario.owner)) errors.push(`${id}: owner is required`);
      if (!nonEmptyString(scenario.nextAction)) errors.push(`${id}: nextAction is required`);

      const evidence = Array.isArray(scenario.evidence) ? scenario.evidence : [];
      let repoEvidenceCount = 0;

      for (const item of evidence) {
        if (!item || typeof item !== 'object') {
          errors.push(`${id}: evidence items must be objects`);
          continue;
        }
        if (item.type === 'repo_path') {
          repoEvidenceCount += 1;
          if (!isSafeRelativeRepoPath(item.path)) {
            errors.push(`${id}: unsafe or invalid repo_path ${JSON.stringify(item.path)}`);
            continue;
          }
          const absolute = path.resolve(root, normalizeRepoPath(item.path));
          if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
            errors.push(`${id}: repo_path escapes repository: ${item.path}`);
            continue;
          }
          if (!fs.existsSync(absolute)) {
            errors.push(`${id}: evidence path does not exist: ${item.path}`);
            continue;
          }
          if (!fs.statSync(absolute).isFile()) {
            errors.push(`${id}: evidence path is not a file: ${item.path}`);
          }
        } else if (item.type === 'external_url') {
          if (!nonEmptyString(item.url) || !/^https:\/\//.test(item.url)) {
            errors.push(`${id}: external_url evidence must use https`);
          }
        } else {
          errors.push(`${id}: unsupported evidence type ${JSON.stringify(item.type)}`);
        }
      }

      if (scenario.status === 'proven' && repoEvidenceCount === 0) {
        errors.push(`${id}: proven scenarios require at least one repo_path evidence item`);
      }
      if (scenario.status === 'deferred_content' && !nonEmptyString(scenario.rationale)) {
        errors.push(`${id}: deferred_content requires rationale`);
      }
      if (scenario.status === 'not_applicable' && !nonEmptyString(scenario.rationale)) {
        errors.push(`${id}: not_applicable requires rationale`);
      }
    }
  }

  for (const required of REQUIRED_DOMAINS) {
    if (!domainIds.has(required)) errors.push(`missing required domain ${required}`);
  }

  if (domainIds.size !== REQUIRED_DOMAINS.size) {
    errors.push(`expected exactly ${REQUIRED_DOMAINS.size} domains A-I`);
  }

  return errors;
}

export function matrixSummary(matrix) {
  const statuses = {};
  const priorities = {};
  const scenarios = collectScenarios(matrix);
  for (const { scenario } of scenarios) {
    statuses[scenario.status] = (statuses[scenario.status] ?? 0) + 1;
    priorities[scenario.priority] = (priorities[scenario.priority] ?? 0) + 1;
  }
  return {
    lane: matrix.lane,
    issue: matrix.issue,
    scenarioCount: scenarios.length,
    statuses,
    priorities,
    provenScenarioIds: scenarios
      .filter(({ scenario }) => scenario.status === 'proven')
      .map(({ scenario }) => scenario.id),
  };
}

export function loadMatrix(matrixPath = 'config/pre-content-foundation.v1.json') {
  const absolute = path.isAbsolute(matrixPath)
    ? matrixPath
    : path.resolve(repoRoot, matrixPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
}

if (isCliEntry()) {
  const matrixPath = process.argv[2] ?? 'config/pre-content-foundation.v1.json';
  let matrix;
  try {
    matrix = loadMatrix(matrixPath);
  } catch (error) {
    console.error(JSON.stringify({
      status: 'FAIL',
      matrixPath,
      errors: [`unable to load matrix: ${error.message}`],
    }, null, 2));
    process.exit(1);
  }

  const errors = validateMatrix(matrix);
  const summary = matrixSummary(matrix);
  const result = {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    matrixPath,
    ...summary,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exit(1);
}
