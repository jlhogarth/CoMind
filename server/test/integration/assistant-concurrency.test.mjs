import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool, pool } = await import('../../dist/db.js');

after(closePool);

test('durable generation claim prevents duplicate work without holding a database connection across provider latency', async (t) => {
  let providerCalls = 0;
  let providerEnteredResolve;
  let releaseProviderResolve;
  const providerEntered = new Promise((resolve) => {
    providerEnteredResolve = resolve;
  });
  const releaseProvider = new Promise((resolve) => {
    releaseProviderResolve = resolve;
  });

  const assistantProvider = {
    name: 'concurrency-test-provider',
    async generateResponse() {
      providerCalls++;
      providerEnteredResolve();
      await releaseProvider;
      return {
        content: 'Persisted concurrency-safe assistant response',
        metadata: {
          provider: 'concurrency-test-provider',
          model: 'deterministic-concurrency-model',
          response_id: 'concurrency-response-001',
        },
      };
    },
  };

  const app = await buildApp({ assistantProvider, closePool: async () => {} });
  let conversationId;

  t.after(async () => {
    try {
      if (conversationId) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [conversationId]);
      }
    } finally {
      await app.close();
    }
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: `Concurrency fixture ${process.pid}` },
  });
  assert.equal(created.statusCode, 201);
  conversationId = created.json().conv_id;

  const user = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'Generate exactly one assistant response' },
  });
  assert.equal(user.statusCode, 201);

  const firstGeneration = app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });

  await providerEntered;

  assert.equal(
    pool.totalCount,
    pool.idleCount,
    'No PostgreSQL connection may remain checked out while the provider is blocked'
  );

  const activeClaim = await query(
    `SELECT generation_id, user_msg_id, status
     FROM comind.cm_assistant_generation
     WHERE conv_id=$1 AND status='active'`,
    [conversationId]
  );
  assert.equal(activeClaim.rows.length, 1);
  assert.equal(activeClaim.rows[0].user_msg_id, user.json().msg_id);

  const overlappingGeneration = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(overlappingGeneration.statusCode, 409);
  assert.deepEqual(overlappingGeneration.json(), {
    error: 'Assistant response generation is already in progress',
  });

  const overlappingUserTurn = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'This turn must wait until generation completes' },
  });
  assert.equal(overlappingUserTurn.statusCode, 409);
  assert.deepEqual(overlappingUserTurn.json(), {
    error: 'Conversation is generating an assistant response',
  });

  releaseProviderResolve();
  const firstResponse = await firstGeneration;
  assert.equal(firstResponse.statusCode, 201);
  const firstAssistant = firstResponse.json();
  assert.match(firstResponse.headers['server-timing'], /provider;dur=/);

  const replay = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().msg_id, firstAssistant.msg_id);
  assert.equal(providerCalls, 1);

  const stored = await query(
    `SELECT msg_id, role, content
     FROM comind.cm_message
     WHERE conv_id=$1
     ORDER BY created_at ASC, msg_id ASC`,
    [conversationId]
  );
  assert.deepEqual(stored.rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(stored.rows.filter((row) => row.role === 'assistant').length, 1);

  const completedClaim = await query(
    `SELECT status, assistant_msg_id, completed_at, failed_at, failure_code
     FROM comind.cm_assistant_generation
     WHERE conv_id=$1`,
    [conversationId]
  );
  assert.equal(completedClaim.rows.length, 1);
  assert.equal(completedClaim.rows[0].status, 'completed');
  assert.equal(completedClaim.rows[0].assistant_msg_id, firstAssistant.msg_id);
  assert.ok(completedClaim.rows[0].completed_at);
  assert.equal(completedClaim.rows[0].failed_at, null);
  assert.equal(completedClaim.rows[0].failure_code, null);

  const nextUserTurn = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'A new turn succeeds after the claim completes' },
  });
  assert.equal(nextUserTurn.statusCode, 201);
});

test('provider failure terminally releases the claim so an explicit retry can complete', async (t) => {
  let providerCalls = 0;
  const assistantProvider = {
    name: 'retry-test-provider',
    async generateResponse() {
      providerCalls++;
      if (providerCalls === 1) {
        throw new Error('deterministic provider failure');
      }
      return {
        content: 'Retry succeeded after failed generation claim',
        metadata: {
          provider: 'retry-test-provider',
          model: 'deterministic-retry-model',
          response_id: 'retry-response-002',
        },
      };
    },
  };

  const app = await buildApp({ assistantProvider, closePool: async () => {} });
  let conversationId;

  t.after(async () => {
    try {
      if (conversationId) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [conversationId]);
      }
    } finally {
      await app.close();
    }
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: `Retry fixture ${process.pid}` },
  });
  assert.equal(created.statusCode, 201);
  conversationId = created.json().conv_id;

  const user = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'Retry this turn only after explicit failure' },
  });
  assert.equal(user.statusCode, 201);

  const first = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(first.statusCode, 502);

  const afterFailure = await query(
    `SELECT status, assistant_msg_id, completed_at, failed_at, failure_code
     FROM comind.cm_assistant_generation
     WHERE conv_id=$1`,
    [conversationId]
  );
  assert.equal(afterFailure.rows.length, 1);
  assert.equal(afterFailure.rows[0].status, 'failed');
  assert.equal(afterFailure.rows[0].assistant_msg_id, null);
  assert.equal(afterFailure.rows[0].completed_at, null);
  assert.ok(afterFailure.rows[0].failed_at);
  assert.equal(afterFailure.rows[0].failure_code, 'provider_failure');

  const retry = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(retry.statusCode, 201);
  assert.equal(retry.json().content, 'Retry succeeded after failed generation claim');
  assert.equal(providerCalls, 2);

  const terminalStates = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM comind.cm_assistant_generation
     WHERE conv_id=$1
     GROUP BY status
     ORDER BY status`,
    [conversationId]
  );
  assert.deepEqual(terminalStates.rows, [
    { status: 'completed', count: 1 },
    { status: 'failed', count: 1 },
  ]);
});
