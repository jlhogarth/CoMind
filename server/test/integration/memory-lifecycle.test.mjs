import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';

const { buildApp } = await import('../../dist/app.js');
const { query: databaseQuery } = await import('../../dist/db.js');

const marker = `MemoryLifecycle-${process.pid}`;
const providerCalls = [];
const createdConversationIds = [];
const createdMemoryIds = [];
const createdProjectIds = [];
let app;
let targetProjectId;
let otherProjectId;
let lifecycleMemoryId;
let privateMemoryId;
let crossProjectMemoryId;
let originalLifecycleRow;

const assistantProvider = {
  name: 'memory-lifecycle-integration-provider',
  async generateResponse(request) {
    providerCalls.push(request);
    return {
      content: `Lifecycle verification ${marker}`,
      metadata: {
        provider: 'memory-lifecycle-integration-provider',
        model: 'deterministic-memory-lifecycle-model',
        response_id: `memory-lifecycle-${process.pid}-${providerCalls.length}`,
      },
    };
  },
};

async function createConversationAndRetrieve() {
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: {
      title: `Lifecycle retrieval ${marker}-${createdConversationIds.length + 1}`,
      project_id: targetProjectId,
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const conversationId = createResponse.json().conv_id;
  createdConversationIds.push(conversationId);

  const userResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: 'What is the cobalt orchard lifecycle protocol?' },
  });
  assert.equal(userResponse.statusCode, 201);

  const assistantResponse = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(assistantResponse.statusCode, 201);

  const providerRequest = providerCalls.at(-1);
  assert.ok(providerRequest);
  return providerRequest.messages.map((message) => message.content).join('\n');
}

before(async () => {
  const targetProject = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority)
     VALUES ($1, $2, 5)
     RETURNING project_id`,
    [`Target ${marker}`, `memory-lifecycle-target-${process.pid}`]
  );
  targetProjectId = targetProject.rows[0].project_id;
  createdProjectIds.push(targetProjectId);

  const otherProject = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority)
     VALUES ($1, $2, 5)
     RETURNING project_id`,
    [`Other ${marker}`, `memory-lifecycle-other-${process.pid}`]
  );
  otherProjectId = otherProject.rows[0].project_id;
  createdProjectIds.push(otherProjectId);

  const inserted = await databaseQuery(
    `INSERT INTO comind.cm_memory_node
       (project_id, title, kind, subtype, content, json_payload, priority, weight, status, visibility)
     VALUES
       ($1, 'Cobalt orchard lifecycle protocol', 'decision', 'governance',
        'The cobalt orchard lifecycle protocol requires reversible archival with preserved provenance.',
        $3::jsonb, 8, 1.2, 'active', 'internal'),
       ($1, 'Private cobalt orchard secret', 'note', NULL,
        'Private cobalt orchard lifecycle material must never enter general assistant retrieval.',
        $4::jsonb, 10, 2.0, 'active', 'private'),
       ($2, 'Cross-project cobalt orchard rule', 'decision', NULL,
        'Cross-project cobalt orchard lifecycle material must never cross the project boundary.',
        $5::jsonb, 10, 2.0, 'active', 'internal')
     RETURNING memory_id, project_id, author_id, title, kind, subtype, content, json_payload,
               priority, weight, status, visibility, created_at, updated_at, last_accessed`,
    [
      targetProjectId,
      otherProjectId,
      JSON.stringify({ source: 'integration', marker, immutable: true }),
      JSON.stringify({ source: 'integration-private', marker }),
      JSON.stringify({ source: 'integration-cross-project', marker }),
    ]
  );

  const [lifecycle, privateMemory, crossProject] = inserted.rows;
  lifecycleMemoryId = lifecycle.memory_id;
  privateMemoryId = privateMemory.memory_id;
  crossProjectMemoryId = crossProject.memory_id;
  originalLifecycleRow = lifecycle;
  createdMemoryIds.push(lifecycleMemoryId, privateMemoryId, crossProjectMemoryId);

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

