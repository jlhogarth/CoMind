import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';

type AssistantAnalyticsRow = {
  response_count: number;
  metered_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  base_cost_usd: number;
  base_unknown_cost_calls: number;
  quality_overhead_cost_usd: number;
  quality_unknown_cost_calls: number;
  combined_known_cost_usd: number;
  combined_unknown_cost_calls: number;
  average_workflow_duration_ms: number | null;
  max_workflow_duration_ms: number | null;
  provider_models: Array<Record<string, unknown>>;
  quality_outcomes: Array<Record<string, unknown>>;
};

const assistantAnalyticsSql = `
WITH assistant AS (
  SELECT msg_id, meta
  FROM comind.cm_message
  WHERE role = 'assistant'
    AND jsonb_typeof(meta) = 'object'
    AND NULLIF(meta->>'provider', '') IS NOT NULL
),
quality_passes AS (
  SELECT
    assistant.msg_id,
    pass->>'role' AS pass_role,
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
  SELECT msg_id, 'response'::text AS pass_role, meta AS event_meta
  FROM assistant
  WHERE jsonb_typeof(meta->'quality_gate') IS DISTINCT FROM 'object'

  UNION ALL

  SELECT msg_id, pass_role, event_meta
  FROM quality_passes
),
workflow_durations AS (
  SELECT
    msg_id,
    SUM(
      CASE
        WHEN jsonb_typeof(event_meta->'duration_ms') = 'number'
          THEN (event_meta->>'duration_ms')::double precision
        ELSE 0
      END
    ) AS duration_ms
  FROM metered_events
  GROUP BY msg_id
),
provider_model AS (
  SELECT
    COALESCE(NULLIF(event_meta->>'provider', ''), 'unknown') AS provider,
    COALESCE(NULLIF(event_meta->>'model', ''), 'unknown') AS model,
    COUNT(*)::int AS calls,
    COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(event_meta#>'{usage,total_tokens}') = 'number'
          THEN (event_meta#>>'{usage,total_tokens}')::double precision
        ELSE 0
      END
    ), 0)::double precision AS total_tokens,
    COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') = 'number'
          THEN (event_meta#>>'{cost,estimated_cost_usd}')::double precision
        ELSE 0
      END
    ), 0)::double precision AS known_cost_usd,
    COUNT(*) FILTER (
      WHERE jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') IS DISTINCT FROM 'number'
    )::int AS unknown_cost_calls
  FROM metered_events
  GROUP BY 1, 2
),
quality_summary AS (
  SELECT
    COALESCE(NULLIF(meta#>>'{quality_gate,risk,level}', ''), 'unknown') AS risk,
    COALESCE(NULLIF(meta#>>'{quality_gate,verdict}', ''), 'unknown') AS verdict,
    COALESCE(NULLIF(meta#>>'{quality_gate,outcome}', ''), 'unknown') AS outcome,
    COUNT(*)::int AS responses
  FROM assistant
  WHERE jsonb_typeof(meta->'quality_gate') = 'object'
  GROUP BY 1, 2, 3
)
SELECT
  (SELECT COUNT(*)::int FROM assistant) AS response_count,
  (SELECT COUNT(*)::int FROM metered_events) AS metered_call_count,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,input_tokens}') = 'number'
      THEN (event_meta#>>'{usage,input_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS input_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,cached_input_tokens}') = 'number'
      THEN (event_meta#>>'{usage,cached_input_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS cached_input_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,cache_write_tokens}') = 'number'
      THEN (event_meta#>>'{usage,cache_write_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS cache_write_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,output_tokens}') = 'number'
      THEN (event_meta#>>'{usage,output_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS output_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,reasoning_tokens}') = 'number'
      THEN (event_meta#>>'{usage,reasoning_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS reasoning_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{usage,total_tokens}') = 'number'
      THEN (event_meta#>>'{usage,total_tokens}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS total_tokens,
  COALESCE((SELECT SUM(
    CASE WHEN pass_role IN ('response', 'draft')
      AND jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') = 'number'
      THEN (event_meta#>>'{cost,estimated_cost_usd}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS base_cost_usd,
  COALESCE((SELECT COUNT(*) FILTER (
    WHERE pass_role IN ('response', 'draft')
      AND jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') IS DISTINCT FROM 'number'
  ) FROM metered_events), 0)::int AS base_unknown_cost_calls,
  COALESCE((SELECT SUM(
    CASE WHEN pass_role IN ('verifier', 'repair')
      AND jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') = 'number'
      THEN (event_meta#>>'{cost,estimated_cost_usd}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS quality_overhead_cost_usd,
  COALESCE((SELECT COUNT(*) FILTER (
    WHERE pass_role IN ('verifier', 'repair')
      AND jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') IS DISTINCT FROM 'number'
  ) FROM metered_events), 0)::int AS quality_unknown_cost_calls,
  COALESCE((SELECT SUM(
    CASE WHEN jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') = 'number'
      THEN (event_meta#>>'{cost,estimated_cost_usd}')::double precision ELSE 0 END
  ) FROM metered_events), 0)::double precision AS combined_known_cost_usd,
  COALESCE((SELECT COUNT(*) FILTER (
    WHERE jsonb_typeof(event_meta#>'{cost,estimated_cost_usd}') IS DISTINCT FROM 'number'
  ) FROM metered_events), 0)::int AS combined_unknown_cost_calls,
  (SELECT AVG(duration_ms)::double precision FROM workflow_durations) AS average_workflow_duration_ms,
  (SELECT MAX(duration_ms)::double precision FROM workflow_durations) AS max_workflow_duration_ms,
  COALESCE((SELECT json_agg(
    json_build_object(
      'provider', provider,
      'model', model,
      'calls', calls,
      'total_tokens', total_tokens,
      'known_cost_usd', known_cost_usd,
      'unknown_cost_calls', unknown_cost_calls
    ) ORDER BY calls DESC, provider, model
  ) FROM provider_model), '[]'::json) AS provider_models,
  COALESCE((SELECT json_agg(
    json_build_object(
      'risk', risk,
      'verdict', verdict,
      'outcome', outcome,
      'responses', responses
    ) ORDER BY responses DESC, risk, verdict, outcome
  ) FROM quality_summary), '[]'::json) AS quality_outcomes
`;

function assistantAnalyticsPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CoMind Assistant Observability</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0d1117; color: #e6edf3; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { margin: 0 0 6px; font-size: 30px; }
    .subtle { color: #8b949e; margin: 0 0 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card, section { background: #161b22; border: 1px solid #30363d; border-radius: 10px; }
    .card { padding: 16px; }
    .label { color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .value { margin-top: 7px; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; }
    section { margin-top: 18px; padding: 18px; overflow-x: auto; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid #30363d; white-space: nowrap; }
    th { color: #8b949e; font-weight: 600; }
    .error { color: #ff7b72; }
  </style>
</head>
<body>
<main>
  <h1>Assistant Observability</h1>
  <p class="subtle">Read-only telemetry derived from persisted assistant metadata. Prompt and response content are not included.</p>
  <div id="error" class="error" role="alert"></div>
  <div class="cards" id="cards"></div>
  <section>
    <h2>Provider and model activity</h2>
    <table><thead><tr><th>Provider</th><th>Model</th><th>Calls</th><th>Tokens</th><th>Known cost</th><th>Unknown costs</th></tr></thead><tbody id="models"></tbody></table>
  </section>
  <section>
    <h2>Quality-gate outcomes</h2>
    <table><thead><tr><th>Risk</th><th>Verdict</th><th>Outcome</th><th>Responses</th></tr></thead><tbody id="quality"></tbody></table>
  </section>
</main>
<script>
const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatUsd = (value) => '$' + Number(value || 0).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
const addCell = (row, value) => { const cell = document.createElement('td'); cell.textContent = String(value); row.appendChild(cell); };
const addCard = (label, value) => {
  const card = document.createElement('div'); card.className = 'card';
  const labelNode = document.createElement('div'); labelNode.className = 'label'; labelNode.textContent = label;
  const valueNode = document.createElement('div'); valueNode.className = 'value'; valueNode.textContent = value;
  card.append(labelNode, valueNode); document.getElementById('cards').appendChild(card);
};
fetch('/api/analytics/assistant-responses')
  .then((response) => { if (!response.ok) throw new Error('Analytics request failed: ' + response.status); return response.json(); })
  .then((data) => {
    addCard('Persisted responses', formatNumber(data.responses.count));
    addCard('Metered provider calls', formatNumber(data.metered_calls.count));
    addCard('Total tokens', formatNumber(data.usage.total_tokens));
    addCard('Cached input tokens', formatNumber(data.usage.cached_input_tokens));
    addCard('Base generation cost', formatUsd(data.cost.base_generation.known_usd));
    addCard('Quality overhead', formatUsd(data.cost.quality_overhead.known_usd));
    addCard('Combined known cost', formatUsd(data.cost.combined.known_usd));
    addCard('Unknown cost calls', formatNumber(data.cost.combined.unknown_call_count));
    addCard('Avg workflow ms', data.latency.average_workflow_ms == null ? 'n/a' : formatNumber(Math.round(data.latency.average_workflow_ms)));
    addCard('Max workflow ms', data.latency.max_workflow_ms == null ? 'n/a' : formatNumber(Math.round(data.latency.max_workflow_ms)));

    for (const item of data.provider_models) {
      const row = document.createElement('tr');
      addCell(row, item.provider); addCell(row, item.model); addCell(row, formatNumber(item.calls));
      addCell(row, formatNumber(item.total_tokens)); addCell(row, formatUsd(item.known_cost_usd)); addCell(row, formatNumber(item.unknown_cost_calls));
      document.getElementById('models').appendChild(row);
    }
    for (const item of data.quality_outcomes) {
      const row = document.createElement('tr');
      addCell(row, item.risk); addCell(row, item.verdict); addCell(row, item.outcome); addCell(row, formatNumber(item.responses));
      document.getElementById('quality').appendChild(row);
    }
  })
  .catch((error) => { document.getElementById('error').textContent = error.message; });
</script>
</body>
</html>`;
}

export function registerAnalyticsRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.get('/api/analytics/summary', async () => {
    const convs = await queryFn<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_conversation");
    const msgs = await queryFn<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_message");
    const top10 = await queryFn<any>("SELECT conv_id, COUNT(*)::int AS messages FROM comind.cm_message GROUP BY conv_id ORDER BY messages DESC LIMIT 10");
    return { conversations: convs.rows[0].count, messages: msgs.rows[0].count, top10: top10.rows };
  });

  app.get('/api/analytics/assistant-responses', async () => {
    const result = await queryFn<AssistantAnalyticsRow>(assistantAnalyticsSql);
    const row = result.rows[0];
    return {
      responses: { count: row.response_count },
      metered_calls: { count: row.metered_call_count },
      usage: {
        input_tokens: row.input_tokens,
        cached_input_tokens: row.cached_input_tokens,
        cache_write_tokens: row.cache_write_tokens,
        output_tokens: row.output_tokens,
        reasoning_tokens: row.reasoning_tokens,
        total_tokens: row.total_tokens,
      },
      cost: {
        base_generation: {
          known_usd: row.base_cost_usd,
          unknown_call_count: row.base_unknown_cost_calls,
        },
        quality_overhead: {
          known_usd: row.quality_overhead_cost_usd,
          unknown_call_count: row.quality_unknown_cost_calls,
        },
        combined: {
          known_usd: row.combined_known_cost_usd,
          unknown_call_count: row.combined_unknown_cost_calls,
        },
      },
      latency: {
        average_workflow_ms: row.average_workflow_duration_ms,
        max_workflow_ms: row.max_workflow_duration_ms,
      },
      provider_models: row.provider_models,
      quality_outcomes: row.quality_outcomes,
    };
  });

  app.get('/analytics', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(assistantAnalyticsPage());
  });
}
