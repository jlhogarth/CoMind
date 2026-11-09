import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, timingSafeEqual } from 'node:crypto';
import worker from './worker.mjs';

const origin = 'https://preview.example.test';
const id = '7c7baf39-a5c3-42cf-988b-1ed69bd501f3';
const token = 'a'.repeat(64);
const access = 'b'.repeat(64);
const env = {
  ALLOWED_ORIGIN: origin, COLLECTION_MODE: 'synthetic-test', TEST_ACCESS_TOKEN: access,
  SUPABASE_URL: 'https://database.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-database-secret',
  TURNSTILE_SECRET: 'test-turnstile-secret', VISITOR_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const fields = { question: 'How can we compare competing explanations?', why: '', known: '', unknown: '' };
const payload = { ...fields, contribution_id: id, consent: true, consent_version: 'web-curiosity-v1', turnstile_token: 'challenge' };
const receipt = { contribution_id: id, created_at: '2026-11-09T00:00:00Z', expires_at: '2027-02-07T00:00:00Z' };
const challenge = { success: true, hostname: 'preview.example.test', action: 'web_curiosity' };
const headers = { origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1',
  'x-withdrawal-token': token, 'x-web001-test-access': access };

function request(body = payload, { path = '/contributions', method = 'POST', header = {}, raw } = {}) {
  const bodyValue = method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined;
  return new Request('https://api.example.test' + path, {
    method, headers: { ...headers, ...header }, body: bodyValue,
    ...(bodyValue instanceof ReadableStream && { duplex: 'half' }),
  });
}

test('preflight is method and path scoped and all allowed-origin responses carry CORS', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected upstream request'));
  const preflight = await worker.fetch(request(null, { method: 'OPTIONS', header: { 'access-control-request-method': 'POST' } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST');
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-withdrawal-token/);
  const rejected = await worker.fetch(request(null, { method: 'OPTIONS', header: { 'access-control-request-method': 'DELETE' } }), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('allow'), 'POST, OPTIONS');
  assert.equal((await worker.fetch(request(null, { method: 'GET' }), env)).status, 405);
  assert.equal((await worker.fetch(request(payload, { path: '/contributions?token=secret' }), env)).status, 404);
  assert.equal((await worker.fetch(request(payload, { path: '/arbitrary' }), env)).status, 404);
  const foreign = await worker.fetch(request(payload, { header: { origin: 'https://other.example.test' } }), env);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});

test('fails closed without the Test gate, edge identity or rate-limit allowance', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected upstream request'));
  assert.equal((await worker.fetch(request(), { ...env, COLLECTION_MODE: 'disabled' })).status, 503);
  assert.equal((await worker.fetch(request(), { ...env, VISITOR_RATE_LIMIT: null })).status, 503);
  assert.equal((await worker.fetch(request(payload, { header: { 'x-web001-test-access': 'c'.repeat(64) } }), env)).status, 403);
  assert.equal((await worker.fetch(request(payload, { header: { 'cf-connecting-ip': '' } }), env)).status, 503);
  const limited = await worker.fetch(request(), { ...env, VISITOR_RATE_LIMIT: {
    limit: async ({ key }) => {
      assert.equal(key, 'POST:192.0.2.1');
      return { success: false };
    },
  } });
  assert.equal(limited.status, 429);
});

test('rejects malformed, oversized or unconsented data without upstream requests', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected upstream request'));
  for (const malformed of ['null', '[]', '"text"', '{bad', new Uint8Array([255])]) {
    assert.equal((await worker.fetch(request(payload, { raw: malformed }), env)).status, 400);
  }
  for (const invalid of [
    { consent: false }, { consent_version: 'old' }, { contribution_id: '../../' },
    { question: 'x'.repeat(1501) }, { question: 'short' }, { question: '😀😀😀😀😀' }, { why: 42 },
    { question: 'Bad string with \u0000' }, { unknown: '\ud800' }, { turnstile_token: '' },
    { turnstile_token: 'x'.repeat(2049) },
  ]) {
    const response = await worker.fetch(request({ ...payload, ...invalid }), env);
    assert.equal(response.status, 422);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  assert.equal((await worker.fetch(request(payload, { header: { 'content-type': 'text/plain' } }), env)).status, 415);
  let cancelled = false;
  const raw = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(22000)); },
    cancel() { cancelled = true; },
  });
  assert.equal((await worker.fetch(request(payload, { raw }), env)).status, 413);
  assert.equal(cancelled, true);
});

test('rejects wrong hostname or action, expired and replayed challenges before storage', async t => {
  for (const result of [
    { ...challenge, hostname: 'other.example.test' }, { ...challenge, action: 'different' },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
  ]) {
    const upstream = t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      return Response.json(result);
    });
    assert.equal((await worker.fetch(request(), env)).status, 403);
    assert.equal(upstream.mock.callCount(), 1);
    upstream.mock.restore();
  }
});

test('submits only approved fields, hashes the token and returns an idempotent receipt', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('siteverify')) {
      assert.equal(options.body.get('response'), 'challenge');
      assert.equal(options.body.get('remoteip'), '192.0.2.1');
      return Response.json(challenge);
    }
    assert.equal(String(url), env.SUPABASE_URL + '/rest/v1/rpc/web001_submit');
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(options.redirect, 'manual');
    calls.push(JSON.parse(options.body));
    return Response.json(receipt);
  });
  for (let retry = 0; retry < 2; retry++) {
    const response = await worker.fetch(request({ ...payload, extra: 'Discard this' }), env);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), receipt);
  }
  assert.deepEqual(calls, [calls[0], calls[0]]);
  assert.deepEqual(calls[0], {
    p_id: id, p_hash: createHash('sha256').update(token).digest('hex'), p_consent_version: 'web-curiosity-v1',
    p_question: fields.question, p_why: null, p_known: null, p_unknown: null,
  });
});

test('converts storage conflicts and failures into safe errors', async t => {
  let result = () => Response.json(null);
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('siteverify') ? Response.json(challenge) : result());
  assert.equal((await worker.fetch(request(), env)).status, 409);
  result = () => { throw new Error(env.SUPABASE_SERVICE_ROLE_KEY + fields.question); };
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'temporarily_unavailable' });
});

test('withdrawal accepts a canonical id and token and reveals nothing when the RPC declines', async t => {
  let matches = false;
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), env.SUPABASE_URL + '/rest/v1/rpc/web001_withdraw');
    assert.deepEqual(JSON.parse(options.body), { p_id: id, p_hash: createHash('sha256').update(token).digest('hex') });
    return Response.json(matches);
  });
  const deletion = { method: 'DELETE', path: '/contributions/' + id };
  assert.equal((await worker.fetch(request(null, { ...deletion, path: '/contributions/------------------------------------' }), env)).status, 404);
  assert.equal((await worker.fetch(request(null, { ...deletion, header: { 'x-withdrawal-token': 'invalid' } }), env)).status, 403);
  assert.equal(upstream.mock.callCount(), 0);
  assert.equal((await worker.fetch(request(null, deletion), env)).status, 404);
  matches = true;
  const response = await worker.fetch(request(null, deletion), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { withdrawn: true });
});

// Cloudflare exposes this constant-time operation on SubtleCrypto; Node exposes it on node:crypto.
Object.defineProperty(crypto.subtle, 'timingSafeEqual', { value: timingSafeEqual });
