import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';

const { buildApp } = await import('../../dist/app.js');
const { query: databaseQuery } = await import('../../dist/db.js');

const marker = `MemoryPromotion-${process.pid}`;
const providerCalls = [];
let app;
let projectId;
let conversationId;
let promotedMemoryId;

const assistantProvider = {
  name: 'memory-promotion-integration-provider',
  async generateResponse(request) {
    providerCalls.push(request);
    return {
      content: `Promotion-aware result ${marker}`,
      metadata: {
        provider: 'memory-promotion-integration-provider',
        model: 'deterministic-promotion-model',
        response_id: `promotion-response-${process.pid}`,
      },
    };
  },
};

before(async () => {
  const project = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority)
     VALUES ($1, $2, 5)
     RETURNING project_id`,
    [`Promotion ${marker}`, `memory-promotion-${process.pid}`]
  );
  projectId = project.rows[0].project_id;
  app = await buildApp({ assistantProvider });
});

after(async () => {
  if (conversationId) {
    await databaseQuery('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [conversationId]);
  }
  if (promotedMemoryId) {
    await databaseQuery('DELETE FROM comind.cm_memory_node WHERE memory_id=$1', [promotedMemoryId]);
  }
  if (projectId) {
    await databaseQuery('DELETE FROM comind.cm_project WHERE project_id=$1', [projectId]);
  }
  if (app) await app.close();
});

test('explicit message promotion persists provenance idempotently and becomes retrievable assistant context', async () => {
  const createConversation = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: `Promotion flow ${marker}`, project_id: projectId },
  });
  assert.equal(createConversation.statusCode, 201);
  conversationId = createConversation.json().conv_id;

  const sourceContent = 'The cobalt orchard protocol requires signed provenance before durable retention.';
  const appendSource = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: sourceContent },
  });
  assert.equal(appendSource.statusCode, 201);
  const sourceMessage = appendSource.json();

  const promote = await app.inject({
    method: 'POST',
    url: `/api/messages/${sourceMessage.msg_id}/promote-memory`,
    payload: {
      title: 'Cobalt orchard protocol',
      kind: 'decision',
      subtype: 'retention-policy',
      priority: 8,
      visibility: 'internal',
    },
  });
  assert.equal(promote.statusCode, 201);
  assert.equal(promote.json().created, true);
  const memory = promote.json().memory;
  promotedMemoryId = memory.memory_id;
  assert.equal(memory.project_id, projectId);
  assert.equal(memory.content, sourceContent);
  assert.equal(memory.title, 'Cobalt orchard protocol');
  assert.equal(memory.kind, 'decision');
  assert.equal(memory.subtype, 'retention-policy');
  assert.equal(memory.priority, 8);
  assert.equal(memory.visibility, 'internal');
  assert.equal(memory.status, 'active');
  assert.deepEqual(memory.json_payload, {
    promotion_method: 'conversation_message_explicit_v1',
    source_conversation_id: conversationId,
    source_message_id: sourceMessage.msg_id,
    source_role: 'user',
    source_created_at: sourceMessage.created_at,
  });

  const duplicate = await app.inject({
    method: 'POST',
    url: `/api/messages/${sourceMessage.msg_id}/promote-memory`,
    payload: { title: 'Attempted duplicate title', priority: 2 },
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().created, false);
  assert.equal(duplicate.json().memory.memory_id, promotedMemoryId);
  assert.equal(duplicate.json().memory.title, 'Cobalt orchard protocol');
  assert.equal(duplicate.json().memory.priority, 8);

  const count = await databaseQuery(
    `SELECT COUNT(*)::int AS count
     FROM comind.cm_memory_node
     WHERE project_id=$1
       AND json_payload->>'promotion_method'='conversation_message_explicit_v1'
       AND json_payload->>'source_message_id'=$2`,
    [projectId, sourceMessage.msg_id]
  );
  assert.equal(count.rows[0].count, 1);

  const queryContent = 'What is the cobalt orchard protocol?';
  const appendQuery = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role: 'user', content: queryContent },
  });
  assert.equal(appendQuery.statusCode, 201);

  const assistant = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(assistant.statusCode, 201);
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0];
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[0].content, new RegExp(promotedMemoryId));
  assert.match(request.messages[0].content, /signed provenance before durable retention/);
  assert.deepEqual(request.messages.at(-1), { role: 'user', content: queryContent });
  assert.equal(assistant.json().meta.memory_retrieval.selected_memory_ids.includes(promotedMemoryId), true);

  const persisted = await databaseQuery(
    `SELECT project_id, content, json_payload
     FROM comind.cm_memory_node
     WHERE memory_id=$1`,
    [promotedMemoryId]
  );
  assert.equal(persisted.rows.length, 1);
  assert.equal(persisted.rows[0].project_id, projectId);
  assert.equal(persisted.rows[0].content, sourceContent);
  assert.equal(persisted.rows[0].json_payload.source_message_id, sourceMessage.msg_id);
});
