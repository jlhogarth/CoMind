#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ALLOWED_EVIDENCE_TYPES = new Set(['repo_path', 'github_run', 'cde_key']);

export function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSha(value) {
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

function evidenceArrays(matrix) {
  return [
    ...(matrix.gateRequirements ?? []),
    ...(matrix.testRequirements ?? []),
    ...(matrix.scenarioRequirements ?? []),
  ].flatMap((item) => (item?.evidence ?? []).map((evidence) => ({ ownerId: item.id, evidence, owner: item })));
}

function loadJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

export function loadEvidenceBindings(root) {
  return loadJson(root, 'config/governed-evidence-bindings.v1.json');
}

function laneBinding(root, lane) {
  const bindings = loadEvidenceBindings(root);
  return { bindings, laneBinding: bindings.lanes?.[lane] ?? null };
}

function validateRunBinding(ownerId, runId, binding, implementationCommit, errors) {
  if (!binding) {
    errors.push(`${ownerId}: github_run ${runId} has no governed external binding`);
    return;
  }
  if (!nonEmptyString(binding.workflowPath) || !binding.workflowPath.startsWith('.github/workflows/')) {
    errors.push(`${ownerId}: github_run ${runId} binding requires workflowPath under .github/workflows/`);
  }
  if (!isSha(binding.expectedHeadSha)) {
    errors.push(`${ownerId}: github_run ${runId} binding requires expectedHeadSha`);
  }
  if (!nonEmptyString(binding.event)) {
    errors.push(`${ownerId}: github_run ${runId} binding requires event`);
  }
  if (binding.conclusion !== 'success') {
    errors.push(`${ownerId}: github_run ${runId} binding must require conclusion=success`);
  }
  if (binding.bindsImplementation !== undefined && typeof binding.bindsImplementation !== 'boolean') {
    errors.push(`${ownerId}: github_run ${runId} bindsImplementation must be boolean when present`);
  }
  if (binding.bindsImplementation === true && isSha(implementationCommit) && binding.expectedHeadSha !== implementationCommit) {
    errors.push(`${ownerId}: implementation-bound github_run ${runId} head must equal matrix implementationCommit`);
  }
}

export function validateEvidenceItems(ownerId, evidence, root, errors, options = {}) {
  const items = Array.isArray(evidence) ? evidence : [];
  const implementationCommit = options.implementationCommit;
  const lane = options.lane;
  let repoEvidenceCount = 0;
  const repoEvidencePaths = [];
  let currentLaneBinding = null;

  try {
    currentLaneBinding = laneBinding(root, lane).laneBinding;
  } catch (error) {
    errors.push(`${ownerId}: unable to load governed evidence bindings: ${error.message}`);
  }

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
        continue;
      }
      repoEvidencePaths.push(absolute);
    }

    if (item.type === 'github_run') {
      if (!Number.isInteger(item.runId) || item.runId <= 0) {
        errors.push(`${ownerId}: github_run requires a positive integer runId`);
        continue;
      }
      validateRunBinding(
        ownerId,
        item.runId,
        currentLaneBinding?.githubRuns?.[String(item.runId)],
        implementationCommit,
        errors
      );
    }

    if (item.type === 'cde_key') {
      if (!nonEmptyString(item.key)) {
        errors.push(`${ownerId}: cde_key requires a non-empty key`);
        continue;
      }
      const binding = currentLaneBinding?.cdeKeys?.[item.key];
      if (!binding) {
        errors.push(`${ownerId}: cde_key ${item.key} has no governed CDE binding`);
      } else if (binding.verificationState !== 'verified' || !nonEmptyString(binding.mctrlControlId)) {
        errors.push(`${ownerId}: cde_key ${item.key} binding must require verified state through an MCTRL control`);
      }
    }
  }

  for (const item of items.filter((candidate) => candidate?.type === 'cde_key' && nonEmptyString(candidate.key))) {
    const supported = repoEvidencePaths.some((absolute) => fs.readFileSync(absolute, 'utf8').includes(item.key));
    if (!supported) {
      errors.push(`${ownerId}: cde_key ${item.key} must be cited by repository evidence in the same requirement`);
    }
  }

  return repoEvidenceCount;
}

