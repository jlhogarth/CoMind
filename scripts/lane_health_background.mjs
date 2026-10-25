import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import {
  collectLaneHealthSnapshot,
  createGitHubJsonClient,
} from './lane_health_github.mjs';

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
  const [owner, repo] = repositoryFullName.split('/');
  if (!owner || !repo) throw new Error('repositoryFullName must be owner/repository.');
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function uniquePositiveIntegers(values) {
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

export async function resolveBackgroundPullRequests({
  eventName,
  event,
  repositoryFullName,
  getJson,
  targetPrNumber = null,
}) {
  if (targetPrNumber) return uniquePositiveIntegers([targetPrNumber]);

  if (eventName === 'pull_request_target') {
    return uniquePositiveIntegers([event?.pull_request?.number]);
  }

  const encodedRepo = encodedRepository(repositoryFullName);

  if (eventName === 'workflow_run') {
    const workflowRun = event?.workflow_run;
    if (!workflowRun || workflowRun.event !== 'pull_request') return [];

    const direct = uniquePositiveIntegers(
      (workflowRun.pull_requests || []).map((pullRequest) => pullRequest.number)
    );
    if (direct.length > 0) return direct;

    if (!workflowRun.head_sha) return [];
    const associated = await getJson(
      `/repos/${encodedRepo}/commits/${encodeURIComponent(workflowRun.head_sha)}/pulls`
    );
    return uniquePositiveIntegers(
      (associated || [])
        .filter((pullRequest) => pullRequest.state === 'open')
        .map((pullRequest) => pullRequest.number)
    );
  }

  if (eventName === 'schedule' || eventName === 'workflow_dispatch') {
    const openPullRequests = await getJson(
      `/repos/${encodedRepo}/pulls?state=open&base=main&per_page=100`
    );
    return uniquePositiveIntegers((openPullRequests || []).map((pullRequest) => pullRequest.number));
  }

  return [];
}

export async function collectBackgroundBundle({
  eventName,
  event,
  repositoryFullName,
  policy,
  getJson,
  targetPrNumber = null,
  now = new Date(),
}) {
  const prNumbers = await resolveBackgroundPullRequests({
    eventName,
    event,
    repositoryFullName,
    getJson,
    targetPrNumber,
  });

  const snapshots = [];
  for (const prNumber of prNumbers) {
    snapshots.push(await collectLaneHealthSnapshot({
      repositoryFullName,
      prNumber,
      policy,
      getJson,
      now,
    }));
  }

  return {
    schemaVersion: 1,
    kind: 'github_lane_health_background_bundle',
    repository: repositoryFullName,
    observedAt: now.toISOString(),
    trigger: {
      eventName,
      pullRequestNumber: event?.pull_request?.number || null,
      pullRequestHeadSha: event?.pull_request?.head?.sha || null,
      workflowName: event?.workflow_run?.name || null,
      workflowRunId: event?.workflow_run?.id || null,
      workflowRunStatus: event?.workflow_run?.status || null,
      workflowRunConclusion: event?.workflow_run?.conclusion || null,
      workflowRunHeadSha: event?.workflow_run?.head_sha || null,
    },
    prNumbers,
    snapshots,
    attentionRequired: snapshots.some((snapshot) => snapshot.laneSummary.attentionRequired),
    active: snapshots.some((snapshot) => snapshot.laneSummary.state === 'in_progress'),
    authorityBoundary: 'observe_only',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryFullName = args.repository || process.env.GITHUB_REPOSITORY;
  const eventName = args.event || process.env.GITHUB_EVENT_NAME;
  const eventPath = resolve(args['event-path'] || process.env.GITHUB_EVENT_PATH || 'event.json');
  const policyPath = resolve(args.policy || '.github/lane-health-sentinel.json');
  const outputPath = resolve(args.output || 'artifacts/lane-health-background.json');
  const targetPrNumber = args.pr ? Number(args.pr) : null;

  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');
  if (!eventName) throw new Error('--event or GITHUB_EVENT_NAME is required.');
  if (targetPrNumber !== null && (!Number.isInteger(targetPrNumber) || targetPrNumber <= 0)) {
    throw new Error('--pr must be a positive integer.');
  }

  const [policyText, eventText] = await Promise.all([
    readFile(policyPath, 'utf8'),
    readFile(eventPath, 'utf8'),
  ]);
  const policy = JSON.parse(policyText);
  const event = JSON.parse(eventText);
  const getJson = createGitHubJsonClient({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });

  const bundle = await collectBackgroundBundle({
    eventName,
    event,
    repositoryFullName,
    policy,
    getJson,
    targetPrNumber,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    kind: bundle.kind,
    observedAt: bundle.observedAt,
    eventName,
    prNumbers: bundle.prNumbers,
    attentionRequired: bundle.attentionRequired,
    active: bundle.active,
    outputPath,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
