const TERMINAL_CONCLUSIONS = new Set([
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'neutral',
  'skipped',
  'stale',
  'startup_failure',
]);

function asDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid timestamp.`);
  }
  return date;
}

function secondsBetween(later, earlier) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 1000));
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function deriveNormalRuntimeSeconds(samples, fallbackNormalSeconds) {
  const fallback = finitePositive(fallbackNormalSeconds);
  if (!fallback) {
    throw new Error('fallbackNormalSeconds must be a positive number.');
  }

  const values = (samples || [])
    .map(finitePositive)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) return fallback;

  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle];
  return (values[middle - 1] + values[middle]) / 2;
}

function baseResult({ expectedHeadSha, run, workflowName, normalRuntimeSeconds }) {
  return {
    schemaVersion: 1,
    workflow: workflowName,
    expectedHeadSha,
    observedHeadSha: run?.head_sha || null,
    runId: run?.id ?? null,
    runUrl: run?.html_url || null,
    normalRuntimeSeconds,
  };
}

function result(base, state, severity, reason, extra = {}) {
  return {
    ...base,
    state,
    severity,
    reason,
    ...extra,
  };
}

export function classifyWorkflowHealth({
  expectedHeadSha,
  workflowName,
  policy,
  run = null,
  jobs = [],
  recentSuccessfulDurationsSeconds = [],
  headObservedAt,
  now = new Date(),
  lastMeaningfulTransitionAt = null,
}) {
  if (!expectedHeadSha) throw new Error('expectedHeadSha is required.');
  if (!workflowName) throw new Error('workflowName is required.');
  if (!policy || typeof policy !== 'object') throw new Error('policy is required.');

  const currentTime = asDate(now, 'now');
  const normalRuntimeSeconds = deriveNormalRuntimeSeconds(
    recentSuccessfulDurationsSeconds,
    policy.fallbackNormalSeconds
  );
  const base = baseResult({ expectedHeadSha, run, workflowName, normalRuntimeSeconds });

  if (!run) {
    const observedAt = asDate(headObservedAt, 'headObservedAt');
    const ageSeconds = secondsBetween(currentTime, observedAt);
    const threshold = Number(policy.expectedRunAfterSeconds);
    if (ageSeconds >= threshold) {
      return result(
        base,
        'expected_run_absent',
        'critical',
        `No ${workflowName} run appeared for the expected head within ${threshold} seconds.`,
        { ageSeconds, thresholdSeconds: threshold }
      );
    }
    return result(base, 'waiting_for_run', 'info', 'Expected workflow run has not appeared yet.', {
      ageSeconds,
      thresholdSeconds: threshold,
    });
  }

  if (run.head_sha !== expectedHeadSha) {
    return result(
      base,
      'stale_head_evidence',
      'critical',
      'Workflow evidence belongs to a different commit and cannot establish current lane health.'
    );
  }

  const conclusion = run.conclusion || null;
  const status = run.status || null;
  const createdAt = asDate(run.created_at, 'run.created_at');
  const ageSeconds = secondsBetween(currentTime, createdAt);

  if (conclusion === 'action_required' && jobs.length === 0) {
    return result(
      base,
      'action_required_zero_jobs',
      'critical',
      'GitHub requires action but created no executable jobs; treat this as an orchestration stall.',
      { ageSeconds, jobCount: 0 }
    );
  }

  if (TERMINAL_CONCLUSIONS.has(conclusion)) {
    if (conclusion === 'success') {
      return result(base, 'healthy_success', 'ok', 'Workflow completed successfully.', {
        ageSeconds,
        jobCount: jobs.length,
      });
    }
    if (conclusion === 'failure') {
      return result(base, 'terminal_failure', 'critical', 'Workflow completed with a deterministic failure.', {
        ageSeconds,
        jobCount: jobs.length,
      });
    }
    if (conclusion === 'cancelled') {
      return result(base, 'cancelled', 'warning', 'Workflow was cancelled before successful completion.', {
        ageSeconds,
        jobCount: jobs.length,
      });
    }
    if (conclusion === 'timed_out') {
      return result(base, 'timed_out', 'critical', 'Workflow exceeded its execution timeout.', {
        ageSeconds,
        jobCount: jobs.length,
      });
    }
    if (conclusion === 'action_required') {
      return result(base, 'action_required', 'critical', 'Workflow requires explicit operator action.', {
        ageSeconds,
        jobCount: jobs.length,
      });
    }
    return result(base, `terminal_${conclusion}`, 'warning', `Workflow ended with ${conclusion}.`, {
      ageSeconds,
      jobCount: jobs.length,
    });
  }

  if (status === 'queued' || status === 'waiting' || status === 'pending') {
    const threshold = Number(policy.queueStallSeconds);
    if (ageSeconds >= threshold) {
      return result(base, 'queue_stall', 'critical', 'Workflow exists but no executable work started within the queue threshold.', {
        ageSeconds,
        thresholdSeconds: threshold,
        jobCount: jobs.length,
      });
    }
    return result(base, 'queued', 'info', 'Workflow is queued within the allowed queue interval.', {
      ageSeconds,
      thresholdSeconds: threshold,
      jobCount: jobs.length,
    });
  }

  if (status === 'in_progress') {
    const transitionTime = asDate(
      lastMeaningfulTransitionAt || run.updated_at || run.created_at,
      'lastMeaningfulTransitionAt'
    );
    const unchangedSeconds = secondsBetween(currentTime, transitionTime);
    const threshold = Math.max(
      Number(policy.minimumRuntimeStallSeconds),
      Math.ceil(normalRuntimeSeconds * Number(policy.runtimeStallMultiplier))
    );

    if (unchangedSeconds >= threshold) {
      return result(base, 'runtime_stall', 'critical', 'Workflow is in progress but has not made a meaningful transition within its runtime threshold.', {
        ageSeconds,
        unchangedSeconds,
        thresholdSeconds: threshold,
        jobCount: jobs.length,
      });
    }

    return result(base, 'in_progress', 'info', 'Workflow is running within its measured runtime envelope.', {
      ageSeconds,
      unchangedSeconds,
      thresholdSeconds: threshold,
      jobCount: jobs.length,
    });
  }

  return result(base, 'unknown', 'warning', 'Workflow state is not recognized by the current sentinel contract.', {
    ageSeconds,
    jobCount: jobs.length,
    observedStatus: status,
    observedConclusion: conclusion,
  });
}
