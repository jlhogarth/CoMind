import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool } = await import('../../dist/db.js');
const { MeteredQualityGateProvider } = await import('../../dist/assistant-quality-gate.js');

after(closePool);

function metadata(provider, responseId, cost) {
  return {
    provider,
    model: 'gpt-6-luna',
    endpoint: 'responses.create',
    response_id: responseId,
    status: 'succeeded',
    duration_ms: 1,
    usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    cost: {
      estimated_cost_usd: cost,
      currency: 'USD',
      rate_card_version: 'openai-2026-10-07',
    },
  };
}

async function setup(t, provider) {
  const app = await buildApp({ assistantProvider: provider, closePool: async () => {} });
  const ids = [];
  t.after(async () => {
    try {
      for (const id of ids) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [id]);
      }
    } finally {
      await app.close();
    }
  });

  async function createConversation(title) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title },
    });
    assert.equal(response.statusCode, 201);
    ids.push(response.json().conv_id);
    return response.json().conv_id;
  }

  async function appendUser(id, content) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/messages`,
      payload: { role: 'user', content },
    });
    assert.equal(response.statusCode, 201);
  }

  async function generate(id) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/assistant-response`,
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  async function reload(id) {
    const response = await app.inject({ method: 'GET', url: `/api/conversations/${id}` });
    assert.equal(response.statusCode, 200);
    return response.json().messages;
  }

  return { createConversation, appendUser, generate, reload };
}

test('low-risk quality-gate skip persists without verifier tax', async (t) => {
  let verifierCalls = 0;
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return { content: 'Persisted low-risk answer', metadata: metadata('draft-provider', 'draft-low', 0.000003) };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        verifierCalls++;
        throw new Error('Verifier must not run for low risk');
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        throw new Error('Repair must not run for low risk');
      },
    }
  );

  const f = await setup(t, provider);
  const id = await f.createConversation(`Quality skip ${process.pid}-${t.name}`);
  await f.appendUser(id, 'Tell me a short joke.');
  const created = await f.generate(id);
  const reloaded = await f.reload(id);

  assert.equal(verifierCalls, 0);
  assert.equal(created.meta.quality_gate.verdict, 'skipped');
  assert.equal(created.meta.quality_gate.outcome, 'returned');
  assert.equal(reloaded[1].meta.quality_gate.verdict, 'skipped');
  assert.equal(reloaded[1].meta.quality_gate.passes[0].cost.estimated_cost_usd, 0.000003);
});

test('high-risk revise persists repaired answer and all metered passes', async (t) => {
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return { content: 'The answer is 41.', metadata: metadata('draft-provider', 'draft-repair', 0.000004) };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        return {
          verdict: 'revise',
          critique: 'Arithmetic mismatch.',
          issueCategories: ['arithmetic_logical_error'],
          metadata: metadata('verifier-provider', 'verify-repair', 0.000003),
        };
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        return { content: 'The answer is 42.', metadata: metadata('repair-provider', 'repair-1', 0.000005) };
      },
    }
  );

  const f = await setup(t, provider);
  const id = await f.createConversation(`Quality repair ${process.pid}-${t.name}`);
  await f.appendUser(id, 'Calculate 6 * 7.');
  const created = await f.generate(id);
  const reloaded = await f.reload(id);

  assert.equal(created.content, 'The answer is 42.');
  assert.equal(created.meta.quality_gate.outcome, 'repaired');
  assert.deepEqual(created.meta.quality_gate.passes.map((pass) => pass.role), [
    'draft', 'verifier', 'repair', 'final',
  ]);
  assert.equal(reloaded[1].content, 'The answer is 42.');
  assert.deepEqual(reloaded[1].meta.quality_gate, created.meta.quality_gate);
});

test('reject verdict persists controlled blocked outcome and critique metadata', async (t) => {
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return { content: 'Unsupported legal claim.', metadata: metadata('draft-provider', 'draft-block', 0.000004) };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        return {
          verdict: 'reject',
          critique: 'Evidence is insufficient.',
          issueCategories: ['unsupported_claim'],
          metadata: metadata('verifier-provider', 'verify-block', 0.000003),
        };
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        throw new Error('Repair must not run for reject');
      },
    }
  );

  const f = await setup(t, provider);
  const id = await f.createConversation(`Quality block ${process.pid}-${t.name}`);
  await f.appendUser(id, 'Verify this legal claim.');
  const created = await f.generate(id);
  const reloaded = await f.reload(id);

  assert.match(created.content, /did not pass CoMind answer-quality verification/);
  assert.equal(created.meta.quality_gate.verdict, 'reject');
  assert.equal(created.meta.quality_gate.outcome, 'blocked');
  assert.equal(created.meta.quality_gate.critique, 'Evidence is insufficient.');
  assert.deepEqual(created.meta.quality_gate.issue_categories, ['unsupported_claim']);
  assert.deepEqual(reloaded[1].meta.quality_gate, created.meta.quality_gate);
});
