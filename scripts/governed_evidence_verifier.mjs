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

function loadMaintenanceControl(root) {
  const configPath = path.resolve(root, 'config/maintenance-control.v1.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function validateEvidenceItems(ownerId, evidence, root, errors, options = {}) {
  const items = Array.isArray(evidence) ? evidence : [];
  const implementationCommit = options.implementationCommit;
  let repoEvidenceCount = 0;
  const repoEvidencePaths = [];

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
      }
      if (!isSha(item.expectedHeadSha)) {
        errors.push(`${ownerId}: github_run requires expectedHeadSha as a 40-character lowercase SHA`);
      }
      if (!nonEmptyString(item.workflowPath) || !item.workflowPath.startsWith('.github/workflows/')) {
        errors.push(`${ownerId}: github_run requires workflowPath under .github/workflows/`);
      }
      if (!nonEmptyString(item.event)) {
        errors.push(`${ownerId}: github_run requires event`);
      }
      if (item.conclusion !== 'success') {
        errors.push(`${ownerId}: github_run evidence must require conclusion=success`);
      }
      if (item.bindsImplementation !== undefined && typeof item.bindsImplementation !== 'boolean') {
        errors.push(`${ownerId}: github_run bindsImplementation must be boolean when present`);
      }
      if (item.bindsImplementation === true && isSha(implementationCommit) && item.expectedHeadSha !== implementationCommit) {
        errors.push(`${ownerId}: implementation-bound github_run head must equal matrix implementationCommit`);
      }
    }

    if (item.type === 'cde_key') {
      if (!nonEmptyString(item.key)) errors.push(`${ownerId}: cde_key requires a non-empty key`);
      if (item.verificationState !== 'verified') {
        errors.push(`${ownerId}: cde_key requires verificationState=verified`);
      }
      if (!nonEmptyString(item.mctrlControlId)) {
        errors.push(`${ownerId}: cde_key requires mctrlControlId`);
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
  if (!nonEmptyString(matrix.repository) || !/^[^/]+\/[^/]+$/.test(matrix.repository)) {
    errors.push('repository must be an owner/name identifier');
  }
  if (!isSha(matrix.implementationCommit)) {
    errors.push('implementationCommit must be a 40-character lowercase SHA');
  }

  const evidence = evidenceArrays(matrix);
  const implementationBindings = evidence.filter(({ evidence: item }) =>
    item?.type === 'github_run' && item.bindsImplementation === true
  );
  if (implementationBindings.length === 0) {
    errors.push('at least one github_run must bind exact runtime evidence to implementationCommit');
  } else if (implementationBindings.every(({ evidence: item }) => item.expectedHeadSha !== matrix.implementationCommit)) {
    errors.push('implementation-bound github_run evidence does not match implementationCommit');
  }

  let maintenance;
  try {
    maintenance = loadMaintenanceControl(root);
  } catch (error) {
    errors.push(`unable to load maintenance control for CDE verification: ${error.message}`);
    return;
  }
  const controls = new Map((maintenance.controls ?? []).map((control) => [control.id, control]));
  for (const { ownerId, evidence: item } of evidence.filter(({ evidence: candidate }) => candidate?.type === 'cde_key')) {
    const control = controls.get(item.mctrlControlId);
    if (!control) {
      errors.push(`${ownerId}: CDE verification control ${item.mctrlControlId} does not exist`);
      continue;
    }
    if (control.kind !== 'journal_verified' || control.trackingKey !== item.key || control.expected !== item.verificationState) {
      errors.push(`${ownerId}: CDE verification control ${item.mctrlControlId} does not bind ${item.key} to ${item.verificationState}`);
    }
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

export async function verifyGitHubRunReferences(matrix, options = {}) {
  const repository = options.repository ?? matrix.repository;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const errors = [];

  if (!nonEmptyString(repository)) return ['GitHub evidence verification requires repository'];
  if (!nonEmptyString(token)) return ['GitHub evidence verification requires GITHUB_TOKEN'];
  if (typeof fetchImpl !== 'function') return ['GitHub evidence verification requires fetch implementation'];

  const entries = evidenceArrays(matrix).filter(({ evidence }) => evidence?.type === 'github_run');
  const cache = new Map();
  for (const { ownerId, evidence } of entries) {
    if (!Number.isInteger(evidence.runId) || evidence.runId <= 0) continue;
    let run = cache.get(evidence.runId);
    if (!run) {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${evidence.runId}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CoMind-governed-evidence-verifier',
        },
      });
      if (!response.ok) {
        errors.push(`${ownerId}: github_run ${evidence.runId} could not be verified: HTTP ${response.status}`);
        continue;
      }
      run = await response.json();
      cache.set(evidence.runId, run);
    }

    const observedRepository = run.repository?.full_name;
    if (observedRepository !== repository) {
      errors.push(`${ownerId}: github_run ${evidence.runId} repository mismatch: ${observedRepository ?? 'missing'}`);
    }
    if (run.status !== 'completed') {
      errors.push(`${ownerId}: github_run ${evidence.runId} is not completed`);
    }
    if (run.conclusion !== evidence.conclusion) {
      errors.push(`${ownerId}: github_run ${evidence.runId} conclusion mismatch: expected ${evidence.conclusion}, observed ${run.conclusion ?? 'missing'}`);
    }
    if (run.head_sha !== evidence.expectedHeadSha) {
      errors.push(`${ownerId}: github_run ${evidence.runId} head SHA mismatch: expected ${evidence.expectedHeadSha}, observed ${run.head_sha ?? 'missing'}`);
    }
    if (run.path !== evidence.workflowPath) {
      errors.push(`${ownerId}: github_run ${evidence.runId} workflow mismatch: expected ${evidence.workflowPath}, observed ${run.path ?? 'missing'}`);
    }
    if (run.event !== evidence.event) {
      errors.push(`${ownerId}: github_run ${evidence.runId} event mismatch: expected ${evidence.event}, observed ${run.event ?? 'missing'}`);
    }
  }
  return errors;
}
