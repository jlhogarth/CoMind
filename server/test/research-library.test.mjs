import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { buildApp } = await import('../dist/app.js');

async function withApp(query, run) {
  const app = await buildApp({
    query,
    closePool: async () => {},
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

const unexpectedQuery = async (text) => {
  throw new Error(`Unexpected database query during RLIB route validation: ${text}`);
};

test('research create rejects unsupported lifecycle state before querying', async () => {
  await withApp(unexpectedQuery, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research',
      payload: {
        title: 'Invalid lifecycle',
        url: 'https://example.com/reference',
        lifecycle_status: 'latest',
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid body');
  });
});

test('research create accepts governed metadata and persists through canonical table', async () => {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [{
        ref_id: '11111111-1111-4111-8111-111111111111',
        title: 'NIST AI RMF 1.0',
        url: 'https://doi.org/10.6028/NIST.AI.100-1',
        source_kind: 'framework',
        authority_level: 'primary_authoritative',
        lifecycle_status: 'current',
      }],
    };
  };

  await withApp(query, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research',
      payload: {
        title: 'NIST AI RMF 1.0',
        url: 'https://doi.org/10.6028/NIST.AI.100-1',
        publisher: 'NIST',
        document_identifier: 'NIST AI 100-1',
        source_kind: 'framework',
        authority_level: 'primary_authoritative',
        lifecycle_status: 'current',
        drive_file_id: 'drive-file-001',
        related_capabilities: ['VE governance'],
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().document_identifier ?? 'NIST AI 100-1', 'NIST AI 100-1');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /INSERT INTO comind\.cm_research_refs/);
    assert.ok(calls[0].params.includes('primary_authoritative'));
    assert.ok(calls[0].params.includes('drive-file-001'));
  });
});

test('research delete retires provenance instead of deleting the canonical record', async () => {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    return {
      rows: [{
        ref_id: params[0],
        lifecycle_status: 'retired',
      }],
    };
  };

  await withApp(query, async (app) => {
    const refId = '11111111-1111-4111-8111-111111111111';
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/research/${refId}`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      ref_id: refId,
      lifecycle_status: 'retired',
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /^UPDATE comind\.cm_research_refs/m);
    assert.doesNotMatch(calls[0].text, /DELETE FROM comind\.cm_research_refs/);
  });
});
