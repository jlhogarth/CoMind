import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

export const SENTINEL_COMMENT_MARKER = '<!-- comind-lane-health-sentinel:v1';

function encodedRepository(repositoryFullName) {
  const [owner, repo] = repositoryFullName.split('/');
  if (!owner || !repo) throw new Error('repositoryFullName must be owner/repository.');
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function marker({ state, fingerprint }) {
  return `${SENTINEL_COMMENT_MARKER} state=${state} fingerprint=${fingerprint} -->`;
}

export function parseSentinelMarker(body = '') {
  const match = body.match(/<!-- comind-lane-health-sentinel:v1 state=([^\s]+) fingerprint=([^\s]+) -->/);
  if (!match) return null;
  return { state: match[1], fingerprint: match[2] };
}

function evidenceLine(label, url) {
  return url ? `  - ${label}: ${url}` : null;
}

export function renderSentinelComment(snapshot) {
  if (!snapshot?.exactHeadSha || !snapshot?.laneSummary) {
    throw new Error('snapshot is incomplete.');
  }

  if (snapshot.laneSummary.attentionRequired) {
    const fingerprint = snapshot.laneSummary.alertFingerprint;
    if (!fingerprint) throw new Error('attention snapshot requires an alert fingerprint.');

    const lines = [
      '## CoMind Lane Health Sentinel',
      '',
      '**Status: Attention required**',
      '',
      `- Exact head: \`${snapshot.exactHeadSha}\``,
      `- Lane state: \`${snapshot.laneSummary.state}\``,
      `- Severity: \`${snapshot.laneSummary.severity}\``,
    ];

    for (const escalation of snapshot.escalations || []) {
      lines.push(
        '',
        `### ${escalation.workflow}`,
        `- State: \`${escalation.workflowState}\``,
        `- Reason: ${escalation.workflowReason}`
      );
      for (const line of [
        evidenceLine('Run', escalation.runUrl),
        evidenceLine('Job', escalation.jobUrl),
      ].filter(Boolean)) {
        lines.push(line);
      }
      if (escalation.stepName) {
        lines.push(`  - Step ${escalation.stepNumber ?? '?'}: \`${escalation.stepName}\` (${escalation.stepConclusion || escalation.stepStatus || 'unknown'})`);
      }
    }

    lines.push(
      '',
      'Notification authority only. This comment does not authorize rerun, merge, branch mutation, CI weakening, database/security mutation, deployment, credential action, or paid-resource use.',
      '',
      marker({ state: 'attention_required', fingerprint })
    );

    return {
      state: 'attention_required',
      fingerprint,
      body: `${lines.join('\n')}\n`,
    };
  }

  const fingerprint = `resolved:${snapshot.exactHeadSha}`;
  const lines = [
    '## CoMind Lane Health Sentinel',
    '',
    '**Status: Resolved**',
    '',
    `- Exact head: \`${snapshot.exactHeadSha}\``,
    `- Lane state: \`${snapshot.laneSummary.state}\``,
    `- Severity: \`${snapshot.laneSummary.severity}\``,
    '',
    'No current critical lane-health condition is present for this exact head.',
    '',
    'Notification authority only. No remediation authority is implied.',
    '',
    marker({ state: 'resolved', fingerprint }),
  ];

  return {
    state: 'resolved',
    fingerprint,
    body: `${lines.join('\n')}\n`,
  };
}

export function planSentinelNotification({ snapshot, comments = [] }) {
  const rendered = renderSentinelComment(snapshot);
  const existing = comments.find((comment) => parseSentinelMarker(comment.body));

  if (!snapshot.laneSummary.attentionRequired && !existing) {
    return {
      action: 'noop',
      reason: 'healthy_without_prior_alert',
      state: rendered.state,
      fingerprint: rendered.fingerprint,
      body: rendered.body,
      commentId: null,
    };
  }

  if (!existing) {
    return {
      action: 'create',
      reason: 'new_attention_transition',
      state: rendered.state,
      fingerprint: rendered.fingerprint,
      body: rendered.body,
      commentId: null,
    };
  }

  const existingMarker = parseSentinelMarker(existing.body);
  if (
    existingMarker?.state === rendered.state &&
    existingMarker?.fingerprint === rendered.fingerprint
  ) {
    return {
      action: 'noop',
      reason: 'unchanged_fingerprint',
      state: rendered.state,
      fingerprint: rendered.fingerprint,
      body: rendered.body,
      commentId: existing.id,
    };
  }

  return {
    action: 'update',
    reason: snapshot.laneSummary.attentionRequired ? 'attention_transition' : 'recovery_transition',
    state: rendered.state,
    fingerprint: rendered.fingerprint,
    body: rendered.body,
    commentId: existing.id,
  };
}

export function createGitHubMutationClient({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const root = apiUrl.replace(/\/$/, '');

  return async function request(path, { method = 'GET', body = null } = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'comind-lane-health-notifier',
      },
      body: body === null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API ${response.status} ${method} ${path}: ${text.slice(0, 500)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };
}

async function listAllIssueComments({ request, encodedRepo, prNumber }) {
  const comments = [];
  for (let page = 1; page <= 50; page += 1) {
    const batch = await request(
      `/repos/${encodedRepo}/issues/${prNumber}/comments?per_page=100&page=${page}`
    );
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw new Error(`Issue #${prNumber} has more than 5000 comments; notification lookup failed closed.`);
}

export async function applySentinelNotifications({ repositoryFullName, bundle, request }) {
  if (!repositoryFullName) throw new Error('repositoryFullName is required.');
  if (!bundle?.snapshots || !Array.isArray(bundle.snapshots)) throw new Error('bundle snapshots are required.');
  if (typeof request !== 'function') throw new Error('request is required.');

  const encodedRepo = encodedRepository(repositoryFullName);
  const decisions = [];

  for (const snapshot of bundle.snapshots) {
    const pr = await request(`/repos/${encodedRepo}/pulls/${snapshot.prNumber}`);
    if (pr?.state !== 'open') {
      decisions.push({ prNumber: snapshot.prNumber, action: 'noop', reason: 'pr_not_open' });
      continue;
    }
    if (pr?.head?.sha !== snapshot.exactHeadSha) {
      decisions.push({
        prNumber: snapshot.prNumber,
        action: 'noop',
        reason: 'stale_snapshot_head',
        snapshotHeadSha: snapshot.exactHeadSha,
        currentHeadSha: pr?.head?.sha || null,
      });
      continue;
    }

    const comments = await listAllIssueComments({ request, encodedRepo, prNumber: snapshot.prNumber });
    const plan = planSentinelNotification({ snapshot, comments });

    if (plan.action === 'create') {
      const created = await request(`/repos/${encodedRepo}/issues/${snapshot.prNumber}/comments`, {
        method: 'POST',
        body: { body: plan.body },
      });
      decisions.push({
        prNumber: snapshot.prNumber,
        action: 'create',
        reason: plan.reason,
        commentId: created.id,
        fingerprint: plan.fingerprint,
        state: plan.state,
      });
      continue;
    }

    if (plan.action === 'update') {
      const updated = await request(`/repos/${encodedRepo}/issues/comments/${plan.commentId}`, {
        method: 'PATCH',
        body: { body: plan.body },
      });
      decisions.push({
        prNumber: snapshot.prNumber,
        action: 'update',
        reason: plan.reason,
        commentId: updated.id,
        fingerprint: plan.fingerprint,
        state: plan.state,
      });
      continue;
    }

    decisions.push({
      prNumber: snapshot.prNumber,
      action: 'noop',
      reason: plan.reason,
      commentId: plan.commentId,
      fingerprint: plan.fingerprint,
      state: plan.state,
    });
  }

  return {
    schemaVersion: 1,
    kind: 'lane_health_notification_decisions',
    repository: repositoryFullName,
    sourceObservedAt: bundle.observedAt || null,
    decisions,
    authorityBoundary: 'notification_only',
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
  const inputPath = resolve(args.input || 'artifacts/lane-health-background.json');
  const outputPath = resolve(args.output || 'artifacts/lane-health-notification.json');
  if (!repositoryFullName) throw new Error('--repository or GITHUB_REPOSITORY is required.');

  const bundle = JSON.parse(await readFile(inputPath, 'utf8'));
  const request = createGitHubMutationClient({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });
  const result = await applySentinelNotifications({ repositoryFullName, bundle, request });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
