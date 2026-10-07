import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';
process.env.ASSISTANT_PROVIDER = 'disabled';
const { buildApp } = await import('../dist/app.js');

const analyticsRow = {
  response_count: 2,
  metered_call_count: 4,
  input_tokens: 120,
  cached_input_tokens: 30,
  cache_write_tokens: 0,
  output_tokens: 40,
  reasoning_tokens: 10,
  total_tokens: 160,
  base_cost_usd: 0.00001,
  base_unknown_cost_calls: 0,
  quality_overhead_cost_usd: 0.000004,
  quality_unknown_cost_calls: 1,
  combined_known_cost_usd: 0.000014,
  combined_unknown_cost_calls: 1,
  average_workflow_duration_ms: 125.5,
  max_workflow_duration_ms: 200,
  provider_models: [
    {
      provider: 'openai',
      model: 'gpt-6-luna',
      calls: 4,
      total_tokens: 160,
      known_cost_usd: 0.000014,
      unknown_cost_calls: 1,
    },
  ],
  quality_outcomes: [
    { risk: 'high', verdict: 'approve', outcome: 'returned', responses: 1 },
  ],
};

async function withApp(query) {
  return buildApp({ query, assistantProvider: null, closePool: async () => {} });
}

test('assistant analytics endpoint exposes read-only aggregate telemetry', async (t) => {
  let observedSql = '';
  const app = await withApp(async (sql) => {
    observedSql = sql;
    return { rows: [analyticsRow], rowCount: 1 };
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/analytics/assistant-responses' });
  assert.equal(response.statusCode, 200);
  assert.match(observedSql, /jsonb_array_elements/);
  assert.match(observedSql, /pass_role IN \('verifier', 'repair'\)/);
  assert.match(observedSql, /cached_input_tokens/);

  const body = response.json();
  assert.deepEqual(body.responses, { count: 2 });
  assert.deepEqual(body.metered_calls, { count: 4 });
  assert.equal(body.usage.cached_input_tokens, 30);
  assert.equal(body.cost.base_generation.known_usd, 0.00001);
  assert.equal(body.cost.quality_overhead.known_usd, 0.000004);
  assert.equal(body.cost.combined.known_usd, 0.000014);
  assert.equal(body.cost.combined.unknown_call_count, 1);
  assert.equal(body.latency.average_workflow_ms, 125.5);
  assert.equal(body.provider_models[0].model, 'gpt-6-luna');
  assert.equal(body.quality_outcomes[0].outcome, 'returned');
  assert.equal(JSON.stringify(body).includes('prompt'), false);
  assert.equal(JSON.stringify(body).includes('response content'), false);
});

test('analytics browser surface is read-only and loads the assistant aggregate API', async (t) => {
  const app = await withApp(async () => {
    throw new Error('Dashboard HTML must not query the database directly');
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/analytics' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.body, /Assistant Observability/);
  assert.match(response.body, /\/api\/analytics\/assistant-responses/);
  assert.match(response.body, /Quality overhead/);
  assert.equal(response.body.includes('DELETE'), false);
  assert.equal(response.body.includes('POST'), false);
  assert.equal(response.body.includes('PATCH'), false);
});
