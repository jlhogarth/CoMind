const TERMINAL_FAILURE_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
]);

function githubJobUrl(repositoryFullName, runId, jobId) {
  if (!repositoryFullName || !runId || !jobId) return null;
  return `https://github.com/${repositoryFullName}/actions/runs/${runId}/job/${jobId}`;
}

function selectStep(steps = []) {
  const failed = steps.find((step) => TERMINAL_FAILURE_CONCLUSIONS.has(step.conclusion));
  if (failed) return failed;

  const active = steps.find((step) => step.status === 'in_progress');
  if (active) return active;

  const pending = steps.find((step) => step.status === 'pending' || step.status === 'queued');
  if (pending) return pending;

  return [...steps].reverse().find((step) => step.status === 'completed') || null;
}

export function normalizeJobEvidence({ repositoryFullName, runId, jobs = [] }) {
  if (!repositoryFullName) throw new Error('repositoryFullName is required.');
  if (!Number.isInteger(runId) || runId <= 0) throw new Error('runId must be a positive integer.');
  if (!Array.isArray(jobs)) throw new Error('jobs must be an array.');

  return jobs
    .map((job) => {
      const focalStep = selectStep(job.steps || []);
      return {
        jobId: job.id ?? null,
        jobName: job.name || null,
        jobUrl: githubJobUrl(repositoryFullName, runId, job.id),
        status: job.status || null,
        conclusion: job.conclusion || null,
        focalStep: focalStep
          ? {
              number: focalStep.number ?? null,
              name: focalStep.name || null,
              status: focalStep.status || null,
              conclusion: focalStep.conclusion || null,
            }
          : null,
      };
    })
    .sort((a, b) => (a.jobName || '').localeCompare(b.jobName || ''));
}

export function selectPrimaryJobEvidence(jobEvidence = []) {
  if (!Array.isArray(jobEvidence)) throw new Error('jobEvidence must be an array.');

  const failed = jobEvidence.find((job) => TERMINAL_FAILURE_CONCLUSIONS.has(job.conclusion));
  if (failed) return failed;

  const active = jobEvidence.find((job) => job.status === 'in_progress');
  if (active) return active;

  const queued = jobEvidence.find(
    (job) => job.status === 'queued' || job.status === 'waiting' || job.status === 'pending'
  );
  if (queued) return queued;

  return jobEvidence.find((job) => job.conclusion === 'success') || jobEvidence[0] || null;
}

export function buildEscalationPayload({
  laneSummary,
  workflowResult,
  primaryJob = null,
  authorityBoundary = 'observe_only',
  recommendedAction,
  requiresHuman = true,
}) {
  if (!laneSummary || typeof laneSummary !== 'object') throw new Error('laneSummary is required.');
  if (!workflowResult || typeof workflowResult !== 'object') {
    throw new Error('workflowResult is required.');
  }
  if (!recommendedAction) throw new Error('recommendedAction is required.');

  if (workflowResult.expectedHeadSha !== laneSummary.expectedHeadSha) {
    throw new Error('workflowResult and laneSummary must reference the same exact head.');
  }

  return {
    schemaVersion: 1,
    kind: 'lane_health_escalation',
    prNumber: laneSummary.prNumber,
    prUrl: laneSummary.prUrl,
    exactHeadSha: laneSummary.expectedHeadSha,
    laneState: laneSummary.state,
    laneSeverity: laneSummary.severity,
    workflow: workflowResult.workflow,
    workflowState: workflowResult.state,
    workflowReason: workflowResult.reason,
    runId: workflowResult.runId ?? null,
    runUrl: workflowResult.runUrl ?? null,
    jobId: primaryJob?.jobId ?? null,
    jobName: primaryJob?.jobName ?? null,
    jobUrl: primaryJob?.jobUrl ?? null,
    stepNumber: primaryJob?.focalStep?.number ?? null,
    stepName: primaryJob?.focalStep?.name ?? null,
    stepStatus: primaryJob?.focalStep?.status ?? null,
    stepConclusion: primaryJob?.focalStep?.conclusion ?? null,
    authorityBoundary,
    requiresHuman: Boolean(requiresHuman),
    recommendedAction,
    alertFingerprint: laneSummary.alertFingerprint ?? null,
  };
}
