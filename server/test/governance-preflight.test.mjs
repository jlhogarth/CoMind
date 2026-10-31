import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../dist/app.js');

async function buildWithDecision(decision, observer = {}) {
  return buildApp({
    query: async (sql, params) => {
      observer.sql = sql;
      observer.params = params;
      return { rows: [{ decision }], rowCount: 1 };
    },
    assistantProvider: null,
    closePool: async () => {},
  });
}

test('governance preflight forwards structured metadata to the private database gate', async (t) => {
  const observer = {};
  const app = await buildWithDecision({
    control_key: 'DRULE-C13',
    decision: 'allow',
    reason_code: 'EGRESS_AUTHORIZED',
    reason: 'Checks passed.',
  }, observer);
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/preflight',
    payload: {
      controlKey: 'DRULE-C13',
      context: {
        asset_key: 'asset-1',
        destination_key: 'SUPABASE-TEST',
        region: 'us-east-1',
        purpose: 'governance-test',
      },
      record: false,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(observer.sql, /comind_pm\.governance_preflight/);
  assert.equal(observer.params[0], 'DRULE-C13');
  assert.deepEqual(JSON.parse(observer.params[1]), {
    asset_key: 'asset-1',
    destination_key: 'SUPABASE-TEST',
    region: 'us-east-1',
    purpose: 'governance-test',
  });
  assert.equal(observer.params[2], false);
  assert.equal(response.json().decision, 'allow');
});

test('governance preflight rejects raw sensitive fields before database access', async (t) => {
  let queryCalled = false;
  const app = await buildApp({
    query: async () => {
      queryCalled = true;
      return { rows: [], rowCount: 0 };
    },
    assistantProvider: null,
    closePool: async () => {},
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/preflight',
    payload: {
      controlKey: 'DRULE-C11',
      context: { nested: { token: 'redacted-value-is-still-not-accepted' } },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(queryCalled, false);
  assert.equal(response.json().error, 'raw_sensitive_context_rejected');
});

test('governance preflight rejects malformed requests fail closed', async (t) => {
  const app = await buildWithDecision({ decision: 'allow' });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/preflight',
    payload: { context: {} },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'invalid_governance_preflight_request');
});

test('governance preflight returns unavailable rather than inventing an allow decision', async (t) => {
  const app = await buildApp({
    query: async () => ({ rows: [], rowCount: 0 }),
    assistantProvider: null,
    closePool: async () => {},
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/preflight',
    payload: { controlKey: 'DRULE-C17', context: { source_tenant: 'a', target_tenant: 'a' } },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'governance_preflight_unavailable');
});
