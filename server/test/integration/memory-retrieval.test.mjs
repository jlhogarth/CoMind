import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';

const { buildApp } = await import('../../dist/app.js');
const { query: databaseQuery } = await import('../../dist/db.js');

const marker = `MemoryRetrieval-${process.pid}`;
const providerCalls = [];
const createdConversationIds = [];
const createdMemoryIds = [];
const createdProjectIds = [];
let app;
let targetProjectId;
let otherProjectId;
let expectedMemoryId;

const assistantProvider = {
  name: 'memory-integration-provider',
  async generateResponse(request) {
    providerCalls.push(request);
    return {
      content: `Memory-aware result ${marker}`,
      metadata: {
        provider: 'memory-integration-provider',
        model: 'deterministic-memory-model',
        response_id: `memory-response-${process.pid}-${providerCalls.length}`,
      },
    };
  },
};

before(async () => {
  const targetProject = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority)
     VALUES ($1, $2, 5)
     RETURNING project_id`,
    [`Target ${marker}`, `memory-target-${process.pid}`]
  );
  targetProjectId = targetProject.rows[0].project_id;
  createdProjectIds.push(targetProjectId);

  const otherProject = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority)
     VALUES ($1, $2, 5)
     RETURNING project_id`,
    [`Other ${marker}`, `memory-other-${process.pid}`]
  );
  otherProjectId = otherProject.rows[0].project_id;
  createdProjectIds.push(otherProjectId);

  const memories = await databaseQuery(
    `INSERT INTO comind.cm_memory_node
       (project_id, title, kind, content, priority, weight, status, visibility)
     VALUES
       ($1, 'Ravenfruit retention protocol', 'decision',
        'The ravenfruit retention protocol requires reviewed provenance before durable promotion.',
        8, 1.2, 'active', 'internal'),
       ($1, 'Ravenfruit operational note', 'note',
        'Ravenfruit retention should preserve provenance and avoid unreviewed promotion.',
        5, 1.0, 'active', 'public'),
       ($1, 'Private ravenfruit secret', 'note',
        'The ravenfruit retention protocol private distractor must never enter general assistant context.',
        10, 2.0, 'active', 'private'),
       ($1, 'Archived ravenfruit rule', 'decision',
        'The ravenfruit retention protocol archived distractor must not be selected.',
        10, 2.0, 'archived', 'internal'),
       ($2, 'Cross-project ravenfruit rule', 'decision',
        'The ravenfruit retention protocol cross-project distractor must not be selected.',
        10, 2.0, 'active', 'internal'),
       ($1, 'Unrelated high priority item', 'decision',
        'Quarterly facilities inventory and parking allocation.',
        10, 2.0, 'active', 'internal')
     RETURNING memory_id, title`,
    [targetProjectId, otherProjectId]
  );
  for (const row of memories.rows) createdMemoryIds.push(row.memory_id);
  expectedMemoryId = memories.rows.find((row) => row.title === 'Ravenfruit retention protocol').memory_id;

  app = await buildApp({ assistantProvider });
});

after(async () => {
  for (const conversationId of createdConversationIds) {
    await databaseQuery('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [conversationId]);
  }
  if (createdMemoryIds.length > 0) {
    await databaseQuery('DELETE FROM comind.cm_memory_node WHERE memory_id = ANY($1::uuid[])', [createdMemoryIds]);
  }
  for (const projectId of createdProjectIds) {
    await databaseQuery('DELETE FROM comind.cm_project WHERE project_id=$1', [projectId]);
  }
  if (app) await app.close();
});

test('assistant retrieval is project-scoped, eligibility-filtered, ranked, bounded, and persisted', async () => {
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: {
      title: `Memory retrieval ${marker}`,
      project_id: targetProjectId,
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const conversationId = createResponse.json().conv_id;
  createdConversationIds.push(conversationId);

  const userContent = 'What was our ravenfruit retention protocol?';
  const userResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: userContent },
  });
  assert.equal(userResponse.statusCode, 201);

  const assistantResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(assistantResponse.statusCode, 201);
  const assistant = assistantResponse.json();

  assert.equal(providerCalls.length, 1);
  const providerRequest = providerCalls[0];
  assert.equal(providerRequest.conversationId, conversationId);
  assert.equal(providerRequest.messages[0].role, 'system');
  assert.match(providerRequest.messages[0].content, /CoMind retrieved memory context follows/);
  assert.match(providerRequest.messages[0].content, new RegExp(expectedMemoryId));
  assert.match(providerRequest.messages[0].content, /reviewed provenance before durable promotion/);
  assert.doesNotMatch(providerRequest.messages[0].content, /private distractor/);
  assert.doesNotMatch(providerRequest.messages[0].content, /archived distractor/);
  assert.doesNotMatch(providerRequest.messages[0].content, /cross-project distractor/);
  assert.doesNotMatch(providerRequest.messages[0].content, /facilities inventory/);
  assert.deepEqual(providerRequest.messages.at(-1), { role: 'user', content: userContent });

  const retrieval = assistant.meta.memory_retrieval;
  assert.equal(retrieval.strategy, 'project_lexical_v1');
  assert.equal(retrieval.selected_count >= 1, true);
  assert.equal(retrieval.selected_memory_ids[0], expectedMemoryId);
  assert.equal(retrieval.selected_memory_ids.includes(expectedMemoryId), true);
  assert.equal(retrieval.selected_count <= 4, true);
  assert.equal(retrieval.context_character_count <= retrieval.max_context_characters, true);
  assert.equal(JSON.stringify(retrieval).includes('reviewed provenance before durable promotion'), false);

  const reload = await app.inject({
    method: 'GET',
    url: `/api/conversations/${conversationId}`,
  });
  assert.equal(reload.statusCode, 200);
  const persisted = reload.json().messages.find((message) => message.role === 'assistant');
  assert.ok(persisted);
  assert.deepEqual(persisted.meta.memory_retrieval, retrieval);

  const stored = await databaseQuery(
    `SELECT meta
     FROM comind.cm_message
     WHERE conv_id=$1 AND role='assistant'`,
    [conversationId]
  );
  assert.equal(stored.rows.length, 1);
  assert.deepEqual(stored.rows[0].meta.memory_retrieval, retrieval);
});
