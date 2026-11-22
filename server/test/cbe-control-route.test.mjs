import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerCbeControlRoutes } from '../dist/routes/cbe-control.js';
import { CbeControlUnavailableError } from '../dist/cbe-control/executor.js';

const TOKEN = 'cbe-mobile-002-test-token-at-least-32-chars';
const body = {
  action: 'start_browser',
  work_key: null,
  recovery_id: null,
  environment: 'development-test',
  production_change: false,
  requested_at: '2026-11-02T00:00:00.000Z',
};

async function appWith(executor, token = TOKEN) {
  const app = Fastify({ logger: false });
  registerCbeControlRoutes(app, executor, token);
  await app.ready();
  return app;
}

test('CBE control route requires bearer authorization', async () => {
  const app = await appWith({ execute: async () => ({ status: 'started' }), close: async () => {} });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/cbe-control', payload: body });
    assert.equal(response.statusCode, 401);
  } finally { await app.close(); }
});

test('CBE control route strictly rejects extra Production fields', async () => {
  const app = await appWith({ execute: async () => ({ status: 'started' }), close: async () => {} });
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/cbe-control',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { ...body, production: true },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().status, 'invalid_request');
  } finally { await app.close(); }
});

test('authorized bounded action returns only executor result', async () => {
  let observed;
  const app = await appWith({
    execute: async (request) => {
      observed = request;
      return {
        status: 'started', message: 'started', correlation_id: 'corr-1',
        human_action_required: false, human_action_url: null,
      };
    },
    close: async () => {},
  });
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/cbe-control',
      headers: { authorization: `Bearer ${TOKEN}` }, payload: body,
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.json().status, 'started');
    assert.equal(observed.production_change, false);
  } finally { await app.close(); }
});

test('unbound governed resolver returns unavailable, never simulated success', async () => {
  const app = await appWith({
    execute: async () => { throw new CbeControlUnavailableError('recovery_resolver_unavailable', 'resolver missing'); },
    close: async () => {},
  });
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/cbe-control',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { ...body, action: 'wake_conversation', work_key: 'NOTEBOOK-001' },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().status, 'unavailable');
  } finally { await app.close(); }
});

test('missing server capability token fails closed', async () => {
  const app = await appWith({ execute: async () => ({ status: 'started' }), close: async () => {} }, null);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/cbe-control', payload: body });
    assert.equal(response.statusCode, 503);
  } finally { await app.close(); }
});
