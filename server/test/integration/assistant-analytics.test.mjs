import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool } = await import('../../dist/db.js');

after(closePool);

function metered(provider, model, durationMs, usage, cost) {
  return {
    provider,
    model,
    endpoint: 'responses.create',
    status: 'succeeded',
    duration_ms: durationMs,
    usage,
    cost: {
      estimated_cost_usd: cost,
      currency: 'USD',
      rate_card_version: 'integration-fixture',
    },
  };
}

test('assistant analytics aggregates PostgreSQL JSONB without double-counting quality-gate top-level metadata', async (t) => {
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
      'INSERT INTO comind.cm_conversation (title) VALUES ($1) RETURNING conv_id',
      [title]
    );
    conversationIds.push(result.rows[0].conv_id);
    return result.rows[0].conv_id;
  }

  async function insertAssistant(convId, content, meta) {
    await query(
      `INSERT INTO comind.cm_message (conv_id, role, content, meta)
       VALUES ($1, 'assistant', $2, $3::jsonb)`,
      [convId, content, JSON.stringify(meta)]
    );
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const ungatedId = await createConversation(`Observability ungated ${suffix}`);
  const gatedId = await createConversation(`Observability gated ${suffix}`);

  await insertAssistant(
    ungatedId,
    'Synthetic ungated fixture',
    metered(
      `obs-base-${suffix}`,
      `obs-model-${suffix}`,
      100,
      { input_tokens: 24, cached_input_tokens: 4, output_tokens: 20, reasoning_tokens: 2, total_tokens: 44 },
      0.0000124
    )
  );

  const draft = metered(
    `obs-base-${suffix}`,
    `obs-model-${suffix}`,
    40,
    { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    0.000004
  );
  const verifier = {
    provider: `obs-verifier-${suffix}`,
    model: `obs-verify-model-${suffix}`,
    endpoint: 'responses.create',
    status: 'succeeded',
    duration_ms: 30,
    usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
    cost: {
      estimated_cost_usd: null,
      currency: 'USD',
      rate_card_version: null,
    },
  };
  const repair = metered(
    `obs-repair-${suffix}`,
    `obs-repair-model-${suffix}`,
    50,
    { input_tokens: 9, output_tokens: 3, total_tokens: 12 },
    0.000005
  );

  await insertAssistant(gatedId, 'Synthetic repaired fixture', {
    ...repair,
    quality_gate: {
      risk: { level: `integration-${suffix}`, reasons: ['fixture'] },
      verdict: `revise-${suffix}`,
      outcome: `repaired-${suffix}`,
      issue_categories: [],
      passes: [
        { role: 'draft', ...draft },
        { role: 'verifier', ...verifier },
        { role: 'repair', ...repair },
        { role: 'final', source_role: 'repair' },
      ],
    },
  });

  const response = await app.inject({ method: 'GET', url: '/api/analytics/assistant-responses' });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();

  const baseModel = body.provider_models.find(
    (item) => item.provider === `obs-base-${suffix}` && item.model === `obs-model-${suffix}`
  );
  assert.ok(baseModel);
  assert.equal(baseModel.calls, 2);
  assert.equal(baseModel.total_tokens, 58);
  assert.ok(Math.abs(baseModel.known_cost_usd - 0.0000164) < 1e-12);
  assert.equal(baseModel.unknown_cost_calls, 0);

  const verifierModel = body.provider_models.find(
    (item) => item.provider === `obs-verifier-${suffix}`
  );
  assert.ok(verifierModel);
  assert.equal(verifierModel.calls, 1);
  assert.equal(verifierModel.total_tokens, 10);
  assert.equal(verifierModel.known_cost_usd, 0);
  assert.equal(verifierModel.unknown_cost_calls, 1);

  const repairModel = body.provider_models.find(
    (item) => item.provider === `obs-repair-${suffix}`
  );
  assert.ok(repairModel);
  assert.equal(repairModel.calls, 1);
  assert.equal(repairModel.total_tokens, 12);
  assert.ok(Math.abs(repairModel.known_cost_usd - 0.000005) < 1e-12);

  const quality = body.quality_outcomes.find(
    (item) => item.risk === `integration-${suffix}`
  );
  assert.deepEqual(quality, {
    risk: `integration-${suffix}`,
    verdict: `revise-${suffix}`,
    outcome: `repaired-${suffix}`,
    responses: 1,
  });

  assert.ok(body.responses.count >= 2);
  assert.ok(body.metered_calls.count >= 4);
  assert.ok(body.usage.total_tokens >= 80);
  assert.ok(body.cost.base_generation.known_usd >= 0.0000164);
  assert.ok(body.cost.quality_overhead.known_usd >= 0.000005);
  assert.ok(body.cost.combined.known_usd >= 0.0000214);
  assert.ok(body.cost.combined.unknown_call_count >= 1);

  // If the gated row's duplicated top-level repair metadata were counted again,
  // the unique repair provider would report two calls rather than one.
  assert.equal(repairModel.calls, 1);
});
