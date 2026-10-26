import { execFile as execFileCallback } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const TRANSIENT_SIGNAL_KIND = 'comind_transient_retry_signal';
export const TRANSIENT_SIGNAL_SCHEMA_VERSION = 1;
export const TRANSIENT_SIGNAL_FILENAME = 'lane-health-transient-signal.json';
export const TRANSIENT_SIGNAL_ARTIFACT_PREFIX = 'lane-health-transient-signal-attempt-';

const REVIEWED_TRANSIENT_CLASSES = new Map([
  ['resource_timeout', new Set([124])],
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

function rejection(reason) {
  return { accepted: false, reason };
}

export function validateStructuredTransientSignal({ signal, context, workflowRun }) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
    return rejection('Structured transient signal is missing or not an object.');
  }
  if (!context || !workflowRun) {
    return rejection('Signal validation requires exact workflow context and current run evidence.');
  }
  if (signal.schemaVersion !== TRANSIENT_SIGNAL_SCHEMA_VERSION) {
    return rejection('Structured transient signal schema version is not supported.');
  }
  if (signal.kind !== TRANSIENT_SIGNAL_KIND) {
    return rejection('Structured transient signal kind is not recognized.');
  }
  if (signal.producer !== 'comind_transient_wrapper_v1') {
    return rejection('Structured transient signal producer is not the reviewed wrapper contract.');
  }
  if (signal.retrySafe !== true) {
    return rejection('Structured transient signal did not explicitly declare retrySafe=true.');
  }

  const runId = positiveInteger(signal.runId);
  const runAttempt = positiveInteger(signal.runAttempt);
  const exitCode = Number(signal.exitCode);
  if (!runId || !runAttempt || !Number.isInteger(exitCode)) {
    return rejection('Structured transient signal run identity, attempt, or exit code is invalid.');
  }

  if (runId !== Number(context.runId) || runId !== Number(workflowRun.id)) {
    return rejection('Structured transient signal run ID does not match exact workflow evidence.');
  }
  if (runAttempt !== Number(workflowRun.run_attempt)) {
    return rejection('Structured transient signal attempt does not match the current workflow attempt.');
  }
  if (signal.headSha !== context.exactHeadSha || workflowRun.head_sha !== context.exactHeadSha) {
    return rejection('Structured transient signal head SHA does not match the exact PR head.');
  }
  if (signal.workflow !== context.workflow || workflowRun.name !== context.workflow) {
    return rejection('Structured transient signal workflow name does not match exact workflow evidence.');
  }
  if (signal.event !== 'pull_request' || workflowRun.event !== 'pull_request') {
    return rejection('Structured transient signal is not bound to a pull-request execution.');
  }
  if (workflowRun.status !== 'completed' || workflowRun.conclusion !== 'failure') {
    return rejection('Structured transient signal may only explain a completed generic failure.');
  }
  if (typeof signal.step !== 'string' || signal.step.trim().length === 0) {
    return rejection('Structured transient signal must identify the failing step.');
  }

  const allowedExitCodes = REVIEWED_TRANSIENT_CLASSES.get(signal.classification);
  if (!allowedExitCodes) {
    return rejection(`Structured transient classification ${signal.classification || 'unknown'} is not reviewed as retry-safe.`);
  }
  if (!allowedExitCodes.has(exitCode)) {
    return rejection(`Exit code ${exitCode} is not reviewed for transient class ${signal.classification}.`);
  }

  return {
    accepted: true,
    reason: `Reviewed structured transient signal ${signal.classification} with exit code ${exitCode}.`,
    signal: {
      validated: true,
      schemaVersion: TRANSIENT_SIGNAL_SCHEMA_VERSION,
      kind: TRANSIENT_SIGNAL_KIND,
      producer: signal.producer,
      classification: signal.classification,
      exitCode,
      runId,
      runAttempt,
      headSha: signal.headSha,
      workflow: signal.workflow,
      event: signal.event,
      step: signal.step,
    },
  };
}

