import { readFile } from 'node:fs/promises';

export const SENTINEL_COMMENT_MARKER = '<!-- comind-lane-health-sentinel -->';
const METADATA_PREFIX = '<!-- comind-lane-health-meta:';
const METADATA_SUFFIX = ' -->';

function encodeMetadata(metadata) {
  return `${METADATA_PREFIX}${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url')}${METADATA_SUFFIX}`;
}

export function extractCommentMetadata(body = '') {
  const start = body.indexOf(METADATA_PREFIX);
  if (start < 0) return null;
  const encodedStart = start + METADATA_PREFIX.length;
  const end = body.indexOf(METADATA_SUFFIX, encodedStart);
  if (end < 0) return null;
  try {
    return JSON.parse(Buffer.from(body.slice(encodedStart, end), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function primaryEscalation(snapshot) {
  return Array.isArray(snapshot.escalations) && snapshot.escalations.length > 0
    ? snapshot.escalations[0]
    : null;
}

function directEvidenceLines(escalation) {
  if (!escalation) return [];
  const lines = [];
  if (escalation.runUrl) lines.push(`- Workflow run: ${escalation.runUrl}`);
  if (escalation.jobUrl) lines.push(`- Job: ${escalation.jobUrl}`);
  if (escalation.stepName) {
    lines.push(`- Focal step: \`${escalation.stepName}\`${escalation.stepNumber ? ` (#${escalation.stepNumber})` : ''}`);
  }
  return lines;
}

export function renderSentinelComment({ snapshot, resolved = false }) {
  const escalation = primaryEscalation(snapshot);
  const fingerprint = resolved
    ? `resolved:${snapshot.exactHeadSha}`
    : snapshot.laneSummary?.alertFingerprint;

  if (!fingerprint) throw new Error('A notification fingerprint is required.');

  const metadata = {
    schemaVersion: 1,
    fingerprint,
    exactHeadSha: snapshot.exactHeadSha,
    state: resolved ? 'resolved' : snapshot.laneSummary.state,
    updatedAt: snapshot.observedAt,
  };

  const lines = [
    SENTINEL_COMMENT_MARKER,
    encodeMetadata(metadata),
    '## CoMind Lane Health Sentinel',
    '',
    `- Exact head: \`${snapshot.exactHeadSha}\``,
    `- State: \`${resolved ? 'resolved' : snapshot.laneSummary.state}\``,
    `- Severity: \`${resolved ? 'ok' : snapshot.laneSummary.severity}\``,
  ];

  if (resolved) {
    lines.push(
      '- Attention required: `false`',
      '',
      'The previously reported lane-health condition is no longer present on the current exact head.'
    );
  } else {
    lines.push(
      '- Attention required: `true`',
      `- Workflow: \`${escalation?.workflow || 'unknown'}\``,
      `- Condition: \`${escalation?.workflowState || 'unknown'}\``,
      '',
      escalation?.workflowReason || 'Lane-health evidence requires operator attention.',
      '',
      ...directEvidenceLines(escalation),
      '',
      `Recommended action: ${escalation?.recommendedAction || 'Inspect the linked evidence before remediation.'}`
    );
  }

  lines.push(
    '',
    'Notification authority only. This comment does not imply rerun, merge, branch-write, deployment, database, secret-management, or paid-resource authority.'
  );

  return `${lines.join('\n')}\n`;
}

export function planNotification({ snapshot, existingComment = null, currentHeadSha }) {
  if (!snapshot?.exactHeadSha) throw new Error('snapshot.exactHeadSha is required.');
  if (!currentHeadSha) throw new Error('currentHeadSha is required.');
  if (snapshot.exactHeadSha !== currentHeadSha) {
    return { action: 'reject_stale', reason: 'Snapshot exact head does not match current PR head.' };
  }

  const existingMetadata = existingComment ? extractCommentMetadata(existingComment.body) : null;
  const attentionRequired = Boolean(snapshot.laneSummary?.attentionRequired);

  if (attentionRequired) {
    const fingerprint = snapshot.laneSummary?.alertFingerprint;
    if (!fingerprint) throw new Error('Attention state requires alertFingerprint.');
    if (existingMetadata?.fingerprint === fingerprint && existingMetadata?.exactHeadSha === currentHeadSha) {
      return { action: 'noop', reason: 'Unchanged alert fingerprint.' };
    }
    return {
      action: existingComment ? 'update' : 'create',
      body: renderSentinelComment({ snapshot, resolved: false }),
      fingerprint,
    };
  }

  if (!existingComment) {
    return { action: 'noop', reason: 'Healthy lane has no prior sentinel comment to resolve.' };
  }

  const resolvedFingerprint = `resolved:${currentHeadSha}`;
  if (existingMetadata?.fingerprint === resolvedFingerprint) {
    return { action: 'noop', reason: 'Resolution already recorded for this exact head.' };
  }

  return {
    action: 'update',
    body: renderSentinelComment({ snapshot, resolved: true }),
    fingerprint: resolvedFingerprint,
  };
}

async function githubJson(url, { token, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'comind-lane-health-sentinel',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function findExistingComment({ apiBase, repository, prNumber, token }) {
  const comments = await githubJson(`${apiBase}/repos/${repository}/issues/${prNumber}/comments?per_page=100`, { token });
  return comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(SENTINEL_COMMENT_MARKER)) || null;
}

export async function notifyFromBundle({ bundle, repository, token, apiBase = 'https://api.github.com' }) {
  if (!bundle || !Array.isArray(bundle.snapshots)) throw new Error('Background bundle snapshots are required.');
  const outcomes = [];

  for (const snapshot of bundle.snapshots) {
    const pull = await githubJson(`${apiBase}/repos/${repository}/pulls/${snapshot.prNumber}`, { token });
    if (pull.state !== 'open') {
      outcomes.push({ prNumber: snapshot.prNumber, action: 'noop', reason: 'Pull request is not open.' });
      continue;
    }

    const existingComment = await findExistingComment({ apiBase, repository, prNumber: snapshot.prNumber, token });
    const plan = planNotification({
      snapshot,
      existingComment,
      currentHeadSha: pull.head.sha,
    });

    if (plan.action === 'reject_stale') {
      outcomes.push({ prNumber: snapshot.prNumber, ...plan });
      continue;
    }
    if (plan.action === 'noop') {
      outcomes.push({ prNumber: snapshot.prNumber, ...plan });
      continue;
    }

    if (plan.action === 'create') {
      const created = await githubJson(`${apiBase}/repos/${repository}/issues/${snapshot.prNumber}/comments`, {
        token,
        method: 'POST',
        body: { body: plan.body },
      });
      outcomes.push({ prNumber: snapshot.prNumber, action: 'created', commentId: created.id, fingerprint: plan.fingerprint });
      continue;
    }

    const updated = await githubJson(`${apiBase}/repos/${repository}/issues/comments/${existingComment.id}`, {
      token,
      method: 'PATCH',
      body: { body: plan.body },
    });
    outcomes.push({ prNumber: snapshot.prNumber, action: 'updated', commentId: updated.id, fingerprint: plan.fingerprint });
  }

  return outcomes;
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
  }
  const bundlePath = args.get('--bundle');
  const repository = args.get('--repository') || process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!bundlePath || !repository || !token) {
    throw new Error('--bundle, --repository/GITHUB_REPOSITORY, and GITHUB_TOKEN are required.');
  }
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const outcomes = await notifyFromBundle({ bundle, repository, token });
  process.stdout.write(`${JSON.stringify({ kind: 'lane_health_notification_outcomes', outcomes })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
