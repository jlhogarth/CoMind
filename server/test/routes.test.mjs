import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};

const unexpectedQuery = async (text) => {
  throw new Error(`Unexpected database query during route validation test: ${text}`);
};

async function withApp(overrides, run) {
  const app = await buildApp({
    query: unexpectedQuery,
    closePool: closePoolForTest,
    ...overrides,
  });

  try {
    await run(app);
  } finally {
    await app.close();
  }
}

test('health endpoint reports the API service', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, service: 'comind-api' });
  });
});

test('database health endpoint returns injected health data', async () => {
  await withApp({
    databaseHealth: async () => ({ ok: 1, database_name: 'comind_test' }),
  }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/db/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: 1, database_name: 'comind_test' });
  });
});

test('database health endpoint surfaces database failures as HTTP 500', async () => {
  await withApp({
    databaseHealth: async () => {
      throw new Error('database health unavailable');
    },
  }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/db/health' });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().message, 'database health unavailable');
  });
});

test('conversation create rejects an empty title before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title: '   ' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
  });
});

test('conversation create persists a live conversation and returns the record', async () => {
  const calls = [];
  const queryForCreate = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [{
        conv_id: '44444444-4444-4444-8444-444444444449',
        project_id: '33333333-3333-4333-8333-333333333333',
        source: 'live',
        title: 'First live conversation',
        created_at: '2026-10-06T07:30:00.000Z',
      }],
    };
  };

  await withApp({ query: queryForCreate }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title: 'First live conversation' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().source, 'live');
    assert.equal(response.json().title, 'First live conversation');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /INSERT INTO comind\.cm_conversation/);
    assert.deepEqual(calls[0].params, [null, 'First live conversation']);
  });
});

test('message append rejects unsupported roles before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations/44444444-4444-4444-8444-444444444449/messages',
      payload: { role: 'model', content: 'Invalid role' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
  });
});

test('message append returns 404 when the conversation does not exist', async () => {
  await withApp({ query: async () => ({ rows: [] }) }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations/44444444-4444-4444-8444-444444444449/messages',
      payload: { role: 'user', content: 'Persist this message' },
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: 'Conversation not found' });
  });
});

test('message append persists a supported role and content', async () => {
  const calls = [];
  const queryForAppend = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [{
        msg_id: '55555555-5555-4555-8555-555555555559',
        conv_id: params[0],
        role: params[1],
        content: params[2],
        created_at: '2026-10-06T07:31:00.000Z',
        meta: null,
      }],
    };
  };

  await withApp({ query: queryForAppend }, async (app) => {
    const conversationId = '44444444-4444-4444-8444-444444444449';
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      payload: { role: 'user', content: 'Persist this message' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().conv_id, conversationId);
    assert.equal(response.json().role, 'user');
    assert.equal(response.json().content, 'Persist this message');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /INSERT INTO comind\.cm_message/);
  });
});

test('conversation detail returns 404 without querying messages when conversation is missing', async () => {
  const calls = [];
  await withApp({
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/conversations/44444444-4444-4444-8444-444444444449',
    });
    assert.equal(response.statusCode, 404);
    assert.equal(calls.length, 1);
  });
});

test('search returns an empty list when q is omitted without querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/messages/search' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  });
});

test('search passes q to the query layer and returns matching rows', async () => {
  const calls = [];
  const queryForSearch = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [
        {
          msg_id: 'msg-001',
          conv_id: 'conv-001',
          role: 'assistant',
          snippet: 'Memory result',
          created_at: '2026-10-06T00:00:00.000Z',
        },
      ],
    };
  };

  await withApp({ query: queryForSearch }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/messages/search?q=memory' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json()[0].msg_id, 'msg-001');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ['memory']);
  });
});

test('analytics summary can be tested without a live database', async () => {
  const queryForAnalytics = async (text) => {
    if (text.includes('FROM comind.cm_conversation')) {
      return { rows: [{ count: 2 }] };
    }
    if (text.includes('GROUP BY conv_id')) {
      return { rows: [{ conv_id: 'conv-001', messages: 3 }] };
    }
    if (text.includes('FROM comind.cm_message')) {
      return { rows: [{ count: 5 }] };
    }
    throw new Error(`Unrecognized analytics query: ${text}`);
  };

  await withApp({ query: queryForAnalytics }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/analytics/summary' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      conversations: 2,
      messages: 5,
      top10: [{ conv_id: 'conv-001', messages: 3 }],
    });
  });
});

test('research create rejects an invalid URL before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research',
      payload: { title: 'Invalid research reference', url: 'not-a-url' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
  });
});

test('research update rejects an empty update before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/research/ref-001',
      payload: {},
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'No fields to update' });
  });
});

test('checklist create rejects an invalid status before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/checklist',
      payload: { item: 'Verify route tests', status: 'queued' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
  });
});

test('checklist update rejects an empty update before querying the database', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/checklist/item-001',
      payload: {},
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'No fields to update' });
  });
});

test('ingest rejects an empty multipart upload before querying the database', async () => {
  const boundary = 'comind-boundary';
  const payload = `--${boundary}--\r\n`;

  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/chatgpt',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'Upload a JSON file from ChatGPT export' });
  });
});

test('admin endpoint serves the CoMind admin page', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/admin' });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html/);
    assert.match(response.body, /<h1>CoMind Admin<\/h1>/);
  });
});

test('chat endpoint serves the durable CoMind chat surface', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/chat' });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html/);
    assert.match(response.body, /<h1>CoMind Chat<\/h1>/);
    assert.match(response.body, /Create conversation/);
    assert.match(response.body, /Assistant provider is not configured yet/);
    assert.match(response.body, /\/api\/conversations/);
    assert.match(response.body, /\/messages/);
  });
});
