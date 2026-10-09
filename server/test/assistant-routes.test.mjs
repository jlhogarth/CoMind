import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};
const conversationId = '44444444-4444-4444-8444-444444444449';
const projectId = '33333333-3333-4333-8333-333333333339';
const userMessageId = '55555555-5555-4555-8555-555555555558';
const assistantMessageId = '55555555-5555-4555-8555-555555555559';
const generationId = '66666666-6666-4666-8666-666666666669';
const claimToken = '77777777-7777-4777-8777-777777777779';

async function withApp({ query, assistantProvider, assistantMaxHistoryMessages }, run) {
  const app = await buildApp({
    query,
    closePool: closePoolForTest,
    assistantProvider,
    ...(assistantMaxHistoryMessages === undefined ? {} : { assistantMaxHistoryMessages }),
  });

  try {
    await run(app);
  } finally {
    await app.close();
  }
}

function createFastPathQuery({
  project = null,
  history = [{
    role: 'user',
    content: 'Latest persisted message',
    msg_id: userMessageId,
    conv_id: conversationId,
    created_at: '2026-10-06T08:59:00.000Z',
    meta: {},
  }],
  memoryRows = [],
  calls = [],
  metadataSink = null,
} = {}) {
  return async (text, params = []) => {
    calls.push({ text, params });

    if (text.includes('SELECT conv_id, project_id FROM comind.cm_conversation WHERE conv_id=$1')) {
      return { rows: [{ conv_id: conversationId, project_id: project }] };
    }
    if (text.includes('FROM LATERAL (')) {
      return {
        rows: [{
          user_msg_id: userMessageId,
          assistant_msg_id: null,
          assistant_conv_id: null,
          assistant_role: null,
          assistant_content: null,
          assistant_created_at: null,
          assistant_meta: null,
        }],
      };
    }
    if (text.includes('AS recent') && text.includes('LIMIT $2')) {
      return { rows: history };
    }
    if (text.includes('INSERT INTO comind.cm_assistant_generation')) {
      return {
        rows: [{
          generation_id: generationId,
          claim_token: claimToken,
          user_msg_id: userMessageId,
        }],
      };
    }
    if (text.includes('WITH ranked AS')) {
      return { rows: memoryRows };
    }
    if (text.includes("SET status='failed'")) {
      return { rows: [{ generation_id: generationId }] };
    }
    if (text.includes('WITH inserted AS (') && text.includes("SET status='completed'")) {
      const metadata = JSON.parse(params[3]);
      if (metadataSink) metadataSink(metadata);
      return {
        rows: [{
          msg_id: assistantMessageId,
          conv_id: conversationId,
          role: 'assistant',
          content: params[2],
          created_at: '2026-10-06T09:00:00.000Z',
          meta: metadata,
        }],
      };
    }

    throw new Error(`Unexpected query: ${text}`);
  };
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

test('assistant generation uses a durable claim, preserves metadata, and exposes phase timing', async () => {
  const calls = [];
  const providerCalls = [];
  let persistedMetadata;
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
  const history = [
    {
      role: 'user',
      content: 'First persisted message',
      msg_id: '55555555-5555-4555-8555-555555555556',
      conv_id: conversationId,
      created_at: '2026-10-06T08:57:00.000Z',
      meta: {},
    },
    {
      role: 'assistant',
      content: 'Earlier persisted answer',
      msg_id: '55555555-5555-4555-8555-555555555557',
      conv_id: conversationId,
      created_at: '2026-10-06T08:58:00.000Z',
      meta: {},
    },
    {
      role: 'user',
      content: 'Latest persisted message',
      msg_id: userMessageId,
      conv_id: conversationId,
      created_at: '2026-10-06T08:59:00.000Z',
      meta: {},
    },
  ];
  const query = createFastPathQuery({
    calls,
    history,
    metadataSink: (metadata) => { persistedMetadata = metadata; },
  });

  await withApp({ query, assistantProvider }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().role, 'assistant');
    assert.equal(response.json().content, 'Persisted assistant answer');
    assert.deepEqual(providerCalls, [{
      conversationId,
      messages: history.map(({ role, content }) => ({ role, content })),
    }]);

    const historyQuery = calls.find((call) => call.text.includes('AS recent'));
    assert.ok(historyQuery);
    assert.match(historyQuery.text, /ORDER BY created_at DESC, msg_id DESC\s+LIMIT \$2/);
    assert.deepEqual(historyQuery.params, [conversationId, 40]);
    assert.ok(calls.some((call) => call.text.includes('INSERT INTO comind.cm_assistant_generation')));
    assert.ok(calls.some((call) => call.text.includes("SET status='completed'")));

    assert.equal(persistedMetadata.provider, 'test-provider');
    assert.equal(persistedMetadata.model, 'deterministic-test-model');
    assert.equal(persistedMetadata.response_id, 'test-response-001');
    assert.deepEqual(persistedMetadata.usage, {
      input_tokens: 12,
      output_tokens: 4,
      total_tokens: 16,
    });
    assert.equal(persistedMetadata.conversation_fast_path.strategy, 'durable_generation_claim_v1');
    assert.equal(persistedMetadata.conversation_fast_path.history_limit, 40);
    assert.equal(persistedMetadata.conversation_fast_path.history_message_count, 3);
    assert.ok(persistedMetadata.conversation_fast_path.claim_ms >= 0);
    assert.ok(persistedMetadata.conversation_fast_path.provider_ms >= 0);
    assert.match(response.headers['server-timing'], /claim;dur=/);
    assert.match(response.headers['server-timing'], /memory;dur=/);
    assert.match(response.headers['server-timing'], /provider;dur=/);
    assert.match(response.headers['server-timing'], /persistence;dur=/);
  });
});

