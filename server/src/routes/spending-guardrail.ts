import { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { QueryFunction, query } from '../db.js';

type GuardrailDecision = 'allow' | 'warn' | 'pause';

type GuardrailMetrics = {
  metered_call_count: number;
  succeeded_call_count: number;
  failed_call_count: number;
  unknown_status_call_count: number;
  known_cost_usd: number;
  unknown_cost_call_count: number;
};

export type SpendingGuardrailThresholds = {
  window_hours: number;
  budget_usd: number;
  warn_ratio: number;
  warn_failure_rate: number;
  pause_failure_rate: number;
  max_unknown_cost_calls: number;
};

const spendingGuardrailSql = `
WITH assistant AS (
  SELECT msg_id, conv_id, created_at, meta
  FROM comind.cm_message
  WHERE role = 'assistant'
    AND created_at >= NOW() - make_interval(hours => $1::int)
    AND jsonb_typeof(meta) = 'object'
    AND NULLIF(meta->>'provider', '') IS NOT NULL
),
quality_passes AS (
  SELECT
    assistant.msg_id,
    assistant.conv_id,
    assistant.created_at,
    pass AS event_meta
  FROM assistant
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(assistant.meta#>'{quality_gate,passes}') = 'array'
        THEN assistant.meta#>'{quality_gate,passes}'
      ELSE '[]'::jsonb
    END
  ) AS pass
  WHERE pass->>'role' IN ('draft', 'verifier', 'repair')
),
metered_events AS (
  SELECT msg_id, conv_id, created_at, meta AS event_meta
  FROM assistant
  WHERE jsonb_typeof(meta->'quality_gate') IS DISTINCT FROM 'object'

  UNION ALL

  SELECT msg_id, conv_id, created_at, event_meta
  FROM quality_passes
),
event_facts AS (
  SELECT
    COALESCE(NULLIF(event_meta->>'status', ''), 'unknown') AS status,
    CASE WHEN jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') = 'number'
      THEN (event_meta#>>'{cost,estimated_cost_usd}')::double precision ELSE NULL END AS estimated_cost_usd
  FROM metered_events
)
SELECT
  COUNT(*)::int AS metered_call_count,
  COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded_call_count,
  COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_call_count,
  COUNT(*) FILTER (WHERE status NOT IN ('succeeded', 'failed'))::int AS unknown_status_call_count,
  COALESCE(SUM(COALESCE(estimated_cost_usd, 0)), 0)::double precision AS known_cost_usd,
  COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL)::int AS unknown_cost_call_count
FROM event_facts
`;

const dashboardGuardrailMarkup = `
<section id="spending-guardrail">
  <h2>Paid-test spending guardrail</h2>
  <div class="cards">
    <div class="card"><div class="label">Decision</div><div class="value" id="guardrail-decision">loading</div></div>
    <div class="card"><div class="label">Known cost</div><div class="value" id="guardrail-cost">loading</div></div>
    <div class="card"><div class="label">Failure rate</div><div class="value" id="guardrail-failure">loading</div></div>
    <div class="card"><div class="label">Unknown costs</div><div class="value" id="guardrail-unknown">loading</div></div>
  </div>
  <p class="subtle" id="guardrail-reasons">Evaluating current persisted telemetry.</p>
</section>
<script>
fetch('/api/analytics/spending-guardrail')
  .then((response) => { if (!response.ok) throw new Error('Guardrail request failed: ' + response.status); return response.json(); })
  .then((data) => {
    document.getElementById('guardrail-decision').textContent = String(data.decision || 'unknown').toUpperCase();
    document.getElementById('guardrail-cost').textContent = '$' + Number(data.observed.known_cost_usd || 0).toFixed(8).replace(/0+$/, '').replace(/\\.$/, '');
    document.getElementById('guardrail-failure').textContent = (Number(data.observed.failure_rate || 0) * 100).toFixed(1) + '%';
    document.getElementById('guardrail-unknown').textContent = String(data.observed.unknown_cost_calls || 0);
    document.getElementById('guardrail-reasons').textContent = Array.isArray(data.reasons) ? data.reasons.join(' ') : 'Guardrail result unavailable.';
  })
  .catch((error) => { document.getElementById('guardrail-reasons').textContent = error.message; });
</script>
`;

export function evaluateSpendingGuardrail(
  observed: GuardrailMetrics,
  thresholds: SpendingGuardrailThresholds
) {
  const callCount = Number(observed.metered_call_count || 0);
  const failedCalls = Number(observed.failed_call_count || 0);
  const failureRate = callCount > 0 ? failedCalls / callCount : 0;
  const knownCost = Number(observed.known_cost_usd || 0);
  const unknownCostCalls = Number(observed.unknown_cost_call_count || 0);
  const unknownStatusCalls = Number(observed.unknown_status_call_count || 0);
  const warnCostUsd = Number((thresholds.budget_usd * thresholds.warn_ratio).toFixed(12));

  const pauseReasons: string[] = [];
  const warnReasons: string[] = [];

  if (knownCost >= thresholds.budget_usd) {
    pauseReasons.push(
      `Known spend $${knownCost.toFixed(8)} reached or exceeded the $${thresholds.budget_usd.toFixed(8)} hard budget.`
    );
  } else if (knownCost >= warnCostUsd) {
    warnReasons.push(
      `Known spend $${knownCost.toFixed(8)} reached the ${(thresholds.warn_ratio * 100).toFixed(0)}% warning threshold.`
    );
  }

  if (unknownCostCalls > thresholds.max_unknown_cost_calls) {
    pauseReasons.push(
      `${unknownCostCalls} provider call(s) have unknown cost, above the allowed maximum of ${thresholds.max_unknown_cost_calls}.`
    );
  }

  if (unknownStatusCalls > 0) {
    pauseReasons.push(`${unknownStatusCalls} provider call(s) have unknown status.`);
  }

  if (callCount > 0 && failureRate >= thresholds.pause_failure_rate) {
    pauseReasons.push(
      `Failure rate ${(failureRate * 100).toFixed(1)}% reached or exceeded the ${(thresholds.pause_failure_rate * 100).toFixed(1)}% pause threshold.`
    );
  } else if (callCount > 0 && failureRate >= thresholds.warn_failure_rate) {
    warnReasons.push(
      `Failure rate ${(failureRate * 100).toFixed(1)}% reached or exceeded the ${(thresholds.warn_failure_rate * 100).toFixed(1)}% warning threshold.`
    );
  }

  const decision: GuardrailDecision =
    pauseReasons.length > 0 ? 'pause' : warnReasons.length > 0 ? 'warn' : 'allow';

  const reasons = [...pauseReasons, ...warnReasons];
  if (reasons.length === 0) {
    reasons.push(
      callCount === 0
        ? 'No metered provider calls were observed in the evaluation window.'
        : 'Observed spend, status, and failure rate are within configured guardrails.'
    );
  }

  return {
    decision,
    severity: decision === 'pause' ? 'critical' : decision === 'warn' ? 'warning' : 'normal',
    pause_paid_tests: decision === 'pause',
    window: { hours: thresholds.window_hours },
    thresholds: {
      budget_usd: thresholds.budget_usd,
      warning_cost_usd: warnCostUsd,
      warning_budget_ratio: thresholds.warn_ratio,
      warning_failure_rate: thresholds.warn_failure_rate,
      pause_failure_rate: thresholds.pause_failure_rate,
      max_unknown_cost_calls: thresholds.max_unknown_cost_calls,
      max_unknown_status_calls: 0,
    },
    observed: {
      metered_calls: callCount,
      succeeded_calls: Number(observed.succeeded_call_count || 0),
      failed_calls: failedCalls,
      unknown_status_calls: unknownStatusCalls,
      failure_rate: failureRate,
      known_cost_usd: knownCost,
      unknown_cost_calls: unknownCostCalls,
    },
    reasons,
  };
}

function configuredThresholds(): SpendingGuardrailThresholds {
  return {
    window_hours: env.OPENAI_PAID_TEST_GUARDRAIL_WINDOW_HOURS,
    budget_usd: env.OPENAI_PAID_TEST_BUDGET_USD,
    warn_ratio: env.OPENAI_PAID_TEST_WARN_RATIO,
    warn_failure_rate: env.OPENAI_PAID_TEST_WARN_FAILURE_RATE,
    pause_failure_rate: env.OPENAI_PAID_TEST_PAUSE_FAILURE_RATE,
    max_unknown_cost_calls: env.OPENAI_PAID_TEST_MAX_UNKNOWN_COST_CALLS,
  };
}

export function registerSpendingGuardrailRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query
) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (
      request.method === 'GET' &&
      request.url === '/analytics' &&
      typeof payload === 'string' &&
      String(reply.getHeader('content-type') || '').includes('text/html')
    ) {
      return payload.replace('</main>', `${dashboardGuardrailMarkup}</main>`);
    }
    return payload;
  });

  app.get('/api/analytics/spending-guardrail', async () => {
    const thresholds = configuredThresholds();
    const result = await queryFn<GuardrailMetrics>(spendingGuardrailSql, [thresholds.window_hours]);
    const observed = result.rows[0] ?? {
      metered_call_count: 0,
      succeeded_call_count: 0,
      failed_call_count: 0,
      unknown_status_call_count: 0,
      known_cost_usd: 0,
      unknown_cost_call_count: 0,
    };
    return evaluateSpendingGuardrail(observed, thresholds);
  });
}
