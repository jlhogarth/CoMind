import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};
const conversationId = '44444444-4444-4444-8444-444444444449';

async function withApp({ query, assistantProvider }, run) {
  const app = await buildApp({
    query,
    closePool: closePoolForTest,
    assistantProvider,
  });

  try {
    await run(app);
  } finally {
    await app.close();
  }
}

test('assistant status reports disabled without touching the database', async () => {
  let queried = false;
  await withApp({
    query: async () => {
      queried = true;
      throw new Error('Database should not be queried');
    },
    assistantProvider: null,
  }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/assistant/status' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { enabled: false, provider: null });
    assert.equal(queried, false);
  });
});

test('assistant generation returns 503 when no provider is configured', async () => {
  let queried = false;
  await withApp({
    query: async () => {
      queried = true;
      throw new Error('Database should not be queried');
    },
    assistantProvider: null,
  }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: 'Assistant provider is not configured' });
    assert.equal(queried, false);
  });
});

test('assistant generation passes persisted history to provider and persists returned metadata', async () => {
  const queries = [];
  const providerCalls = [];
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse(request) {
      providerCalls.push(request);
      return {
        content: 'Persisted assistant answer',
        metadata: {
          provider: 'test-provider',
          model: 'deterministic-test-model',
          response_id: 'test-response-001',
          usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
        },
      };
    },
  };

  const query = async (text, params) => {
    queries.push({ text, params });
    if (text.includes('SELECT conv_id FROM comind.cm_conversation')) {
      return { rows: [{ conv_id: conversationId }] };
    }
    if (text.includes('SELECT role, content')) {
      return {
        rows: [
          { role: 'user', content: 'First persisted message' },
          { role: 'assistant', content: 'Earlier persisted answer' },
          { role: 'user', content: 'Latest persisted message' },
        ],
      };
    }
    if (text.includes('INSERT INTO comind.cm_message')) {
      return {
        rows: [{
          msg_id: '55555555-5555-4555-8555-555555555559',
          conv_id: conversationId,
          role: 'assistant',
          content: params[1],
          created_at: '2026-10-06T09:00:00.000Z',
          meta: JSON.parse(params[2]),
        }],
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  await withApp({ query, assistantProvider }, async (app) => {
    const status = await app.inject({ method: 'GET', url: '/api/assistant/status' });
    assert.deepEqual(status.json(), { enabled: true, provider: 'test-provider' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().role, 'assistant');
    assert.equal(response.json().content, 'Persisted assistant answer');
    assert.deepEqual(providerCalls, [{
      conversationId,
      messages: [
        { role: 'user', content: 'First persisted message' },
        { role: 'assistant', content: 'Earlier persisted answer' },
        { role: 'user', content: 'Latest persisted message' },
      ],
    }]);
    assert.equal(queries.length, 3);
    assert.deepEqual(JSON.parse(queries[2].params[2]), {
      provider: 'test-provider',
      model: 'deterministic-test-model',
      response_id: 'test-response-001',
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    });
  });
});

test('assistant provider failure returns 502 without inserting an assistant message', async () => {
  const queries = [];
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse() {
      throw new Error('Upstream secret-bearing failure details must not escape');
    },
  };

  const query = async (text, params) => {
    queries.push({ text, params });
    if (text.includes('SELECT conv_id FROM comind.cm_conversation')) {
      return { rows: [{ conv_id: conversationId }] };
    }
    if (text.includes('SELECT role, content')) {
      return { rows: [{ role: 'user', content: 'Durable before provider failure' }] };
    }
    throw new Error(`Unexpected write after provider failure: ${text}`);
  };

  await withApp({ query, assistantProvider }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { error: 'Assistant provider request failed' });
    assert.equal(queries.length, 2);
    assert.ok(queries.every((call) => !call.text.includes('INSERT INTO comind.cm_message')));
    assert.doesNotMatch(response.body, /secret-bearing/);
  });
});

test('assistant generation returns 404 before provider invocation for a missing conversation', async () => {
  let providerCalled = false;
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse() {
      providerCalled = true;
      return { content: 'Should not happen' };
    },
  };

  await withApp({
    query: async () => ({ rows: [] }),
    assistantProvider,
  }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: 'Conversation not found' });
    assert.equal(providerCalled, false);
  });
});
