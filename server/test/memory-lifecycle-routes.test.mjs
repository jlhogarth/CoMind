import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

const projectId = '11111111-1111-4111-8111-111111111111';
const memoryId = '22222222-2222-4222-8222-222222222222';
const closePoolForTest = async () => {};

function memory(overrides = {}) {
  return {
    memory_id: memoryId,
    project_id: projectId,
    author_id: null,
    title: 'Durable memory',
    kind: 'decision',
    subtype: null,
    content: 'Immutable source-derived content',
    json_payload: { source_message_id: '33333333-3333-4333-8333-333333333333' },
    priority: 5,
    weight: 1,
    status: 'active',
    visibility: 'internal',
    created_at: '2026-10-07T20:00:00.000Z',
    updated_at: '2026-10-07T20:00:00.000Z',
    last_accessed: null,
    ...overrides,
  };
}

async function withApp(query, run) {
  const app = await buildApp({ query, closePool: closePoolForTest, assistantProvider: null });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

test('memory list is project-scoped, status-filtered, bounded, and deterministically ordered', async () => {
  const calls = [];
  const rows = [memory(), memory({ memory_id: '44444444-4444-4444-8444-444444444444' })];
  await withApp(async (text, params) => {
    calls.push({ text, params });
    return { rows };
  }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/memories?status=archived&limit=25`,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), rows);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [projectId, 'archived', 25]);
    assert.match(calls[0].text, /project_id = \$1::uuid/);
    assert.match(calls[0].text, /ORDER BY updated_at DESC, created_at DESC, memory_id ASC/);
    assert.match(calls[0].text, /LIMIT \$3/);
  });
});

test('memory list validates status and limit before querying', async () => {
  let queried = false;
  await withApp(async () => {
    queried = true;
    throw new Error('Invalid query must not reach database');
  }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/memories?status=deleted&limit=101`,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid query');
    assert.equal(queried, false);
  });
});

test('memory detail is project-scoped and returns 404 when absent', async () => {
  const seen = [];
  await withApp(async (text, params) => {
    seen.push({ text, params });
    return { rows: [] };
  }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/memories/${memoryId}`,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'Memory not found');
    assert.deepEqual(seen[0].params, [projectId, memoryId]);
    assert.match(seen[0].text, /project_id = \$1::uuid AND memory_id = \$2::uuid/);
  });
});

test('metadata update changes only mutable lifecycle fields', async () => {
  const calls = [];
  const updated = memory({
    title: 'Reviewed title',
    subtype: 'policy',
    priority: 9,
    visibility: 'private',
  });
  await withApp(async (text, params) => {
    calls.push({ text, params });
    return { rows: [updated] };
  }, async (app) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/memories/${memoryId}`,
      payload: {
        title: 'Reviewed title',
        subtype: 'policy',
        priority: 9,
        visibility: 'private',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), updated);
    assert.deepEqual(calls[0].params, [
      projectId,
      memoryId,
      'Reviewed title',
      null,
      true,
      'policy',
      9,
      'private',
    ]);
    assert.match(calls[0].text, /updated_at = now\(\)/);
    assert.doesNotMatch(calls[0].text, /SET[\s\S]*content\s*=/);
    assert.doesNotMatch(calls[0].text, /SET[\s\S]*json_payload\s*=/);
    assert.doesNotMatch(calls[0].text, /SET[\s\S]*project_id\s*=/);
  });
});

test('metadata update rejects immutable fields and empty updates before querying', async () => {
  for (const payload of [
    {},
    { content: 'rewrite provenance-bearing content' },
    { json_payload: { replaced: true } },
    { project_id: '55555555-5555-4555-8555-555555555555' },
  ]) {
    let queried = false;
    await withApp(async () => {
      queried = true;
      throw new Error('Invalid mutation must not query');
    }, async (app) => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}/memories/${memoryId}`,
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error, 'Invalid body');
      assert.equal(queried, false);
    });
  }
});

test('metadata update can explicitly clear subtype without changing other metadata', async () => {
  let params;
  await withApp(async (_text, queryParams) => {
    params = queryParams;
    return { rows: [memory({ subtype: null })] };
  }, async (app) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/memories/${memoryId}`,
      payload: { subtype: null },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().subtype, null);
    assert.equal(params[4], true);
    assert.equal(params[5], null);
  });
});

test('archive and restore are project-scoped reversible status updates', async () => {
  const statuses = [];
  await withApp(async (text, params) => {
    const status = text.includes("status = 'archived'") ? 'archived' : 'active';
    statuses.push({ text, params, status });
    return { rows: [memory({ status })] };
  }, async (app) => {
    const archived = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/memories/${memoryId}/archive`,
    });
    assert.equal(archived.statusCode, 200);
    assert.equal(archived.json().status, 'archived');

    const restored = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/memories/${memoryId}/restore`,
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().status, 'active');

    assert.equal(statuses.length, 2);
    assert.ok(statuses.every((entry) => entry.params[0] === projectId && entry.params[1] === memoryId));
    assert.ok(statuses.every((entry) => /updated_at = now\(\)/.test(entry.text)));
    assert.ok(statuses.every((entry) => !/DELETE FROM/.test(entry.text)));
  });
});
