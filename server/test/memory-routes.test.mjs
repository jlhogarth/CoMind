import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};
const messageId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';

function sourceMessage(overrides = {}) {
  return {
    msg_id: messageId,
    conv_id: conversationId,
    project_id: projectId,
    role: 'user',
    content: 'Durable conversation fact',
    created_at: '2026-10-07T20:00:00.000Z',
    ...overrides,
  };
}

async function withApp(query, run, conversationLock) {
  const app = await buildApp({
    query,
    closePool: closePoolForTest,
    assistantProvider: null,
    ...(conversationLock ? { conversationLock } : {}),
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

test('explicit promotion inherits project, persists exact content and provenance, and returns 201', async () => {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    if (text.includes('FROM comind.cm_message m')) {
      return { rows: [sourceMessage()] };
    }
    if (text.includes('FROM comind.cm_memory_node') && text.includes("json_payload->>'promotion_method'")) {
      return { rows: [] };
    }
    if (text.includes('INSERT INTO comind.cm_memory_node')) {
      return {
        rows: [{
          memory_id: '44444444-4444-4444-8444-444444444444',
          project_id: params[0],
          title: params[1],
          kind: params[2],
          subtype: params[3],
          content: params[4],
          json_payload: JSON.parse(params[5]),
          priority: params[6],
          weight: 1,
          status: 'active',
          visibility: params[7],
        }],
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  await withApp(query, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/messages/${messageId}/promote-memory`,
      payload: { title: 'Remember this fact' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.created, true);
    assert.equal(body.memory.project_id, projectId);
    assert.equal(body.memory.content, 'Durable conversation fact');
    assert.equal(body.memory.kind, 'conversation');
    assert.equal(body.memory.priority, 5);
    assert.equal(body.memory.visibility, 'internal');
    assert.deepEqual(body.memory.json_payload, {
      promotion_method: 'conversation_message_explicit_v1',
      source_conversation_id: conversationId,
      source_message_id: messageId,
      source_role: 'user',
      source_created_at: '2026-10-07T20:00:00.000Z',
    });
    assert.equal(calls.length, 3);
  });
});

test('duplicate promotion returns the existing durable memory without a second insert', async () => {
  let inserts = 0;
  const existing = {
    memory_id: '44444444-4444-4444-8444-444444444444',
    project_id: projectId,
    title: 'Original durable title',
    kind: 'conversation',
    subtype: null,
    content: 'Durable conversation fact',
    json_payload: { source_message_id: messageId },
    priority: 5,
    weight: 1,
    status: 'active',
    visibility: 'internal',
  };
  const query = async (text) => {
    if (text.includes('FROM comind.cm_message m')) return { rows: [sourceMessage()] };
    if (text.includes('FROM comind.cm_memory_node')) return { rows: [existing] };
    if (text.includes('INSERT INTO comind.cm_memory_node')) {
      inserts++;
      throw new Error('Duplicate promotion must not insert');
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  await withApp(query, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/messages/${messageId}/promote-memory`,
      payload: { title: 'Different requested title', priority: 10 },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().created, false);
    assert.deepEqual(response.json().memory, existing);
    assert.equal(inserts, 0);
  });
});

test('promotion fails safely for missing message, projectless source, and unsupported role', async () => {
  const cases = [
    { rows: [], statusCode: 404, error: 'Message not found' },
    {
      rows: [sourceMessage({ project_id: null })],
      statusCode: 409,
      error: 'Source conversation is not assigned to a project',
    },
    {
      rows: [sourceMessage({ role: 'tool' })],
      statusCode: 409,
      error: 'Only user or assistant messages can be promoted to memory',
    },
  ];

  for (const scenario of cases) {
    let calls = 0;
    await withApp(async (text) => {
      calls++;
      if (text.includes('FROM comind.cm_message m')) return { rows: scenario.rows };
      throw new Error(`Unexpected query: ${text}`);
    }, async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${messageId}/promote-memory`,
        payload: { title: 'Safe failure' },
      });
      assert.equal(response.statusCode, scenario.statusCode);
      assert.equal(response.json().error, scenario.error);
      assert.equal(calls, 1);
    });
  }
});

test('promotion validates overrides before touching the database', async () => {
  let queried = false;
  await withApp(async () => {
    queried = true;
    throw new Error('Invalid request must not query');
  }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/messages/${messageId}/promote-memory`,
      payload: { title: '', priority: 11, visibility: 'secret' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
    assert.equal(queried, false);
  });
});

test('promotion returns conflict when the conversation lock is busy', async () => {
  let lockedWorkRan = false;
  const query = async (text) => {
    if (text.includes('FROM comind.cm_message m')) return { rows: [sourceMessage()] };
    throw new Error(`Unexpected query: ${text}`);
  };
  await withApp(
    query,
    async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${messageId}/promote-memory`,
        payload: { title: 'Busy promotion' },
      });
      assert.equal(response.statusCode, 409);
      assert.equal(response.headers['retry-after'], '1');
      assert.equal(response.json().error, 'Conversation memory promotion is already in progress');
      assert.equal(lockedWorkRan, false);
    },
    async (_id, work) => {
      void work;
      return { acquired: false };
    }
  );
});
