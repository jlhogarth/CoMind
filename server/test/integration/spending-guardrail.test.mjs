import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';
process.env.OPENAI_PAID_TEST_GUARDRAIL_WINDOW_HOURS = '24';
process.env.OPENAI_PAID_TEST_BUDGET_USD = '0.05';
process.env.OPENAI_PAID_TEST_WARN_RATIO = '0.8';
process.env.OPENAI_PAID_TEST_WARN_FAILURE_RATE = '0.1';
process.env.OPENAI_PAID_TEST_PAUSE_FAILURE_RATE = '0.25';
process.env.OPENAI_PAID_TEST_MAX_UNKNOWN_COST_CALLS = '0';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool } = await import('../../dist/db.js');

after(closePool);

function telemetry(cost) {
  return {
    provider: 'openai',
    model: 'gpt-6-luna',
    endpoint: 'responses.create',
    status: 'succeeded',
    duration_ms: 25,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    cost: {
      estimated_cost_usd: cost,
      currency: 'USD',
      rate_card_version: 'integration-fixture',
    },
  };
}

test('spending guardrail evaluates only persisted provider calls inside its rolling PostgreSQL window', async (t) => {
  const app = await buildApp({ assistantProvider: null, closePool: async () => {} });
  const conversationIds = [];
  t.after(async () => {
    try {
      for (const id of conversationIds) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [id]);
      }
    } finally {
      await app.close();
    }
  });

  async function createConversation(title) {
    const result = await query(
      `INSERT INTO comind.cm_conversation (project_id, source, title)
       VALUES (
         (SELECT project_id FROM comind.cm_project WHERE slug='comind' LIMIT 1),
         'live',
         $1
       )
       RETURNING conv_id`,
      [title]
    );
    conversationIds.push(result.rows[0].conv_id);
    return result.rows[0].conv_id;
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const recentId = await createConversation(`Guardrail recent ${suffix}`);
  const oldId = await createConversation(`Guardrail expired ${suffix}`);

  await query(
    `INSERT INTO comind.cm_message (conv_id, role, content, meta)
     VALUES ($1, 'assistant', $2, $3::jsonb)`,
    [recentId, 'Recent synthetic guardrail fixture', JSON.stringify(telemetry(0.04))]
  );

  await query(
    `INSERT INTO comind.cm_message (conv_id, role, content, meta, created_at)
     VALUES ($1, 'assistant', $2, $3::jsonb, NOW() - INTERVAL '48 hours')`,
    [oldId, 'Expired synthetic guardrail fixture', JSON.stringify(telemetry(9.99))]
  );

  const response = await app.inject({ method: 'GET', url: '/api/analytics/spending-guardrail' });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();

  assert.equal(body.decision, 'warn');
  assert.equal(body.pause_paid_tests, false);
  assert.equal(body.window.hours, 24);
  assert.equal(body.observed.metered_calls, 1);
  assert.ok(Math.abs(body.observed.known_cost_usd - 0.04) < 1e-12);
  assert.equal(body.observed.unknown_cost_calls, 0);
  assert.equal(body.observed.failed_calls, 0);
  assert.equal(body.reasons.some((reason) => reason.includes('80% warning threshold')), true);
});
