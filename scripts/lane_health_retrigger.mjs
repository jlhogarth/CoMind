import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RETRYABLE_STATES = Object.freeze({
  timed_out: 'timed_out',
  terminal_startup_failure: 'startup_failure',
});

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function policyByWorkflow(policy) {
  return new Map((policy?.workflows || []).map((workflow) => [workflow.name, workflow]));
}

export function assessRetryCandidate({
  snapshot,
  workflowResult,
  workflowPolicy,
  run,
  currentPullRequest,
  maxAutoRetriggers = 1,
}) {
  const base = {
    prNumber: snapshot?.prNumber ?? null,
    exactHeadSha: snapshot?.exactHeadSha ?? null,
    workflow: workflowResult?.workflow ?? null,
    workflowState: workflowResult?.state ?? null,
    runId: workflowResult?.runId ?? null,
    runUrl: workflowResult?.runUrl ?? null,
    runAttempt: run?.run_attempt ?? workflowResult?.runAttempt ?? null,
    runConclusion: run?.conclusion ?? workflowResult?.reportedRunConclusion ?? null,
    eligible: false,
    action: 'noop',
  };

  const expectedConclusion = RETRYABLE_STATES[workflowResult?.state];
  if (!expectedConclusion) {
    return { ...base, reason: `State ${workflowResult?.state || 'unknown'} is not retry-safe.` };
  }
  if (!workflowPolicy?.allowTransientRetrigger) {
    return { ...base, reason: 'Workflow policy does not allow transient retrigger.' };
  }
  if (Number(maxAutoRetriggers) !== 1) {
    return { ...base, reason: 'Only a single automatic retrigger is supported by this contract.' };
  }
  if (!workflowResult?.runId || !run) {
    return { ...base, reason: 'Exact workflow run metadata is unavailable.' };
  }
  if (!snapshot?.exactHeadSha || !currentPullRequest?.head?.sha) {
    return { ...base, reason: 'Exact PR head evidence is unavailable.' };
  }
  if (currentPullRequest.state !== 'open') {
    return { ...base, reason: 'Pull request is not open.' };
  }
  if (currentPullRequest.head.sha !== snapshot.exactHeadSha) {
    return { ...base, reason: 'Snapshot is stale relative to the current PR head.' };
  }
  if (run.head_sha !== snapshot.exactHeadSha) {
    return { ...base, reason: 'Workflow run does not belong to the exact PR head.' };
  }
  if (run.name && run.name !== workflowResult.workflow) {
    return { ...base, reason: 'Workflow run name does not match the classified workflow.' };
  }
  if (run.event !== 'pull_request') {
    return { ...base, reason: 'Only pull-request workflow runs are eligible for automatic retrigger.' };
  }
  if (run.status !== 'completed') {
    return { ...base, reason: 'Workflow run is not terminal.' };
  }
  if (run.conclusion !== expectedConclusion) {
    return { ...base, reason: `Run conclusion ${run.conclusion || 'unknown'} does not match retry-safe state ${expectedConclusion}.` };
  }
  if (Number(run.run_attempt) !== 1) {
    return { ...base, reason: 'Automatic retrigger is permitted only for run attempt 1.' };
  }

  return {
    ...base,
    runAttempt: 1,
    runConclusion: run.conclusion,
    eligible: true,
    action: 'retrigger',
    reason: `Retry-safe transient ${run.conclusion} on exact head; one automatic retrigger permitted.`,
  };
}

function relevantWorkflowResult(result) {
  return Boolean(
    result &&
    result.runId &&
    (RETRYABLE_STATES[result.state] || result.severity === 'critical' || result.severity === 'warning')
  );
}

export async function retriggerFromBundle({
  bundle,
  policy,
  repositoryFullName,
  requestGitHub,
}) {
  if (!bundle || !Array.isArray(bundle.snapshots)) throw new Error('Background bundle snapshots are required.');
  if (!policy?.defaults || !Array.isArray(policy?.workflows)) throw new Error('Sentinel policy is required.');
  if (!repositoryFullName || !repositoryFullName.includes('/')) throw new Error('repositoryFullName must be owner/repository.');
  if (typeof requestGitHub !== 'function') throw new Error('requestGitHub is required.');

  const [owner, repo] = repositoryFullName.split('/').map(encodeURIComponent);
  const policies = policyByWorkflow(policy);
  const decisions = [];

  for (const snapshot of bundle.snapshots) {
    const prNumber = positiveInteger(snapshot?.prNumber);
    if (!prNumber) continue;

    const currentPullRequest = await requestGitHub({
      method: 'GET',
      path: `/repos/${owner}/${repo}/pulls/${prNumber}`,
    });

    for (const workflowResult of (snapshot.workflowResults || []).filter(relevantWorkflowResult)) {
      const workflowPolicy = policies.get(workflowResult.workflow) || null;
      const retryableState = Boolean(RETRYABLE_STATES[workflowResult.state]);
      let run = null;

      if (retryableState && workflowResult.runId) {
        run = await requestGitHub({
          method: 'GET',
          path: `/repos/${owner}/${repo}/actions/runs/${workflowResult.runId}`,
        });
      }

      const assessment = assessRetryCandidate({
        snapshot,
        workflowResult,
        workflowPolicy,
        run,
        currentPullRequest,
        maxAutoRetriggers: policy.defaults.maxAutoRetriggers,
      });

      if (!assessment.eligible) {
        decisions.push(assessment);
        continue;
      }

      await requestGitHub({
        method: 'POST',
        path: `/repos/${owner}/${repo}/actions/runs/${workflowResult.runId}/rerun-failed-jobs`,
      });

      decisions.push({
        ...assessment,
        action: 'retriggered',
        retriggerCount: 1,
        retriggerEndpoint: `/actions/runs/${workflowResult.runId}/rerun-failed-jobs`,
      });
    }
  }

  return {
    schemaVersion: 1,
    kind: 'lane_health_transient_retrigger_record',
    repository: repositoryFullName,
    sourceBackgroundRunId: bundle.trigger?.workflowRunId ?? null,
    observedAt: new Date().toISOString(),
    authorityBoundary: 'transient_retrigger_only',
    decisions,
    retriggered: decisions.filter((decision) => decision.action === 'retriggered').length,
  };
}

export function createGitHubRequestClient({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const base = apiUrl.replace(/\/$/, '');

  return async function requestGitHub({ method = 'GET', path }) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'comind-lane-health-retrigger',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${body.slice(0, 500)}`);
    }

    if (response.status === 204 || response.status === 201) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    return response.json();
  };
}

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryFullName = args.repository || process.env.GITHUB_REPOSITORY;
  const bundlePath = resolve(args.bundle || 'artifacts/background/lane-health-background.json');
  const policyPath = resolve(args.policy || '.github/lane-health-sentinel.json');
  const outputPath = resolve(args.output || 'artifacts/lane-health-retrigger.json');

  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');

  const [bundle, policy] = await Promise.all([
    readFile(bundlePath, 'utf8').then(JSON.parse),
    readFile(policyPath, 'utf8').then(JSON.parse),
  ]);

  const requestGitHub = createGitHubRequestClient({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });

  const record = await retriggerFromBundle({
    bundle,
    policy,
    repositoryFullName,
    requestGitHub,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ kind: record.kind, retriggered: record.retriggered, decisions: record.decisions.length, outputPath })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