export function validateExternalEvidenceContract(matrix, root, errors) {
  let bindings;
  let currentLaneBinding;
  try {
    ({ bindings, laneBinding: currentLaneBinding } = laneBinding(root, matrix.lane));
  } catch (error) {
    errors.push(`unable to load governed external evidence bindings: ${error.message}`);
    return;
  }

  if (bindings.schemaVersion !== 1) errors.push('governed evidence bindings schemaVersion must equal 1');
  if (!nonEmptyString(bindings.repository) || !/^[^/]+\/[^/]+$/.test(bindings.repository)) {
    errors.push('governed evidence bindings repository must be owner/name');
  }
  if (!currentLaneBinding) {
    errors.push(`no governed external evidence binding exists for ${matrix.lane}`);
    return;
  }
  if (currentLaneBinding.issue !== matrix.issue) {
    errors.push(`governed evidence binding issue mismatch for ${matrix.lane}`);
  }
  if (currentLaneBinding.implementationCommit !== matrix.implementationCommit) {
    errors.push(`governed evidence binding implementationCommit mismatch for ${matrix.lane}`);
  }

  const implementationBindings = Object.entries(currentLaneBinding.githubRuns ?? {})
    .filter(([, binding]) => binding?.bindsImplementation === true);
  if (implementationBindings.length === 0) {
    errors.push(`${matrix.lane}: at least one github_run binding must prove implementationCommit`);
  } else if (implementationBindings.every(([, binding]) => binding.expectedHeadSha !== matrix.implementationCommit)) {
    errors.push(`${matrix.lane}: implementation-bound github_run evidence does not match implementationCommit`);
  }

  const finalAcceptanceRunIds = currentLaneBinding.finalAcceptanceRunIds;
  if (!Array.isArray(finalAcceptanceRunIds) || finalAcceptanceRunIds.length < 2) {
    errors.push(`${matrix.lane}: finalAcceptanceRunIds must contain the final lane and maintenance checks`);
  } else {
    let laneGateFound = false;
    let maintenanceFound = false;
    for (const runId of finalAcceptanceRunIds) {
      const binding = currentLaneBinding.githubRuns?.[String(runId)];
      validateRunBinding('final acceptance', runId, binding, matrix.implementationCommit, errors);
      if (binding?.historical === true) errors.push(`${matrix.lane}: final acceptance run ${runId} cannot be marked historical`);
      if (binding?.workflowPath?.includes(matrix.lane === 'TK-005' ? 'tk-005' : 'tk-006')) laneGateFound = true;
      if (binding?.workflowPath === '.github/workflows/mctrl-001-maintenance-control.yml') maintenanceFound = true;
    }
    if (!laneGateFound) errors.push(`${matrix.lane}: final acceptance bindings must include the lane evidence workflow`);
    if (!maintenanceFound) errors.push(`${matrix.lane}: final acceptance bindings must include MCTRL`);
  }

  let maintenance;
  try {
    maintenance = loadJson(root, 'config/maintenance-control.v1.json');
  } catch (error) {
    errors.push(`unable to load maintenance control for CDE verification: ${error.message}`);
    return;
  }
  const controls = new Map((maintenance.controls ?? []).map((control) => [control.id, control]));
  for (const { ownerId, evidence: item } of evidenceArrays(matrix).filter(({ evidence }) => evidence?.type === 'cde_key')) {
    const cdeBinding = currentLaneBinding.cdeKeys?.[item.key];
    if (!cdeBinding) continue;
    const control = controls.get(cdeBinding.mctrlControlId);
    if (!control) {
      errors.push(`${ownerId}: CDE verification control ${cdeBinding.mctrlControlId} does not exist`);
      continue;
    }
    if (control.kind !== 'journal_verified' || control.trackingKey !== item.key || control.expected !== cdeBinding.verificationState) {
      errors.push(`${ownerId}: CDE verification control ${cdeBinding.mctrlControlId} does not bind ${item.key} to ${cdeBinding.verificationState}`);
    }
  }

  const promotionJournalKey = matrix.promotionBoundary?.promotionJournalKey;
  if (nonEmptyString(promotionJournalKey) && !currentLaneBinding.cdeKeys?.[promotionJournalKey]) {
    errors.push(`${matrix.lane}: promotion journal ${promotionJournalKey} is not governed by the external evidence binding`);
  }
}