test('assistant generation injects project memory and persists compact retrieval provenance', async () => {
  const providerCalls = [];
  let persistedMetadata;
  const memoryId = '88888888-8888-4888-8888-888888888888';
  const memoryContent = 'Use reviewed rate cards and record per-call cost telemetry.';
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse(request) {
      providerCalls.push(request);
      return {
        content: 'Memory-aware assistant answer',
        metadata: { provider: 'test-provider', response_id: 'memory-response-001' },
      };
    },
  };
  const query = createFastPathQuery({
    project: projectId,
    memoryRows: [{
      memory_id: memoryId,
      title: 'Cost monitoring decision',
      kind: 'decision',
      content: memoryContent,
      score: '0.812345',
    }],
    metadataSink: (metadata) => { persistedMetadata = metadata; },
  });

  await withApp({ query, assistantProvider }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });

    assert.equal(response.statusCode, 201);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].messages.length, 2);
    assert.equal(providerCalls[0].messages[0].role, 'system');
    assert.match(providerCalls[0].messages[0].content, new RegExp(memoryId));
    assert.match(providerCalls[0].messages[0].content, /reviewed rate cards/);
    assert.deepEqual(providerCalls[0].messages[1], {
      role: 'user',
      content: 'Latest persisted message',
    });

    assert.equal(persistedMetadata.memory_retrieval.strategy, 'project_lexical_v1');
    assert.equal(persistedMetadata.memory_retrieval.selected_count, 1);
    assert.deepEqual(persistedMetadata.memory_retrieval.selected_memory_ids, [memoryId]);
    assert.deepEqual(persistedMetadata.memory_retrieval.selected_scores, [0.812345]);
    assert.equal(JSON.stringify(persistedMetadata).includes(memoryContent), false);
  });
});

test('assistant history is bounded by PostgreSQL before provider invocation', async () => {
  const calls = [];
  const providerCalls = [];
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse(request) {
      providerCalls.push(request);
      return { content: 'Bounded assistant answer' };
    },
  };
  const history = [
    {
      role: 'assistant',
      content: 'First assistant turn',
      msg_id: '55555555-5555-4555-8555-555555555557',
      conv_id: conversationId,
      created_at: '2026-10-06T08:58:00.000Z',
      meta: {},
    },
    {
      role: 'user',
      content: 'Second user turn',
      msg_id: userMessageId,
      conv_id: conversationId,
      created_at: '2026-10-06T08:59:00.000Z',
      meta: {},
    },
  ];
  const query = createFastPathQuery({ calls, history });

  await withApp({ query, assistantProvider, assistantMaxHistoryMessages: 2 }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(providerCalls, [{
      conversationId,
      messages: [
        { role: 'assistant', content: 'First assistant turn' },
        { role: 'user', content: 'Second user turn' },
      ],
    }]);

    const historyQuery = calls.find((call) => call.text.includes('AS recent'));
    assert.deepEqual(historyQuery.params, [conversationId, 2]);
    assert.match(historyQuery.text, /LIMIT \$2/);
  });
});

test('assistant provider failure marks the durable claim failed and allows explicit retry', async () => {
  const calls = [];
  const assistantProvider = {
    name: 'test-provider',
    async generateResponse() {
      throw new Error('Upstream secret-bearing failure details must not escape');
    },
  };
  const query = createFastPathQuery({ calls });

  await withApp({ query, assistantProvider }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { error: 'Assistant provider request failed' });
    assert.doesNotMatch(response.body, /secret-bearing/);

    const failedClaim = calls.find((call) => call.text.includes("SET status='failed'"));
    assert.ok(failedClaim);
    assert.deepEqual(failedClaim.params, [generationId, claimToken]);
    assert.equal(calls.some((call) => call.text.includes('WITH inserted AS (')), false);
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
