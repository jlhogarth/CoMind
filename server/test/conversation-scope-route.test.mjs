import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};

test('conversation creation derives org and project together', async () => {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [{
        conv_id: '44444444-4444-4444-8444-444444444449',
        org_id: '11111111-1111-4111-8111-111111111111',
        project_id: '33333333-3333-4333-8333-333333333333',
        source: 'live',
        title: 'Scoped conversation',
        created_at: '2026-10-29T06:00:00.000Z',
      }],
    };
  };

  const app = await buildApp({ query, closePool: closePoolForTest });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title: 'Scoped conversation' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().org_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(response.json().project_id, '33333333-3333-4333-8333-333333333333');
    assert.match(calls[0].text, /INSERT INTO comind\.cm_conversation \(org_id, project_id, source, title\)/);
    assert.match(calls[0].text, /AND org_id IS NOT NULL/);
  } finally {
    await app.close();
  }
});

test('conversation creation fails visibly when project scope cannot be resolved', async () => {
  const app = await buildApp({
    query: async () => ({ rows: [] }),
    closePool: closePoolForTest,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: {
        title: 'Unresolvable scope',
        project_id: '33333333-3333-4333-8333-333333333333',
      },
    });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: 'Conversation project scope could not be resolved',
    });
  } finally {
    await app.close();
  }
});
