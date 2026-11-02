import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  readAcceptanceConfig,
  runAcceptance,
  validateAcceptanceEndpoint,
} from '../scripts/cbe-railway-acceptance.mjs';

const TOKEN = 'cbe-host-002-test-token-00000000000000000000';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('acceptance runner performs bounded stop-start-stop sequence without leaking bearer token', async () => {
  const requests = [];
  let stopCount = 0;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    requests.push({
      authorization: request.headers.authorization,
      body: parsed,
    });

    let status;
    if (parsed.action === 'stop_browser') {
      stopCount += 1;
      status = stopCount === 1 ? 'already_stopped' : 'stopped';
    } else if (parsed.action === 'start_browser') {
      status = 'started';
    } else {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'invalid' }));
      return;
    }

    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      status,
      message: 'test response',
      correlation_id: `correlation-${requests.length}`,
      human_action_required: false,
      human_action_url: null,
    }));
  });

  const address = await listen(server);
  try {
    const config = readAcceptanceConfig({
      CBE_ACCEPTANCE_ENDPOINT: `http://127.0.0.1:${address.port}/api/cbe-control`,
      CBE_CONTROL_TOKEN: TOKEN,
      CBE_ACCEPTANCE_HOLD_MS: '1',
      CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS: '5000',
    });
    const evidence = await runAcceptance(config, { sleepImpl: async () => undefined });

    assert.deepEqual(requests.map((entry) => entry.body.action), [
      'stop_browser',
      'start_browser',
      'stop_browser',
    ]);
    for (const entry of requests) {
      assert.equal(entry.authorization, `Bearer ${TOKEN}`);
      assert.equal(entry.body.environment, 'development-test');
      assert.equal(entry.body.production_change, false);
      assert.equal(entry.body.work_key, null);
      assert.equal(entry.body.recovery_id, null);
    }

    assert.deepEqual(evidence.actions.map((entry) => entry.status), [
      'already_stopped',
      'started',
      'stopped',
    ]);
    assert.equal(evidence.endpoint_origin, `http://127.0.0.1:${address.port}`);
    assert.equal(evidence.production_change, false);
    assert.equal(JSON.stringify(evidence).includes(TOKEN), false);
  } finally {
    await close(server);
  }
});

test('public plaintext HTTP endpoint is rejected', () => {
  assert.throws(
    () => validateAcceptanceEndpoint('http://example.com/api/cbe-control'),
    /Plaintext HTTP/
  );
});

test('Railway private-network HTTP endpoint is permitted', () => {
  const endpoint = validateAcceptanceEndpoint(
    'http://cbe-execution-acceptance.railway.internal:3000/api/cbe-control'
  );
  assert.equal(endpoint.hostname, 'cbe-execution-acceptance.railway.internal');
});

test('endpoint must target the exact CBE control path', () => {
  assert.throws(
    () => validateAcceptanceEndpoint('https://example.com/not-cbe'),
    /must target \/api\/cbe-control exactly/
  );
});

test('acceptance configuration enforces token and timing bounds', () => {
  assert.throws(() => readAcceptanceConfig({
    CBE_ACCEPTANCE_ENDPOINT: 'https://example.com/api/cbe-control',
    CBE_CONTROL_TOKEN: 'too-short',
  }), /at least 32 characters/);

  assert.throws(() => readAcceptanceConfig({
    CBE_ACCEPTANCE_ENDPOINT: 'https://example.com/api/cbe-control',
    CBE_CONTROL_TOKEN: TOKEN,
    CBE_ACCEPTANCE_HOLD_MS: '60001',
  }), /CBE_ACCEPTANCE_HOLD_MS/);

  assert.throws(() => readAcceptanceConfig({
    CBE_ACCEPTANCE_ENDPOINT: 'https://example.com/api/cbe-control',
    CBE_CONTROL_TOKEN: TOKEN,
    CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS: '60001',
  }), /CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS/);
});
