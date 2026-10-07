import assert from 'node:assert/strict';
import { after, test } from 'node:test';

// Fail before importing the database pool if this test is aimed outside CI.
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool } = await import('../../dist/db.js');
const { OpenAIAssistantProvider } = await import('../../dist/providers/openai.js');

after(closePool);

function openaiProvider(create) {
  return new OpenAIAssistantProvider({ create }, {
    model: 'gpt-6-luna',
    reasoningEffort: 'low',
    maxOutputTokens: 128,
    timeoutMs: 30000,
    maxRetries: 2,
  });
}

function expectedEmptyMemoryRetrievalMetadata(queryCharacterCount) {
  return {
    strategy: 'project_lexical_v1',
    source: 'cm_memory_node',
    query_character_count: queryCharacterCount,
    query_submitted_character_count: queryCharacterCount,
    candidate_limit: 12,
    candidate_count: 0,
    selected_count: 0,
    rejected_count: 0,
    omitted_for_context_limit: 0,
    selected_memory_ids: [],
    selected_kinds: [],
    selected_scores: [],
    context_character_count: 0,
    max_context_characters: 4000,
    max_memory_characters: 1200,
  };
}

function expectedOpenAiRecoveryMetadata(responseId, queryCharacterCount) {
  const usage = {
    input_tokens: 8,
    prompt_tokens: 8,
    output_tokens: 4,
    completion_tokens: 4,
    total_tokens: 12,
  };

  return {
    provider: 'openai',
    model: 'gpt-6-luna',
    endpoint: 'responses.create',
    response_id: responseId,
    status: 'succeeded',
    cost: {
      estimated_cost_usd: 0.0000028,
      currency: 'USD',
      rate_card_version: 'openai-2026-10-07',
      pricing_source: 'https://developers.openai.com/api/docs/pricing',
      pricing_assumption:
        'OpenAI pricing published 2026-10-07: cached input is 10% of uncached input, cache writes are 1.25x input, Batch/Flex are 50% of Standard, Fast is 2x Standard, and requests above 272K input tokens use long-context rates.',
      model: 'gpt-6-luna',
      canonical_model: 'gpt-6-luna',
      processing_mode: 'standard',
      context_band: 'short',
      billable_tokens: {
        uncached_input: 8,
        cached_input: 0,
        cache_write: 0,
        output: 4,
      },
    },
    usage,
    raw_provider_usage: usage,
    memory_retrieval: expectedEmptyMemoryRetrievalMetadata(queryCharacterCount),
  };
}

async function setup(t, assistantProvider, overrides = {}) {
  const app = await buildApp({ assistantProvider, closePool: async () => {}, ...overrides });
  const ids = [];
  const marker = `RecoveryFixture-${process.pid}-${t.name}`;
  t.after(async () => {
    try {
      for (const id of ids) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [id]);
      }
    } finally {
      await app.close();
    }
  });

  async function createConversation(title = marker) {
    const response = await app.inject({
      method: 'POST', url: '/api/conversations', payload: { title },
    });
    assert.equal(response.statusCode, 201);
    const id = response.json().conv_id;
    ids.push(id);
    return id;
  }

  async function append(id, role, content) {
    const response = await app.inject({
      method: 'POST', url: `/api/conversations/${id}/messages`,
      payload: { role, content },
    });
    assert.equal(response.statusCode, 201);
    return response.json();
  }

  async function stored(id) {
    const result = await query(
      `SELECT msg_id, role, content, meta FROM comind.cm_message
       WHERE conv_id=$1 ORDER BY created_at ASC, msg_id ASC`, [id]
    );
    return result.rows;
  }

  async function reload(id) {
    const response = await app.inject({ method: 'GET', url: `/api/conversations/${id}` });
    assert.equal(response.statusCode, 200);
    return response.json().messages;
  }

  const generate = (id) => app.inject({
    method: 'POST', url: `/api/conversations/${id}/assistant-response`,
  });
  return { app, marker, createConversation, append, stored, reload, generate };
}

test('disabled provider preserves the exact persisted user row', async (t) => {
  const f = await setup(t, null);
  const id = await f.createConversation();
  const user = await f.append(id, 'user', f.marker);
  const before = await f.stored(id);
  const response = await f.generate(id);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'Assistant provider is not configured' });
  assert.deepEqual(await f.stored(id), before);
  assert.deepEqual((await f.reload(id)).map((row) => row.msg_id), [user.msg_id]);
});

test('upstream rejection preserves user data and hides upstream details', async (t) => {
  const transportCalls = [];
  const upstreamDetail = 'SYNTHETIC_UPSTREAM_PRIVATE_DETAIL';
  const f = await setup(t, openaiProvider(async (request) => {
    transportCalls.push(request);
    throw new Error(upstreamDetail);
  }));
  const id = await f.createConversation();
  const user = await f.append(id, 'user', f.marker);
  const before = await f.stored(id);
  const response = await f.generate(id);
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { error: 'Assistant provider request failed' });
  assert.equal(response.body.includes(upstreamDetail), false);
  assert.equal(transportCalls.length, 1);
  assert.deepEqual(transportCalls[0].input, [{ role: 'user', content: f.marker }]);
  assert.deepEqual(await f.stored(id), before);
  assert.deepEqual((await f.reload(id)).map((row) => row.msg_id), [user.msg_id]);
  const search = await f.app.inject({
    method: 'GET', url: `/api/messages/search?q=${encodeURIComponent(f.marker)}`,
  });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(search.json().map((row) => row.msg_id), [user.msg_id]);
});

