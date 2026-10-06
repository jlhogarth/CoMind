import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';

const { buildApp } = await import('../../dist/app.js');
const { query: databaseQuery } = await import('../../dist/db.js');

let app;
let createdConversationId;
const providerCalls = [];
const marker = `ProviderLifecycle-${process.pid}`;

const assistantProvider = {
  name: 'integration-provider',
  async generateResponse(request) {
    providerCalls.push(request);
    return {
      content: `Assistant persisted ${marker}`,
      metadata: {
        provider: 'integration-provider',
        model: 'deterministic-integration-model',
        response_id: `integration-response-${process.pid}`,
        usage: {
          input_tokens: 9,
          output_tokens: 5,
          total_tokens: 14,
        },
      },
    };
  },
};

before(async () => {
  app = await buildApp({ assistantProvider });
});

after(async () => {
  if (createdConversationId) {
    await databaseQuery('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [createdConversationId]);
  }
  if (app) {
    await app.close();
  }
});

test('assistant provider consumes persisted history and persists durable assistant output', async () => {
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: `Provider integration ${marker}` },
  });
  assert.equal(createResponse.statusCode, 201);
  createdConversationId = createResponse.json().conv_id;

  const userContent = `User persisted ${marker}`;
  const userResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${createdConversationId}/messages`,
    payload: { role: 'user', content: userContent },
  });
  assert.equal(userResponse.statusCode, 201);

  const assistantResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${createdConversationId}/assistant-response`,
  });
  assert.equal(assistantResponse.statusCode, 201);
  const persistedAssistant = assistantResponse.json();
  assert.equal(persistedAssistant.role, 'assistant');
  assert.equal(persistedAssistant.content, `Assistant persisted ${marker}`);
  assert.equal(persistedAssistant.meta.provider, 'integration-provider');
  assert.equal(persistedAssistant.meta.model, 'deterministic-integration-model');
  assert.equal(persistedAssistant.meta.response_id, `integration-response-${process.pid}`);
  assert.deepEqual(persistedAssistant.meta.usage, {
    input_tokens: 9,
    output_tokens: 5,
    total_tokens: 14,
  });

  assert.deepEqual(providerCalls, [{
    conversationId: createdConversationId,
    messages: [{ role: 'user', content: userContent }],
  }]);

  const reloadResponse = await app.inject({
    method: 'GET',
    url: `/api/conversations/${createdConversationId}`,
  });
  assert.equal(reloadResponse.statusCode, 200);
  const reloaded = reloadResponse.json();
  assert.deepEqual(
    reloaded.messages.map((message) => message.role),
    ['user', 'assistant']
  );
  assert.deepEqual(
    reloaded.messages.map((message) => message.content),
    [userContent, `Assistant persisted ${marker}`]
  );

  const searchResponse = await app.inject({
    method: 'GET',
    url: `/api/messages/search?q=${encodeURIComponent(marker)}`,
  });
  assert.equal(searchResponse.statusCode, 200);
  const matches = searchResponse.json();
  assert.equal(matches.length, 2);
  assert.ok(matches.every((match) => match.conv_id === createdConversationId));

  const analyticsResponse = await app.inject({ method: 'GET', url: '/api/analytics/summary' });
  assert.equal(analyticsResponse.statusCode, 200);
  const analytics = analyticsResponse.json();
  assert.equal(
    analytics.top10.find((row) => row.conv_id === createdConversationId)?.messages,
    2
  );

  const stored = await databaseQuery(
    `SELECT role, content, meta
     FROM comind.cm_message
     WHERE conv_id=$1
     ORDER BY created_at ASC, msg_id ASC`,
    [createdConversationId]
  );
  assert.deepEqual(stored.rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(stored.rows[1].meta.provider, 'integration-provider');
  assert.equal(stored.rows[1].meta.model, 'deterministic-integration-model');
  assert.equal(JSON.stringify(stored.rows[1].meta).includes('api_key'), false);
});
