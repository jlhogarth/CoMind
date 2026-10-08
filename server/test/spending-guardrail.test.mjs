import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';
process.env.ASSISTANT_PROVIDER = 'disabled';
process.env.OPENAI_PAID_TEST_GUARDRAIL_WINDOW_HOURS = '24';
process.env.OPENAI_PAID_TEST_BUDGET_USD = '0.05';
process.env.OPENAI_PAID_TEST_WARN_RATIO = '0.8';
process.env.OPENAI_PAID_TEST_WARN_FAILURE_RATE = '0.1';
process.env.OPENAI_PAID_TEST_PAUSE_FAILURE_RATE = '0.25';
process.env.OPENAI_PAID_TEST_MAX_UNKNOWN_COST_CALLS = '0';

const { buildApp } = await import('../dist/app.js');

const baseRow = {
  metered_call_count: 10,
  succeeded_call_count: 10,
  failed_call_count: 0,
  unknown_status_call_count: 0,
  known_cost_usd: 0.01,
  unknown_cost_call_count: 0,
};

async function withGuardrailRow(row, observer = {}) {
  return buildApp({
    query: async (sql, params) => {
      observer.sql = sql;
      observer.params = params;
      return { rows: [row], rowCount: 1 };
    },
    assistantProvider: null,
    closePool: async () => {},
  });
}

test('spending guardrail allows healthy telemetry and exposes configured window', async (t) => {
  const observer = {};
  const app = await withGuardrailRow(baseRow, observer);
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/analytics/spending-guardrail' });
  assert.equal(response.statusCode, 200);
  assert.match(observer.sql, /make_interval\(hours => \$1::int\)/);
  assert.match(observer.sql, /jsonb_array_elements/);
  assert.deepEqual(observer.params, [24]);

  const body = response.json();
  assert.equal(body.decision, 'allow');
  assert.equal(body.severity, 'normal');
  assert.equal(body.pause_paid_tests, false);
  assert.equal(body.window.hours, 24);
  assert.equal(body.thresholds.budget_usd, 0.05);
  assert.equal(body.thresholds.warning_cost_usd, 0.04);
  assert.equal(body.observed.failure_rate, 0);
  assert.match(body.reasons[0], /within configured guardrails/);
  assert.equal(JSON.stringify(body).includes('prompt'), false);
  assert.equal(JSON.stringify(body).includes('response content'), false);
});

test('spending guardrail reports zero usage safely and explicitly', async (t) => {
  const app = await withGuardrailRow({
    metered_call_count: 0,
    succeeded_call_count: 0,
    failed_call_count: 0,
    unknown_status_call_count: 0,
    known_cost_usd: 0,
    unknown_cost_call_count: 0,
  });
  t.after(() => app.close());

  const body = (await app.inject({ method: 'GET', url: '/api/analytics/spending-guardrail' })).json();
  assert.equal(body.decision, 'allow');
  assert.equal(body.observed.failure_rate, 0);
  assert.match(body.reasons[0], /No metered provider calls/);
});

test('spending guardrail warns before the hard budget or on elevated failures', async (t) => {
  const app = await withGuardrailRow({
    ...baseRow,
    succeeded_call_count: 9,
    failed_call_count: 1,
    known_cost_usd: 0.04,
  });
  t.after(() => app.close());

  const body = (await app.inject({ method: 'GET', url: '/api/analytics/spending-guardrail' })).json();
  assert.equal(body.decision, 'warn');
  assert.equal(body.severity, 'warning');
  assert.equal(body.pause_paid_tests, false);
  assert.equal(body.observed.failure_rate, 0.1);
  assert.equal(body.reasons.some((reason) => reason.includes('80% warning threshold')), true);
  assert.equal(body.reasons.some((reason) => reason.includes('10.0% warning threshold')), true);
});

test('spending guardrail pauses on budget breach or telemetry uncertainty', async (t) => {
  const app = await withGuardrailRow({
    metered_call_count: 4,
    succeeded_call_count: 2,
    failed_call_count: 1,
    unknown_status_call_count: 1,
    known_cost_usd: 0.05,
    unknown_cost_call_count: 1,
  });
  t.after(() => app.close());

  const body = (await app.inject({ method: 'GET', url: '/api/analytics/spending-guardrail' })).json();
  assert.equal(body.decision, 'pause');
  assert.equal(body.severity, 'critical');
  assert.equal(body.pause_paid_tests, true);
  assert.equal(body.observed.failure_rate, 0.25);
  assert.equal(body.reasons.some((reason) => reason.includes('hard budget')), true);
  assert.equal(body.reasons.some((reason) => reason.includes('unknown cost')), true);
  assert.equal(body.reasons.some((reason) => reason.includes('unknown status')), true);
  assert.equal(body.reasons.some((reason) => reason.includes('25.0% pause threshold')), true);
});

test('analytics browser surface includes the paid-test guardrail projection', async (t) => {
  const app = await buildApp({
    query: async () => {
      throw new Error('Dashboard HTML must remain read-only and avoid direct database queries');
    },
    assistantProvider: null,
    closePool: async () => {},
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/analytics' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.body, /Paid-test spending guardrail/);
  assert.match(response.body, /\/api\/analytics\/spending-guardrail/);
  assert.match(response.body, /guardrail-decision/);
  assert.equal(response.body.includes('DELETE'), false);
  assert.equal(response.body.includes('PATCH'), false);
});
