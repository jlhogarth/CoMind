import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const closePoolForTest = async () => {};
const unexpectedQuery = async (text) => {
  throw new Error(`Unexpected database query during chat UI validation test: ${text}`);
};

async function withApp(run) {
  const app = await buildApp({
    query: unexpectedQuery,
    closePool: closePoolForTest,
  });

  try {
    await run(app);
  } finally {
    await app.close();
  }
}

test('chat exposes governed project-scoped durable-memory lifecycle controls', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/chat' });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html/);

    assert.match(response.body, /Durable memory/);
    assert.match(response.body, /Project-scoped, provenance-preserving lifecycle controls/);
    assert.match(response.body, /Memory status filter/);
    assert.match(response.body, /Save metadata/);
    assert.match(response.body, /Archive memory/);
    assert.match(response.body, /Restore memory/);

    assert.match(response.body, /\/api\/projects\//);
    assert.match(response.body, /\/memories/);
    assert.match(response.body, /method: 'PATCH'/);
    assert.match(response.body, /action = selectedMemoryStatus === 'archived' \? 'restore' : 'archive'/);

    assert.match(response.body, /Source content/);
    assert.match(response.body, /Provenance/);
    assert.match(response.body, /JSON\.stringify\(memory\.json_payload/);
    assert.match(response.body, /selectedProjectId = data\.conversation\.project_id/);

    assert.doesNotMatch(response.body, /deleteMemory/i);
    assert.doesNotMatch(response.body, /method: 'DELETE'/);
  });
});
