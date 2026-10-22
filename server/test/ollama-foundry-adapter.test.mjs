import assert from 'node:assert/strict';
import test from 'node:test';

const {
  createLocalOllamaFoundryAdapter,
  localOllamaFoundryDefaults,
} = await import('../dist/providers/ollama-foundry-adapter.js');

const request = Object.freeze({
  executionContextId: '00000000-0000-4000-8000-000000000001',
  adapterOperationId: '00000000-0000-4000-8000-000000000002',
  capabilityCode: 'foundry.test.proof.verify',
  action: 'verify_handoff',
  authorityLevel: 'C1',
  targetKind: 'repository',
  targetRef: 'synthetic:foundry-test-handoff',
  requestFingerprint: 'a'.repeat(64),
  input: Object.freeze({ prompt: 'Synthetic prompt for adapter verification.' }),
});

test('local Ollama adapter sends one bounded non-streaming request to loopback', async () => {
  let capturedUrl;
  let capturedRequest;
  const adapter = createLocalOllamaFoundryAdapter({
    model: 'qwen3:0.6b',
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedRequest = init;
      return new Response(JSON.stringify({
        model: 'qwen3:0.6b',
        response: 'Verified: one synthetic handoff was reviewed.',
        done: true,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await adapter(request);
  const body = JSON.parse(capturedRequest.body);

  assert.equal(capturedUrl, 'http://127.0.0.1:11434/api/generate');
  assert.equal(capturedRequest.method, 'POST');
  assert.equal(body.model, 'qwen3:0.6b');
  assert.equal(body.prompt, request.input.prompt);
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.options.num_predict, localOllamaFoundryDefaults.maxOutputTokens);
  assert.equal(body.options.seed, 161);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.summary, 'Verified: one synthetic handoff was reviewed.');
  assert.match(result.resultRef, /^ollama-local:\/\/qwen3:0\.6b\/[a-f0-9]{64}$/);
});

test('local Ollama adapter rejects a remote endpoint before making a request', () => {
  assert.throws(
    () => createLocalOllamaFoundryAdapter({ baseUrl: 'https://ollama.com/api' }),
    /only permits a local HTTP Ollama server/
  );
});

test('local Ollama adapter bounds the synthetic prompt before making a request', async () => {
  let called = false;
  const adapter = createLocalOllamaFoundryAdapter({
    fetchImpl: async () => {
      called = true;
      return new Response('{}', { status: 200 });
    },
  });

  await assert.rejects(
    adapter({ ...request, input: { prompt: 'x'.repeat(6_001) } }),
    /at most 6000 characters/
  );
  assert.equal(called, false);
});
