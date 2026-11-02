import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyOpenAIApiKeyReadiness } from '../lib/openai-api-key-readiness.js';

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return payload; },
  };
}

test('accepts a valid key only when required model is visible', async () => {
  let request;
  const result = await verifyOpenAIApiKeyReadiness({
    apiKey: 'synthetic-secret',
    requiredModel: 'gpt-6-luna',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6.1-sol' }] });
    },
  });
  assert.equal(result.status, 'authenticated');
  assert.equal(result.requiredModelAvailable, true);
  assert.equal(result.billableModelRequest, false);
  assert.equal(result.promptDataSent, false);
  assert.equal(request.url, 'https://api.openai.com/v1/models');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-secret');
  assert.equal('body' in request.options, false);
});

test('fails closed when API key is missing', async () => {
  await assert.rejects(
    verifyOpenAIApiKeyReadiness({ apiKey: '   ', fetchImpl: async () => response(200, { data: [] }) }),
    (error) => error.code === 'api_key_missing',
  );
});

test('fails closed when OpenAI rejects credential', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      verifyOpenAIApiKeyReadiness({ apiKey: 'synthetic', fetchImpl: async () => response(status, {}) }),
      (error) => error.code === 'api_key_rejected',
    );
  }
});

test('fails closed on network failure', async () => {
  await assert.rejects(
    verifyOpenAIApiKeyReadiness({ apiKey: 'synthetic', fetchImpl: async () => { throw new Error('network'); } }),
    (error) => error.code === 'openai_unreachable',
  );
});

test('fails closed on malformed model response', async () => {
  await assert.rejects(
    verifyOpenAIApiKeyReadiness({ apiKey: 'synthetic', fetchImpl: async () => response(200, { unexpected: [] }) }),
    (error) => error.code === 'openai_readiness_invalid_shape',
  );
});

test('fails closed when configured model is unavailable', async () => {
  await assert.rejects(
    verifyOpenAIApiKeyReadiness({ apiKey: 'synthetic', requiredModel: 'gpt-6-luna', fetchImpl: async () => response(200, { data: [{ id: 'gpt-6.1-sol' }] }) }),
    (error) => error.code === 'required_model_unavailable',
  );
});

test('live readiness workflow cannot invoke paid inference endpoints', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/openai-api-key-readiness.yml', import.meta.url), 'utf8');
  const cli = await readFile(new URL('../scripts/openai-api-key-readiness.mjs', import.meta.url), 'utf8');
  const library = await readFile(new URL('../lib/openai-api-key-readiness.js', import.meta.url), 'utf8');
  const combined = `${workflow}\n${cli}\n${library}`;
  assert.match(combined, /api\.openai\.com\/v1\/models/);
  assert.doesNotMatch(combined, /\/v1\/responses|\/v1\/chat\/completions|\/v1\/embeddings|\/v1\/batch/);
  assert.doesNotMatch(workflow, /echo\s+.*OPENAI_API_KEY|print.*OPENAI_API_KEY/i);
});
