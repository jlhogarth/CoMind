import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};
const conversationId = '44444444-4444-4444-8444-444444444449';

test('assistant generation returns conflict without provider invocation when conversation lock is busy', async () => {
  let providerCalls = 0;
  const app = await buildApp({
    closePool: closePoolForTest,
    query: async (text) => {
      if (text.includes('SELECT conv_id, project_id FROM comind.cm_conversation')) {
        return { rows: [{ conv_id: conversationId, project_id: null }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    assistantProvider: {
      name: 'test-provider',
      async generateResponse() {
        providerCalls++;
        return { content: 'Must not be generated' };
      },
    },
    conversationLock: async () => ({ acquired: false }),
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.headers['retry-after'], '1');
    assert.deepEqual(response.json(), {
      error: 'Assistant response generation is already in progress',
    });
    assert.equal(providerCalls, 0);
  } finally {
    await app.close();
  }
});

test('message append returns conflict without a write when assistant generation owns the conversation lock', async () => {
  let queried = false;
  const app = await buildApp({
    closePool: closePoolForTest,
    query: async () => {
      queried = true;
      throw new Error('Message write must not run while the conversation lock is busy');
    },
    assistantProvider: null,
    conversationLock: async () => ({ acquired: false }),
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      payload: { role: 'user', content: 'Concurrent user turn must be rejected' },
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: 'Conversation is generating an assistant response',
    });
    assert.equal(queried, false);
  } finally {
    await app.close();
  }
});

test('assistant replay returns the persisted response without calling the provider again', async () => {
  let providerCalls = 0;
  let insertCalls = 0;
  const existingAssistant = {
    role: 'assistant',
    content: 'Already persisted assistant answer',
    msg_id: '55555555-5555-4555-8555-555555555559',
    conv_id: conversationId,
    created_at: '2026-10-06T09:00:00.000Z',
    meta: { provider: 'test-provider', response_id: 'existing-response' },
  };

  const query = async (text) => {
    if (text.includes('SELECT conv_id, project_id FROM comind.cm_conversation')) {
      return { rows: [{ conv_id: conversationId, project_id: null }] };
    }
    if (text.includes('FROM LATERAL (')) {
      return {
        rows: [{
          user_msg_id: '55555555-5555-4555-8555-555555555558',
          assistant_msg_id: existingAssistant.msg_id,
          assistant_conv_id: existingAssistant.conv_id,
          assistant_role: existingAssistant.role,
          assistant_content: existingAssistant.content,
          assistant_created_at: existingAssistant.created_at,
          assistant_meta: existingAssistant.meta,
        }],
      };
    }
    if (text.includes('INSERT INTO comind.cm_message')) {
      insertCalls++;
      throw new Error('Replay must not insert another assistant message');
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  const app = await buildApp({
    closePool: closePoolForTest,
    query,
    assistantProvider: {
      name: 'test-provider',
      async generateResponse() {
        providerCalls++;
        return { content: 'Must not be generated' };
      },
    },
    conversationLock: async (_id, work) => ({
      acquired: true,
      value: await work(query),
    }),
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/assistant-response`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), existingAssistant);
    assert.equal(providerCalls, 0);
    assert.equal(insertCalls, 0);
  } finally {
    await app.close();
  }
});
