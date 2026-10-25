import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { classifyWorkflowHealth } from './lane_health_sentinel.mjs';
import { summarizeLaneHealth } from './lane_health_summary.mjs';
import {
  buildEscalationPayload,
  normalizeJobEvidence,
  selectPrimaryJobEvidence,
} from './lane_health_evidence.mjs';

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function newestTimestamp(values) {
  const dates = values.map(parseTimestamp).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

export function latestMeaningfulTransitionAt({ run, jobs = [] }) {
  const timestamps = [run?.created_at];

  if (run?.status === 'completed') timestamps.push(run?.updated_at);

  for (const job of jobs) {
    timestamps.push(job.started_at, job.completed_at);
    for (const step of job.steps || []) {
      timestamps.push(step.started_at, step.completed_at);
    }
  }

  return newestTimestamp(timestamps);
}

export function successfulRunDurationSeconds(run) {
  if (run?.conclusion !== 'success') return null;
  const started = parseTimestamp(run.run_started_at || run.created_at);
  const ended = parseTimestamp(run.updated_at);
  if (!started || !ended || ended < started) return null;
  const seconds = Math.floor((ended.getTime() - started.getTime()) / 1000);
  return seconds > 0 ? seconds : null;
}

export function isBotLogin(login) {
  if (!login) return false;
  return /\[bot\]$/i.test(login) || /(^|[-_])bot$/i.test(login);
}

export function selectGovernedWorkflows({ policy, exactHeadRuns }) {
  const runNames = new Set((exactHeadRuns || []).map((run) => run.name).filter(Boolean));
  return policy.workflows.filter(
    (workflow) => workflow.requiredForAllPullRequests || runNames.has(workflow.name)
  );
}

export function selectLatestRunByWorkflow(runs, expectedHeadSha) {
  const latest = new Map();
  for (const run of runs || []) {
    if (run.head_sha !== expectedHeadSha || !run.name) continue;
    const prior = latest.get(run.name);
    const currentDate = parseTimestamp(run.created_at)?.getTime() ?? 0;
    const priorDate = parseTimestamp(prior?.created_at)?.getTime() ?? 0;
    if (!prior || currentDate > priorDate || (currentDate === priorDate && Number(run.id) > Number(prior.id))) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

export function buildRecentRuntimeSamples({ runs, sampleSize }) {
  const grouped = new Map();
  for (const run of runs || []) {
    const duration = successfulRunDurationSeconds(run);
    if (!run.name || duration === null) continue;
    const values = grouped.get(run.name) || [];
    if (values.length < sampleSize) values.push(duration);
    grouped.set(run.name, values);
  }
  return grouped;
}

export function deriveEffectiveRunStatus({ run, jobs = [] }) {
  if (!run) return null;
  if (run.status === 'completed' || run.conclusion) return run.status;

  if (jobs.some((job) => job.status === 'in_progress')) return 'in_progress';
  if (jobs.some((job) => ['queued', 'waiting', 'pending'].includes(job.status))) return 'queued';

  return run.status;
}

function workflowPolicy(policy, workflow) {
  return {
    ...policy.defaults,
    ...workflow,
  };
}

function runUrl(repositoryFullName, runId) {
  return runId ? `https://github.com/${repositoryFullName}/actions/runs/${runId}` : null;
}

function normalizeRun(repositoryFullName, run) {
  if (!run) return null;
  return {
    ...run,
    html_url: run.html_url || runUrl(repositoryFullName, run.id),
  };
}

export async function collectLaneHealthSnapshot({
  repositoryFullName,
  prNumber,
  policy,
  getJson,
  now = new Date(),
}) {
  if (!repositoryFullName) throw new Error('repositoryFullName is required.');
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('prNumber must be a positive integer.');
  if (!policy?.workflows || !policy?.defaults) throw new Error('policy is invalid.');
  if (typeof getJson !== 'function') throw new Error('getJson is required.');

  const [owner, repo] = repositoryFullName.split('/');
  if (!owner || !repo) throw new Error('repositoryFullName must be owner/repository.');

  const encodedRepo = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const pr = await getJson(`/repos/${encodedRepo}/pulls/${prNumber}`);
  const expectedHeadSha = pr?.head?.sha;
  if (!expectedHeadSha) throw new Error('Pull request did not provide an exact head SHA.');

  const [headCommit, runResponse, recentResponse] = await Promise.all([
    getJson(`/repos/${encodedRepo}/commits/${encodeURIComponent(expectedHeadSha)}`),
    getJson(`/repos/${encodedRepo}/actions/runs?head_sha=${encodeURIComponent(expectedHeadSha)}&event=pull_request&per_page=100`),
    getJson(`/repos/${encodedRepo}/actions/runs?status=success&event=pull_request&per_page=100`),
  ]);

  const exactHeadRuns = (runResponse?.workflow_runs || []).filter(
    (run) => run.head_sha === expectedHeadSha
  );
  const latestRuns = selectLatestRunByWorkflow(exactHeadRuns, expectedHeadSha);
  const governedWorkflows = selectGovernedWorkflows({ policy, exactHeadRuns });
  const recentSamples = buildRecentRuntimeSamples({
    runs: recentResponse?.workflow_runs || [],
    sampleSize: Number(policy.defaults.recentSuccessSampleSize) || 5,
  });

  const headObservedAt =
    headCommit?.commit?.committer?.date ||
    headCommit?.commit?.author?.date ||
    pr?.updated_at ||
    pr?.created_at;
  if (!headObservedAt) throw new Error('Unable to determine when the exact head was observed.');

  const workflowResults = [];
  const jobEvidenceByWorkflow = new Map();

  for (const workflow of governedWorkflows) {
    const run = normalizeRun(repositoryFullName, latestRuns.get(workflow.name) || null);
    const jobs = run
      ? (await getJson(`/repos/${encodedRepo}/actions/runs/${run.id}/jobs?per_page=100`))?.jobs || []
      : [];
    const lastMeaningfulTransitionAt = run
      ? latestMeaningfulTransitionAt({ run, jobs })
      : null;
    const effectiveStatus = deriveEffectiveRunStatus({ run, jobs });
    const classificationRun = run
      ? {
          ...run,
          status: effectiveStatus,
        }
      : null;

    const result = classifyWorkflowHealth({
      expectedHeadSha,
      workflowName: workflow.name,
      policy: workflowPolicy(policy, workflow),
      run: classificationRun,
      jobs,
      recentSuccessfulDurationsSeconds: recentSamples.get(workflow.name) || [],
      headObservedAt,
      now,
      lastMeaningfulTransitionAt,
    });

    const normalizedJobs = run
      ? normalizeJobEvidence({ repositoryFullName, runId: run.id, jobs })
      : [];
    jobEvidenceByWorkflow.set(workflow.name, normalizedJobs);

    workflowResults.push({
      ...result,
      reportedRunStatus: run?.status || null,
      effectiveRunStatus: effectiveStatus,
      runConclusion: run?.conclusion || null,
      runAttempt: Number.isInteger(run?.run_attempt) ? run.run_attempt : null,
      requiredForAllPullRequests: Boolean(workflow.requiredForAllPullRequests),
      allowTransientRetrigger: Boolean(workflow.allowTransientRetrigger),
      lastMeaningfulTransitionAt,
      runActor: run?.actor?.login || run?.triggering_actor?.login || null,
      runEvent: run?.event || null,
      jobs: normalizedJobs,
    });
  }

  const prUrl = pr.html_url || `https://github.com/${repositoryFullName}/pull/${prNumber}`;
  const laneSummary = summarizeLaneHealth({
    prNumber,
    prUrl,
    expectedHeadSha,
    workflowResults,
  });

  const headActor =
    headCommit?.author?.login ||
    headCommit?.committer?.login ||
    pr?.head?.user?.login ||
    null;
  const headIsBot = isBotLogin(headActor);

  const suppressionSignals = [];
  for (const result of workflowResults) {
    if (result.state === 'action_required_zero_jobs') {
      suppressionSignals.push({
        kind: 'action_required_zero_jobs',
        workflow: result.workflow,
        runId: result.runId,
        runUrl: result.runUrl,
        actor: result.runActor,
        exactHeadSha: expectedHeadSha,
      });
    }
    if (headIsBot && result.requiredForAllPullRequests && result.state === 'expected_run_absent') {
      suppressionSignals.push({
        kind: 'bot_authored_required_run_absent',
        workflow: result.workflow,
        actor: headActor,
        exactHeadSha: expectedHeadSha,
      });
    }
  }

  const escalations = [];
  for (const result of workflowResults.filter((item) => item.severity === 'critical')) {
    const primaryJob = selectPrimaryJobEvidence(jobEvidenceByWorkflow.get(result.workflow) || []);
    escalations.push(buildEscalationPayload({
      laneSummary,
      workflowResult: result,
      primaryJob,
      authorityBoundary: 'observe_only',
      requiresHuman: true,
      recommendedAction: `Inspect ${result.workflow} evidence and diagnose ${result.state} before any rerun or remediation.`,
    }));
  }

  return {
    schemaVersion: 1,
    kind: 'github_lane_health_snapshot',
    repository: repositoryFullName,
    observedAt: now.toISOString(),
    prNumber,
    prUrl,
    exactHeadSha: expectedHeadSha,
    headObservedAt,
    headActor,
    headIsBot,
    workflowResults,
    laneSummary,
    suppressionSignals,
    escalations,
    authorityBoundary: 'observe_only',
  };
}

export function createGitHubJsonClient({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  return async function getJson(path) {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'comind-lane-health-sentinel',
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status} for ${path}: ${body.slice(0, 500)}`);
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
  const prNumber = Number(args.pr || process.env.PR_NUMBER);
  const policyPath = resolve(args.policy || '.github/lane-health-sentinel.json');
  const outputPath = resolve(args.output || 'artifacts/lane-health.json');

  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('--pr or PR_NUMBER must be a positive integer.');

  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const getJson = createGitHubJsonClient({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });
  const snapshot = await collectLaneHealthSnapshot({
    repositoryFullName,
    prNumber,
    policy,
    getJson,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    kind: snapshot.kind,
    repository: snapshot.repository,
    prNumber: snapshot.prNumber,
    exactHeadSha: snapshot.exactHeadSha,
    laneState: snapshot.laneSummary.state,
    severity: snapshot.laneSummary.severity,
    attentionRequired: snapshot.laneSummary.attentionRequired,
    suppressionSignals: snapshot.suppressionSignals.length,
    outputPath,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
