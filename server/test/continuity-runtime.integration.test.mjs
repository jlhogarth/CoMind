import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const enabled = process.env.ACP_ISOLATED_DB_TEST === '1';

test('successful assistant-response schedules restart-safe durable checkpoints off the response hot path', { skip: !enabled }, async () => {
  const { buildApp } = await import('../dist/app.js');
  const { query, closePool } = await import('../dist/db.js');
  let app;
  try {
    const conversationId = randomUUID();
    await query(
      `INSERT INTO comind.cm_conversation (
         conv_id, org_id, project_id, owner_actor_id, source, title, external_ref, metadata
       ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'live',$5,$6,'{}'::jsonb)`,
      [
        conversationId,
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222',
        'ACP runtime integration',
        'acp-runtime-' + conversationId,
      ]
    );

    const assistantProvider = {
      name: 'acp-fixture',
      async generateResponse() { return { content: 'fixture continuity response' }; },
    };

    app = await buildApp({
      checkpointingEnabled: true,
      closePool: async () => {},
      assistantProvider,
    });

    const firstUser = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      payload: { role: 'user', content: 'Persist a compact continuity checkpoint.' },
    });
    assert.equal(firstUser.statusCode, 201);

    const firstAssistant = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(firstAssistant.statusCode, 201);
    assert.match(firstAssistant.headers['server-timing'], /persistence;dur=/);

    await app.close();
    app = undefined;

    app = await buildApp({
      checkpointingEnabled: true,
      closePool: async () => {},
      assistantProvider,
    });

    const secondUser = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      payload: { role: 'user', content: 'Persist another checkpoint after restart.' },
    });
    assert.equal(secondUser.statusCode, 201);

    const secondAssistant = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });
    assert.equal(secondAssistant.statusCode, 201);
    assert.match(secondAssistant.headers['server-timing'], /persistence;dur=/);

    await app.close();
    app = undefined;

    const stored = await query(
      `SELECT checkpoint_id::text, checkpoint
       FROM comind.cm_continuity_checkpoint
       WHERE conversation_id=$1
       ORDER BY created_at ASC, checkpoint_id ASC`,
      [conversationId]
    );
    assert.equal(stored.rows.length, 2);
    const executionIds = new Set(stored.rows.map(row => row.checkpoint.state.executionId));
    assert.equal(executionIds.size, 2);

    const root = stored.rows.find(row => row.checkpoint.state.parentCheckpointId === null);
    const successor = stored.rows.find(row => row.checkpoint.state.parentCheckpointId !== null);
    assert.ok(root);
    assert.ok(successor);
    assert.equal(successor.checkpoint.state.parentCheckpointId, root.checkpoint_id);
    assert.equal(successor.checkpoint.state.workflowId, 'conversation.assistant-response');
    assert.equal(successor.checkpoint.state.executionCursor, 'assistant_response_persisted');
    assert.deepEqual(successor.checkpoint.state.pending, []);
    assert.deepEqual(successor.checkpoint.state.provenance.sourceRefs, ['route:POST /api/conversations/:id/assistant-response']);
  } finally {
    if (app) await app.close();
    await closePool();
  }
});
