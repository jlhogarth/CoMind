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

test('PostgreSQL conversation lock prevents duplicate provider calls, duplicate replies, and overlapping message writes', async (t) => {
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

  const nextUserTurn = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'A new turn succeeds after the lock is released' },
  });
  assert.equal(nextUserTurn.statusCode, 201);
});
