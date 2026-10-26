import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RETRY_SAFE_STATES = new Map([
  ['timed_out', 'timed_out'],
  ['terminal_startup_failure', 'startup_failure'],
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function encodedRepository(repositoryFullName) {
  const [owner, repo] = String(repositoryFullName || '').split('/');
  if (!owner || !repo) throw new Error('repositoryFullName must be owner/repository.');
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function runUrl(repositoryFullName, runId) {
  return `https://github.com/${repositoryFullName}/actions/runs/${runId}`;
}

function attemptUrl(repositoryFullName, runId, attempt) {
  return `${runUrl(repositoryFullName, runId)}/attempts/${attempt}`;
}

export function findRetryCandidates({ bundle, maxAutoRetriggers = 1 }) {
  if (!bundle || !Array.isArray(bundle.snapshots)) {
    throw new Error('Background bundle snapshots are required.');
  }
  if (Number(maxAutoRetriggers) !== 1) {
    throw new Error('Lane Health Sentinel automatic retry ceiling must remain exactly one.');
  }

  const candidates = [];
  for (const snapshot of bundle.snapshots) {
    if (!snapshot?.exactHeadSha || !Number.isInteger(snapshot.prNumber)) continue;
    for (const workflowResult of snapshot.workflowResults || []) {
      const transientConclusion = RETRY_SAFE_STATES.get(workflowResult.state);
      if (!transientConclusion) continue;
      if (!workflowResult.allowTransientRetrigger) continue;
      if (!workflowResult.runId) continue;
      if (workflowResult.observedHeadSha !== snapshot.exactHeadSha) continue;
      if (workflowResult.runEvent !== 'pull_request') continue;

      candidates.push({
        prNumber: snapshot.prNumber,
        exactHeadSha: snapshot.exactHeadSha,
        workflow: workflowResult.workflow,
        state: workflowResult.state,
        transientConclusion,
        runId: Number(workflowResult.runId),
        runUrl: workflowResult.runUrl || runUrl(bundle.repository, workflowResult.runId),
        reason: workflowResult.reason,
      });
    }
  }
  return candidates;
}

export function planRetryAgainstCurrentEvidence({
  candidate,
  pullRequest,
  workflowRun,
  maxAutoRetriggers = 1,
}) {
  if (Number(maxAutoRetriggers) !== 1) {
    return { action: 'reject', reason: 'Automatic retry ceiling is not exactly one.' };
  }
  if (!candidate || !pullRequest || !workflowRun) {
    return { action: 'reject', reason: 'Candidate, pull request, and workflow run evidence are required.' };
  }
  if (pullRequest.state !== 'open') {
    return { action: 'noop', reason: 'Pull request is no longer open.' };
  }
  if (pullRequest.head?.sha !== candidate.exactHeadSha) {
    return { action: 'reject_stale', reason: 'Pull request head moved after the background observation.' };
  }
  if (Number(workflowRun.id) !== Number(candidate.runId)) {
    return { action: 'reject', reason: 'Workflow run identity changed.' };
  }
  if (workflowRun.head_sha !== candidate.exactHeadSha) {
    return { action: 'reject_stale', reason: 'Workflow run belongs to a different head.' };
  }
  if (workflowRun.name !== candidate.workflow) {
    return { action: 'reject', reason: 'Workflow name does not match the observed candidate.' };
  }
  if (workflowRun.event !== 'pull_request') {
    return { action: 'reject', reason: 'Only pull-request workflow executions may be retriggered automatically.' };
  }
  if (workflowRun.status !== 'completed') {
    return { action: 'noop', reason: 'Workflow run is no longer terminal.' };
  }
  if (workflowRun.conclusion !== candidate.transientConclusion) {
    return { action: 'noop', reason: 'Current workflow conclusion is no longer the approved transient class.' };
  }

  const runAttempt = positiveInteger(workflowRun.run_attempt);
  if (!runAttempt) {
    return { action: 'reject', reason: 'Workflow run attempt is missing or invalid.' };
  }
  if (runAttempt !== 1) {
    return {
      action: 'noop',
      reason: 'Automatic retry ceiling already consumed for this workflow run.',
      runAttempt,
    };
  }

  return {
    action: 'rerun',
    runAttempt,
    retryAttempt: 2,
    reason: `Retry-safe transient conclusion ${candidate.transientConclusion} on exact head attempt 1.`,
  };
}

export function createGitHubRequestClient({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  return async function request(path, { method = 'GET' } = {}) {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'comind-lane-health-sentinel',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} ${method} ${path}: ${text.slice(0, 500)}`);
    }
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
    };
  };
}

export async function executeRetryFromBundle({
  bundle,
  policy,
  repositoryFullName,
  request,
  now = new Date(),
}) {
  if (!repositoryFullName) throw new Error('repositoryFullName is required.');
  if (typeof request !== 'function') throw new Error('request is required.');
  const maxAutoRetriggers = Number(policy?.defaults?.maxAutoRetriggers);
  if (maxAutoRetriggers !== 1) {
    throw new Error('policy.defaults.maxAutoRetriggers must be exactly 1.');
  }

  const encodedRepo = encodedRepository(repositoryFullName);
  const candidates = findRetryCandidates({ bundle, maxAutoRetriggers });
  const outcomes = [];
  let rerunRequested = false;

  for (const candidate of candidates) {
    if (rerunRequested) {
      outcomes.push({
        ...candidate,
        action: 'noop',
        reason: 'A prior candidate already consumed this executor invocation retry slot.',
      });
      continue;
    }

    const [pullResponse, runResponse] = await Promise.all([
      request(`/repos/${encodedRepo}/pulls/${candidate.prNumber}`),
      request(`/repos/${encodedRepo}/actions/runs/${candidate.runId}`),
    ]);
    const plan = planRetryAgainstCurrentEvidence({
      candidate,
      pullRequest: pullResponse.data,
      workflowRun: runResponse.data,
      maxAutoRetriggers,
    });

    if (plan.action !== 'rerun') {
      outcomes.push({ ...candidate, ...plan });
      continue;
    }

    const rerunResponse = await request(
      `/repos/${encodedRepo}/actions/runs/${candidate.runId}/rerun`,
      { method: 'POST' }
    );
    rerunRequested = true;
    outcomes.push({
      ...candidate,
      action: 'rerun_requested',
      originalAttempt: plan.runAttempt,
      retryAttempt: plan.retryAttempt,
      retryCount: 1,
      retryReason: plan.reason,
      requestedAt: now.toISOString(),
      requestStatus: rerunResponse.status,
      retryAttemptUrl: attemptUrl(repositoryFullName, candidate.runId, plan.retryAttempt),
      authorityBoundary: 'rerun_only',
    });
  }

  return {
    schemaVersion: 1,
    kind: 'lane_health_retry_outcomes',
    repository: repositoryFullName,
    observedAt: now.toISOString(),
    candidateCount: candidates.length,
    rerunRequested,
    outcomes,
    authorityBoundary: 'rerun_only',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryFullName = args.repository || process.env.GITHUB_REPOSITORY;
  const bundlePath = resolve(args.bundle || 'artifacts/background/lane-health-background.json');
  const policyPath = resolve(args.policy || '.github/lane-health-sentinel.json');
  const outputPath = resolve(args.output || 'artifacts/lane-health-retry.json');
  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');

  const [bundleText, policyText] = await Promise.all([
    readFile(bundlePath, 'utf8'),
    readFile(policyPath, 'utf8'),
  ]);
  const bundle = JSON.parse(bundleText);
  const policy = JSON.parse(policyText);
  const request = createGitHubRequestClient({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });
  const result = await executeRetryFromBundle({
    bundle,
    policy,
    repositoryFullName,
    request,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