export function createGitHubJsonClient({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const base = apiUrl.replace(/\/$/, '');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'comind-lane-health-sentinel',
  };

  return async function getJson(path) {
    const response = await fetchImpl(`${base}${path}`, { method: 'GET', headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status} for ${path}: ${body.slice(0, 500)}`);
    }
    return response.json();
  };
}

export function createGitHubArtifactSignalLoader({
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  execFileImpl = execFile,
}) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const base = apiUrl.replace(/\/$/, '');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'comind-lane-health-sentinel',
  };

  return async function loadSignal({ repositoryFullName, runId, runAttempt }) {
    const encodedRepo = encodedRepository(repositoryFullName);
    const artifactName = `${TRANSIENT_SIGNAL_ARTIFACT_PREFIX}${runAttempt}`;
    const listResponse = await fetchImpl(
      `${base}/repos/${encodedRepo}/actions/runs/${runId}/artifacts?per_page=100`,
      { method: 'GET', headers }
    );
    if (!listResponse.ok) {
      const body = await listResponse.text();
      throw new Error(`GitHub API ${listResponse.status} listing transient artifacts: ${body.slice(0, 500)}`);
    }
    const payload = await listResponse.json();
    const matches = (payload.artifacts || []).filter(
      (artifact) => artifact.name === artifactName && !artifact.expired
    );
    if (matches.length === 0) return null;
    if (matches.length !== 1) {
      throw new Error(`Expected at most one ${artifactName} artifact, found ${matches.length}.`);
    }

    const artifact = matches[0];
    const downloadResponse = await fetchImpl(artifact.archive_download_url, {
      method: 'GET',
      headers,
      redirect: 'follow',
    });
    if (!downloadResponse.ok) {
      const body = await downloadResponse.text();
      throw new Error(`GitHub API ${downloadResponse.status} downloading transient artifact: ${body.slice(0, 500)}`);
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'comind-transient-signal-'));
    const archivePath = join(temporaryDirectory, 'signal.zip');
    try {
      await writeFile(archivePath, Buffer.from(await downloadResponse.arrayBuffer()));
      const { stdout } = await execFileImpl(
        'unzip',
        ['-p', archivePath, TRANSIENT_SIGNAL_FILENAME],
        { maxBuffer: 1024 * 1024 }
      );
      return {
        signal: JSON.parse(stdout),
        artifact: {
          id: Number(artifact.id),
          name: artifact.name,
          runId: Number(runId),
        },
      };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

export async function enrichBackgroundBundleWithStructuredSignals({
  bundle,
  repositoryFullName,
  getJson,
  loadSignal,
}) {
  if (!bundle || !Array.isArray(bundle.snapshots)) {
    throw new Error('Background bundle snapshots are required.');
  }
  if (!repositoryFullName) throw new Error('repositoryFullName is required.');
  if (typeof getJson !== 'function') throw new Error('getJson is required.');
  if (typeof loadSignal !== 'function') throw new Error('loadSignal is required.');

  const encodedRepo = encodedRepository(repositoryFullName);
  let acceptedCount = 0;
  let rejectedCount = 0;

  const snapshots = [];
  for (const snapshot of bundle.snapshots) {
    const workflowResults = [];
    for (const workflowResult of snapshot.workflowResults || []) {
      const eligibleForReview =
        workflowResult.state === 'terminal_failure' &&
        workflowResult.allowTransientRetrigger === true &&
        workflowResult.runId &&
        workflowResult.observedHeadSha === snapshot.exactHeadSha &&
        workflowResult.runEvent === 'pull_request';

      if (!eligibleForReview) {
        workflowResults.push(workflowResult);
        continue;
      }

      const workflowRun = await getJson(
        `/repos/${encodedRepo}/actions/runs/${Number(workflowResult.runId)}`
      );
      const runAttempt = positiveInteger(workflowRun?.run_attempt);
      if (!runAttempt) {
        rejectedCount += 1;
        workflowResults.push({
          ...workflowResult,
          structuredTransientReview: {
            accepted: false,
            reason: 'Current workflow run attempt is missing or invalid.',
          },
        });
        continue;
      }

      let loaded = null;
      try {
        loaded = await loadSignal({
          repositoryFullName,
          runId: Number(workflowResult.runId),
          runAttempt,
        });
      } catch (error) {
        rejectedCount += 1;
        workflowResults.push({
          ...workflowResult,
          structuredTransientReview: {
            accepted: false,
            reason: `Structured transient artifact could not be reviewed: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
        continue;
      }

      if (!loaded?.signal) {
        workflowResults.push(workflowResult);
        continue;
      }

      const review = validateStructuredTransientSignal({
        signal: loaded.signal,
        context: {
          runId: Number(workflowResult.runId),
          exactHeadSha: snapshot.exactHeadSha,
          workflow: workflowResult.workflow,
        },
        workflowRun,
      });

      if (!review.accepted) {
        rejectedCount += 1;
        workflowResults.push({
          ...workflowResult,
          structuredTransientReview: review,
        });
        continue;
      }

      acceptedCount += 1;
      workflowResults.push({
        ...workflowResult,
        originalState: workflowResult.state,
        state: 'structured_transient_failure',
        reason: review.reason,
        structuredTransientSignal: {
          ...review.signal,
          artifactId: loaded.artifact?.id || null,
          artifactName: loaded.artifact?.name || null,
        },
        structuredTransientReview: {
          accepted: true,
          reason: review.reason,
        },
      });
    }
    snapshots.push({ ...snapshot, workflowResults });
  }

  return {
    ...bundle,
    schemaVersion: bundle.schemaVersion || 1,
    structuredTransientReview: {
      schemaVersion: 1,
      acceptedCount,
      rejectedCount,
      reviewer: 'trusted_default_branch',
    },
    snapshots,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryFullName = args.repository || process.env.GITHUB_REPOSITORY;
  const bundlePath = resolve(args.bundle || 'artifacts/background/lane-health-background.json');
  const outputPath = resolve(args.output || 'artifacts/background/lane-health-background-enriched.json');
  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');

  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const token = process.env.GITHUB_TOKEN;
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const getJson = createGitHubJsonClient({ token, apiUrl });
  const loadSignal = createGitHubArtifactSignalLoader({ token, apiUrl });
  const enriched = await enrichBackgroundBundleWithStructuredSignals({
    bundle,
    repositoryFullName,
    getJson,
    loadSignal,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    kind: enriched.kind,
    acceptedStructuredTransientSignals: enriched.structuredTransientReview.acceptedCount,
    rejectedStructuredTransientSignals: enriched.structuredTransientReview.rejectedCount,
    outputPath,
  })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