test('durable-memory lifecycle is project-scoped, bounded, reversible, retrieval-aware, and non-destructive', async () => {
  const listResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${targetProjectId}/memories?status=all&limit=100`,
  });
  assert.equal(listResponse.statusCode, 200);
  const listed = listResponse.json();
  assert.equal(listed.some((row) => row.memory_id === lifecycleMemoryId), true);
  assert.equal(listed.some((row) => row.memory_id === privateMemoryId), true);
  assert.equal(listed.some((row) => row.memory_id === crossProjectMemoryId), false);

  const wrongProjectDetail = await app.inject({
    method: 'GET',
    url: `/api/projects/${targetProjectId}/memories/${crossProjectMemoryId}`,
  });
  assert.equal(wrongProjectDetail.statusCode, 404);

  const detailResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${targetProjectId}/memories/${lifecycleMemoryId}`,
  });
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailResponse.json().memory_id, lifecycleMemoryId);

  const patchResponse = await app.inject({
    method: 'PATCH',
    url: `/api/projects/${targetProjectId}/memories/${lifecycleMemoryId}`,
    payload: {
      title: 'Reviewed cobalt orchard lifecycle protocol',
      kind: 'policy',
      subtype: null,
      priority: 9,
      visibility: 'public',
    },
  });
  assert.equal(patchResponse.statusCode, 200);
  assert.equal(patchResponse.json().title, 'Reviewed cobalt orchard lifecycle protocol');
  assert.equal(patchResponse.json().kind, 'policy');
  assert.equal(patchResponse.json().subtype, null);
  assert.equal(patchResponse.json().priority, 9);
  assert.equal(patchResponse.json().visibility, 'public');

  const persistedAfterPatch = await databaseQuery(
    `SELECT memory_id, project_id, author_id, title, kind, subtype, content, json_payload,
            priority, weight, status, visibility, created_at, updated_at, last_accessed
     FROM comind.cm_memory_node
     WHERE memory_id=$1`,
    [lifecycleMemoryId]
  );
  assert.equal(persistedAfterPatch.rows.length, 1);
  const patched = persistedAfterPatch.rows[0];
  assert.equal(patched.project_id, originalLifecycleRow.project_id);
  assert.equal(patched.author_id, originalLifecycleRow.author_id);
  assert.equal(patched.content, originalLifecycleRow.content);
  assert.deepEqual(patched.json_payload, originalLifecycleRow.json_payload);
  assert.deepEqual(patched.created_at, originalLifecycleRow.created_at);
  assert.equal(patched.weight, originalLifecycleRow.weight);
  assert.equal(patched.status, 'active');

  const activeContext = await createConversationAndRetrieve();
  assert.match(activeContext, /reversible archival with preserved provenance/);
  assert.doesNotMatch(activeContext, /Private cobalt orchard lifecycle material/);
  assert.doesNotMatch(activeContext, /Cross-project cobalt orchard lifecycle material/);

  const archiveResponse = await app.inject({
    method: 'POST',
    url: `/api/projects/${targetProjectId}/memories/${lifecycleMemoryId}/archive`,
  });
  assert.equal(archiveResponse.statusCode, 200);
  assert.equal(archiveResponse.json().status, 'archived');

  const archivedContext = await createConversationAndRetrieve();
  assert.doesNotMatch(archivedContext, /reversible archival with preserved provenance/);
  assert.doesNotMatch(archivedContext, /Private cobalt orchard lifecycle material/);
  assert.doesNotMatch(archivedContext, /Cross-project cobalt orchard lifecycle material/);

  const archivedRow = await databaseQuery(
    'SELECT status, count(*) OVER ()::int AS row_count FROM comind.cm_memory_node WHERE memory_id=$1',
    [lifecycleMemoryId]
  );
  assert.equal(archivedRow.rows.length, 1);
  assert.equal(archivedRow.rows[0].status, 'archived');
  assert.equal(archivedRow.rows[0].row_count, 1);

  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/projects/${targetProjectId}/memories/${lifecycleMemoryId}`,
  });
  assert.equal(deleteResponse.statusCode, 404);

  const restoreResponse = await app.inject({
    method: 'POST',
    url: `/api/projects/${targetProjectId}/memories/${lifecycleMemoryId}/restore`,
  });
  assert.equal(restoreResponse.statusCode, 200);
  assert.equal(restoreResponse.json().status, 'active');

  const restoredContext = await createConversationAndRetrieve();
  assert.match(restoredContext, /reversible archival with preserved provenance/);
  assert.doesNotMatch(restoredContext, /Private cobalt orchard lifecycle material/);
  assert.doesNotMatch(restoredContext, /Cross-project cobalt orchard lifecycle material/);

  const finalRow = await databaseQuery(
    `SELECT project_id, author_id, content, json_payload, created_at, status
     FROM comind.cm_memory_node
     WHERE memory_id=$1`,
    [lifecycleMemoryId]
  );
  assert.equal(finalRow.rows.length, 1);
  assert.equal(finalRow.rows[0].project_id, originalLifecycleRow.project_id);
  assert.equal(finalRow.rows[0].author_id, originalLifecycleRow.author_id);
  assert.equal(finalRow.rows[0].content, originalLifecycleRow.content);
  assert.deepEqual(finalRow.rows[0].json_payload, originalLifecycleRow.json_payload);
  assert.deepEqual(finalRow.rows[0].created_at, originalLifecycleRow.created_at);
  assert.equal(finalRow.rows[0].status, 'active');
});
