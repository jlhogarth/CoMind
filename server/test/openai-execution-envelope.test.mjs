import assert from 'node:assert/strict';
import test from 'node:test';

const {
  OpenAIInputTokenCounter,
  buildOpenAIProviderExecutionEnvelope,
  executeOpenAIProviderExecutionEnvelope,
  openAIInputTokenCountRequest,
} = await import('../dist/providers/openai-execution.js');
const {
  assertProviderInputTokenPreflight,
  preflightProviderInputTokens,
} = await import('../dist/providers/provider-execution-envelope.js');

function options(overrides = {}) {
  return {
    model: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'draft',
    reasoningEffort: 'low',
    maxOutputTokens: 512,
    timeoutMs: 30000,
    maxRetries: 2,
    ...overrides,
  };
}

function request() {
  return {
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [
      { role: 'system', content: 'Be precise.' },
      { role: 'user', content: 'Count this exact request.' },
    ],
  };
}

test('OpenAI envelope captures exact provider execution identity and reviewed canonical model', () => {
  const envelope = buildOpenAIProviderExecutionEnvelope(request(), options());

  assert.equal(envelope.provider, 'openai');
  assert.equal(envelope.requested_model, 'gpt-6-luna');
  assert.equal(envelope.canonical_model, 'gpt-6-luna');
  assert.equal(envelope.processing_mode, 'standard');
  assert.equal(envelope.execution_role, 'draft');
  assert.equal(envelope.timeout_ms, 30000);
  assert.equal(envelope.max_retries, 2);
  assert.deepEqual(envelope.request, {
    model: 'gpt-6-luna',
    input: [
      { role: 'system', content: 'Be precise.' },
      { role: 'user', content: 'Count this exact request.' },
    ],
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 512,
  });
});

test('OpenAI execution sends the exact request object held by the immutable envelope', async () => {
  const envelope = buildOpenAIProviderExecutionEnvelope(request(), options());
  let executedRequest;

  const result = await executeOpenAIProviderExecutionEnvelope(
    {
      async create(providerRequest) {
        executedRequest = providerRequest;
        return { id: 'synthetic-response' };
      },
    },
    envelope
  );

  assert.strictEqual(executedRequest, envelope.request);
  assert.deepEqual(result, { id: 'synthetic-response' });
});

test('OpenAI exact token counter consumes count-relevant fields from the same immutable envelope', async () => {
  const envelope = buildOpenAIProviderExecutionEnvelope(request(), options());
  const calls = [];
  const counter = new OpenAIInputTokenCounter({
    async count(countRequest) {
      calls.push(countRequest);
      return { object: 'response.input_tokens', input_tokens: 37 };
    },
  });

  const preflight = await preflightProviderInputTokens(envelope, counter);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    model: 'gpt-6-luna',
    input: envelope.request.input,
    reasoning: envelope.request.reasoning,
  });
  assert.strictEqual(calls[0].input, envelope.request.input);
  assert.strictEqual(calls[0].reasoning, envelope.request.reasoning);
  assert.equal('store' in calls[0], false);
  assert.equal('max_output_tokens' in calls[0], false);
  assert.equal(preflight.envelope_fingerprint, envelope.fingerprint);
  assert.equal(assertProviderInputTokenPreflight(envelope, preflight), 37);
});

test('OpenAI token-count request is itself immutable at the top level', () => {
  const envelope = buildOpenAIProviderExecutionEnvelope(request(), options());
  const countRequest = openAIInputTokenCountRequest(envelope);

  assert.equal(Object.isFrozen(countRequest), true);
  assert.strictEqual(countRequest.input, envelope.request.input);
  assert.strictEqual(countRequest.reasoning, envelope.request.reasoning);
  assert.throws(() => {
    countRequest.model = 'different-model';
  }, TypeError);
});

test('OpenAI envelope construction rejects tool-role history before any provider call', () => {
  assert.throws(
    () => buildOpenAIProviderExecutionEnvelope(
      {
        conversationId: '44444444-4444-4444-8444-444444444449',
        messages: [{ role: 'tool', content: 'Tool output' }],
      },
      options()
    ),
    /does not accept tool-role history/
  );
});

test('OpenAI envelope keeps snapshot requested identity while reusing reviewed canonical pricing identity', () => {
  const envelope = buildOpenAIProviderExecutionEnvelope(
    request(),
    options({ model: 'gpt-6-luna-2026-09-22', executionRole: 'repair' })
  );

  assert.equal(envelope.requested_model, 'gpt-6-luna-2026-09-22');
  assert.equal(envelope.canonical_model, 'gpt-6-luna');
  assert.equal(envelope.request.model, 'gpt-6-luna-2026-09-22');
  assert.equal(envelope.execution_role, 'repair');
});