test('empty OpenAI text never becomes a persisted assistant message', async (t) => {
  let calls = 0;
  const f = await setup(t, openaiProvider(async () => {
    calls++;
    return { id: 'test-empty-response', output_text: '   ', usage: null };
  }));
  const id = await f.createConversation();
  await f.append(id, 'user', f.marker);
  const before = await f.stored(id);
  assert.equal((await f.generate(id)).statusCode, 502);
  assert.equal(calls, 1);
  assert.deepEqual(await f.stored(id), before);
  assert.deepEqual((await f.reload(id)).map((row) => row.role), ['user']);
});

test('persisted tool history is rejected before OpenAI transport', async (t) => {
  let calls = 0;
  const f = await setup(t, openaiProvider(async () => {
    calls++;
    throw new Error('Transport must not be invoked for tool history');
  }));
  const id = await f.createConversation();
  await f.append(id, 'user', f.marker);
  await f.append(id, 'tool', 'Synthetic tool output confined to integration fixtures');
  const before = await f.stored(id);
  assert.equal((await f.generate(id)).statusCode, 502);
  assert.equal(calls, 0);
  assert.deepEqual(await f.stored(id), before);
  assert.deepEqual((await f.reload(id)).map((row) => row.role), ['user', 'tool']);
});

test('recovery and later turns use only the selected persisted chronological history', async (t) => {
  const calls = [];
  let failNext = true;
  const f = await setup(t, openaiProvider(async (request) => {
    calls.push(request);
    if (failNext) {
      failNext = false;
      throw new Error('Synthetic first-attempt transport failure');
    }
    return {
      id: `test-recovery-${calls.length}`,
      output_text: `Persisted recovery ${f.marker} turn ${calls.length}`,
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    };
  }));
  const id = await f.createConversation();
  const otherId = await f.createConversation('Separate integration fixture');
  await f.append(otherId, 'user', 'Other conversation must never reach this provider request');
  const otherBefore = await f.stored(otherId);
  const firstUser = await f.append(id, 'user', `First ${f.marker}`);
  assert.equal((await f.generate(id)).statusCode, 502);
  assert.equal((await f.stored(id)).length, 1);

  const recovered = await f.generate(id);
  assert.equal(recovered.statusCode, 201);
  const firstAssistant = recovered.json();
  const secondUser = await f.append(id, 'user', `Second ${f.marker}`);
  const secondResponse = await f.generate(id);
  assert.equal(secondResponse.statusCode, 201);
  const secondAssistant = secondResponse.json();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].input, [{ role: 'user', content: firstUser.content }]);
  assert.deepEqual(calls[1].input, calls[0].input);
  assert.deepEqual(calls[2].input, [
    { role: 'user', content: firstUser.content },
    { role: 'assistant', content: firstAssistant.content },
    { role: 'user', content: secondUser.content },
  ]);
  assert.ok(calls.every((request) => request.store === false && request.max_output_tokens === 128));

  const expectedIds = [firstUser, firstAssistant, secondUser, secondAssistant].map((row) => row.msg_id);
  const stored = await f.stored(id);
  assert.deepEqual(stored.map((row) => row.msg_id), expectedIds);
  assert.deepEqual(stored.map((row) => row.role), ['user', 'assistant', 'user', 'assistant']);
  assert.deepEqual((await f.reload(id)).map((row) => row.msg_id), expectedIds);
  assert.deepEqual(await f.stored(otherId), otherBefore);
  const assistantMetadata = stored.filter((row) => row.role === 'assistant').map((row) => row.meta);
  assert.equal(assistantMetadata.every((meta) => Number.isInteger(meta.duration_ms)), true);
  assert.deepEqual(
    assistantMetadata.map(({ duration_ms, ...meta }) => meta),
    [
      expectedOpenAiRecoveryMetadata('test-recovery-2', firstUser.content.length),
      expectedOpenAiRecoveryMetadata('test-recovery-3', secondUser.content.length),
    ]
  );

  const search = await f.app.inject({
    method: 'GET', url: `/api/messages/search?q=${encodeURIComponent(f.marker)}`,
  });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(new Set(search.json().map((row) => row.msg_id)), new Set(expectedIds));
  assert.ok(search.json().every((row) => row.conv_id === id));
  const analytics = await f.app.inject({ method: 'GET', url: '/api/analytics/summary' });
  assert.equal(analytics.statusCode, 200);
  assert.equal(analytics.json().top10.find((row) => row.conv_id === id)?.messages, 4);
});

test('configured history budget retains only the newest chronological messages', async (t) => {
  const calls = [];
  const f = await setup(t, openaiProvider(async (request) => {
    calls.push(request);
    return {
      id: 'test-bounded-history',
      output_text: `Bounded history ${f.marker}`,
      usage: { input_tokens: 6, output_tokens: 3, total_tokens: 9 },
    };
  }), { assistantMaxHistoryMessages: 3 });

  const id = await f.createConversation();
  const first = await f.append(id, 'system', `System ${f.marker}`);
  const second = await f.append(id, 'user', `First ${f.marker}`);
  const third = await f.append(id, 'assistant', `Prior assistant ${f.marker}`);
  const fourth = await f.append(id, 'user', `Second ${f.marker}`);

  const response = await f.generate(id);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls, [{
    model: 'gpt-6-luna',
    input: [
      { role: 'user', content: second.content },
      { role: 'assistant', content: third.content },
      { role: 'user', content: fourth.content },
    ],
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 128,
  }]);

  const stored = await f.stored(id);
  assert.deepEqual(stored.map((row) => row.msg_id).slice(0, 4), [
    first.msg_id,
    second.msg_id,
    third.msg_id,
    fourth.msg_id,
  ]);
  assert.deepEqual((await f.reload(id)).map((row) => row.role), [
    'system',
    'user',
    'assistant',
    'user',
    'assistant',
  ]);
});