export function verifyImplementationAncestor(implementationCommit, root) {
  if (!isSha(implementationCommit)) return ['implementationCommit is not a valid SHA'];
  try {
    execFileSync('git', ['cat-file', '-e', `${implementationCommit}^{commit}`], { cwd: root, stdio: 'ignore' });
  } catch {
    return [`implementationCommit ${implementationCommit} is unavailable in checkout history`];
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', implementationCommit, 'HEAD'], { cwd: root, stdio: 'ignore' });
  } catch {
    return [`implementationCommit ${implementationCommit} is not an ancestor of checked-out HEAD`];
  }
  return [];
}

async function fetchRun(runId, repository, token, fetchImpl, cache) {
  if (cache.has(runId)) return cache.get(runId);
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CoMind-governed-evidence-verifier',
    },
  });
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const run = await response.json();
  cache.set(runId, run);
  return run;
}

function verifyRunAgainstBinding(ownerId, runId, run, binding, repository, errors) {
  if (run.error) {
    errors.push(`${ownerId}: github_run ${runId} could not be verified: ${run.error}`);
    return;
  }
  const observedRepository = run.repository?.full_name;
  if (observedRepository !== repository) {
    errors.push(`${ownerId}: github_run ${runId} repository mismatch: ${observedRepository ?? 'missing'}`);
  }
  if (run.status !== 'completed') errors.push(`${ownerId}: github_run ${runId} is not completed`);
  if (run.conclusion !== binding.conclusion) {
    errors.push(`${ownerId}: github_run ${runId} conclusion mismatch: expected ${binding.conclusion}, observed ${run.conclusion ?? 'missing'}`);
  }
  if (run.head_sha !== binding.expectedHeadSha) {
    errors.push(`${ownerId}: github_run ${runId} head SHA mismatch: expected ${binding.expectedHeadSha}, observed ${run.head_sha ?? 'missing'}`);
  }
  if (run.path !== binding.workflowPath) {
    errors.push(`${ownerId}: github_run ${runId} workflow mismatch: expected ${binding.workflowPath}, observed ${run.path ?? 'missing'}`);
  }
  if (run.event !== binding.event) {
    errors.push(`${ownerId}: github_run ${runId} event mismatch: expected ${binding.event}, observed ${run.event ?? 'missing'}`);
  }
}

export async function verifyGitHubRunReferences(matrix, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const errors = [];
  let bindings;
  let currentLaneBinding;
  try {
    ({ bindings, laneBinding: currentLaneBinding } = laneBinding(options.repoRoot ?? process.cwd(), matrix.lane));
  } catch (error) {
    return [`unable to load governed external evidence bindings: ${error.message}`];
  }
  const repository = options.repository ?? bindings.repository;

  if (!nonEmptyString(repository)) return ['GitHub evidence verification requires repository'];
  if (!nonEmptyString(token)) return ['GitHub evidence verification requires GITHUB_TOKEN'];
  if (typeof fetchImpl !== 'function') return ['GitHub evidence verification requires fetch implementation'];
  if (!currentLaneBinding) return [`no governed external evidence binding exists for ${matrix.lane}`];

  const cache = new Map();
  const referenced = evidenceArrays(matrix).filter(({ evidence }) => evidence?.type === 'github_run');
  for (const { ownerId, evidence } of referenced) {
    if (!Number.isInteger(evidence.runId) || evidence.runId <= 0) continue;
    const binding = currentLaneBinding.githubRuns?.[String(evidence.runId)];
    if (!binding) continue;
    const run = await fetchRun(evidence.runId, repository, token, fetchImpl, cache);
    verifyRunAgainstBinding(ownerId, evidence.runId, run, binding, repository, errors);
  }

  for (const runId of currentLaneBinding.finalAcceptanceRunIds ?? []) {
    const binding = currentLaneBinding.githubRuns?.[String(runId)];
    if (!binding) continue;
    const run = await fetchRun(runId, repository, token, fetchImpl, cache);
    verifyRunAgainstBinding('final acceptance', runId, run, binding, repository, errors);
  }
  return errors;
}
