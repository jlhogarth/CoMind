import { createHash } from 'node:crypto';

const SEVERITY_ORDER = Object.freeze({
  ok: 0,
  info: 1,
  warning: 2,
  critical: 3,
});

function severityRank(value) {
  return SEVERITY_ORDER[value] ?? SEVERITY_ORDER.warning;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stableAttentionRows(workflowResults) {
  return workflowResults
    .filter((item) => severityRank(item.severity) >= SEVERITY_ORDER.warning)
    .map((item) => ({
      workflow: item.workflow,
      state: item.state,
      severity: item.severity,
      runId: item.runId ?? null,
      runUrl: item.runUrl ?? null,
      reason: item.reason,
    }))
    .sort((a, b) => {
      const workflowCompare = a.workflow.localeCompare(b.workflow);
      if (workflowCompare !== 0) return workflowCompare;
      return a.state.localeCompare(b.state);
    });
}

export function createLaneAlertFingerprint({ expectedHeadSha, attention }) {
  if (!expectedHeadSha) throw new Error('expectedHeadSha is required.');
  if (!Array.isArray(attention)) throw new Error('attention must be an array.');
  if (attention.length === 0) return null;

  const payload = JSON.stringify({ expectedHeadSha, attention });
  return createHash('sha256').update(payload).digest('hex');
}

export function summarizeLaneHealth({
  prNumber,
  prUrl,
  expectedHeadSha,
  workflowResults,
  previousAlertFingerprint = null,
}) {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('prNumber must be a positive integer.');
  }
  if (!prUrl) throw new Error('prUrl is required.');
  if (!expectedHeadSha) throw new Error('expectedHeadSha is required.');
  if (!Array.isArray(workflowResults) || workflowResults.length === 0) {
    throw new Error('workflowResults must contain at least one workflow result.');
  }

  for (const item of workflowResults) {
    if (item.expectedHeadSha !== expectedHeadSha) {
      throw new Error(`Workflow ${item.workflow || '<unknown>'} was classified for a different head.`);
    }
  }

  const sorted = [...workflowResults].sort((a, b) => a.workflow.localeCompare(b.workflow));
  const attention = stableAttentionRows(sorted);
  const worstSeverity = sorted.reduce(
    (current, item) =>
      severityRank(item.severity) > severityRank(current) ? item.severity : current,
    'ok'
  );

  let state = 'healthy';
  if (worstSeverity === 'critical') state = 'attention_required';
  else if (worstSeverity === 'warning') state = 'degraded';
  else if (sorted.some((item) => item.severity === 'info')) state = 'in_progress';

  const alertFingerprint = createLaneAlertFingerprint({ expectedHeadSha, attention });
  const shouldNotify = alertFingerprint !== null && alertFingerprint !== previousAlertFingerprint;

  return {
    schemaVersion: 1,
    prNumber,
    prUrl,
    expectedHeadSha,
    state,
    severity: worstSeverity,
    attentionRequired: attention.length > 0,
    shouldNotify,
    alertFingerprint,
    previousAlertFingerprint,
    workflowCount: sorted.length,
    workflows: sorted,
    attention,
    evidenceUrls: unique([prUrl, ...sorted.map((item) => item.runUrl)]),
  };
}
