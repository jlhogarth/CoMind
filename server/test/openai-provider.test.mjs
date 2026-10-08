import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { OpenAIAssistantProvider, openAIClientOptions } = await import('../dist/providers/openai.js');

function providerOptions(overrides = {}) {
  return {
    model: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'root',
    reasoningEffort: 'low',
    maxOutputTokens: 512,
    timeoutMs: 30000,
    maxRetries: 2,
    ...overrides,
  };
}

function createProvider(create, overrides = {}) {
  return new OpenAIAssistantProvider({ create }, providerOptions(overrides));
}

test('OpenAI provider sends the immutable envelope request without provider-side storage', async () => {
  const calls = [];
  const provider = createProvider(async (request) => {
    calls.push(request);
    return {
      id: 'resp_test_123',
      model: 'gpt-6-luna-2026-09-22',
      output_text: '  Durable assistant response  ',
      usage: {
        input_tokens: 21,
        input_tokens_details: {
          cached_tokens: 6,
        },
        output_tokens: 7,
        output_tokens_details: {
          reasoning_tokens: 2,
        },
        total_tokens: 30,
      },
    };
  });

  const response = await provider.generateResponse({
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'What is persisted?' },
      { role: 'assistant', content: 'Conversation history.' },
      { role: 'user', content: 'Confirm.' },
    ],
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    model: 'gpt-6-luna',
    input: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'What is persisted?' },
      { role: 'assistant', content: 'Conversation history.' },
      { role: 'user', content: 'Confirm.' },
    ],
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 512,
  });
  assert.equal(Object.isFrozen(calls[0]), true);
  assert.equal(Object.isFrozen(calls[0].input), true);
  assert.equal(Object.isFrozen(calls[0].reasoning), true);
  assert.equal(response.content, 'Durable assistant response');
  assert.equal(response.metadata.provider, 'openai');
  assert.equal(response.metadata.model, 'gpt-6-luna-2026-09-22');
  assert.equal(response.metadata.endpoint, 'responses.create');
  assert.equal(response.metadata.response_id, 'resp_test_123');
  assert.equal(response.metadata.status, 'succeeded');
  assert.equal(response.metadata.requested_model, 'gpt-6-luna');
  assert.equal(response.metadata.canonical_model, 'gpt-6-luna');
  assert.equal(response.metadata.processing_mode, 'standard');
  assert.equal(response.metadata.execution_role, 'root');
  assert.match(response.metadata.request_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(response.metadata.timeout_ms, 30000);
  assert.equal(response.metadata.max_retries, 2);
  assert.equal(Number.isInteger(response.metadata.duration_ms), true);
  assert.equal(response.metadata.duration_ms >= 0, true);
  assert.deepEqual(response.metadata.usage, {
    input_tokens: 21,
    prompt_tokens: 21,
    cached_input_tokens: 6,
    cache_read_tokens: 6,
    output_tokens: 7,
    completion_tokens: 7,
    reasoning_tokens: 2,
    total_tokens: 30,
  });
  assert.deepEqual(response.metadata.raw_provider_usage, response.metadata.usage);
  assert.deepEqual(response.metadata.cost, {
    estimated_cost_usd: 0.00000506,
    currency: 'USD',
    rate_card_version: 'openai-2026-10-07',
    pricing_source: 'https://developers.openai.com/api/docs/pricing',
    pricing_assumption:
      'OpenAI pricing published 2026-10-07: cached input is 10% of uncached input, cache writes are 1.25x input, Batch/Flex are 50% of Standard, Fast is 2x Standard, and requests above 272K input tokens use long-context rates.',
    model: 'gpt-6-luna-2026-09-22',
    canonical_model: 'gpt-6-luna',
    processing_mode: 'standard',
    context_band: 'short',
    billable_tokens: {
      uncached_input: 15,
      cached_input: 6,
      cache_write: 0,
      output: 7,
    },
  });
});

test('OpenAI provider attaches execution-envelope provenance to provider failures', async () => {
  const provider = createProvider(async () => {
    const error = new Error('Synthetic provider failure');
    error.status = 429;
    error.code = 'credit_balance_exhausted';
    error.request_id = 'req_test_123';
    throw error;
  }, { executionRole: 'draft' });

  await assert.rejects(
    provider.generateResponse({
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Respond.' }],
    }),
    (error) => {
      assert.equal(error.providerMetadata.provider, 'openai');
      assert.equal(error.providerMetadata.model, 'gpt-6-luna');
      assert.equal(error.providerMetadata.endpoint, 'responses.create');
      assert.equal(error.providerMetadata.status, 'failed');
      assert.equal(error.providerMetadata.error_code, 'credit_balance_exhausted');
      assert.equal(error.providerMetadata.http_status, 429);
      assert.equal(error.providerMetadata.request_id, 'req_test_123');
      assert.equal(error.providerMetadata.execution_role, 'draft');
      assert.equal(error.providerMetadata.processing_mode, 'standard');
      assert.match(error.providerMetadata.request_fingerprint, /^sha256:[0-9a-f]{64}$/);
      assert.equal(Number.isInteger(error.providerMetadata.duration_ms), true);
      assert.equal(error.providerMetadata.duration_ms >= 0, true);
      assert.equal(error.providerMetadata.retry_attempt, null);
      return true;
    },
  );
});

test('OpenAI provider rejects tool-role history while tools are disabled', async () => {
  let called = false;
  const provider = createProvider(async () => {
    called = true;
    throw new Error('Client should not be called');
  });

  await assert.rejects(
    provider.generateResponse({
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'tool', content: 'Tool output' }],
    }),
    /does not accept tool-role history/
  );
  assert.equal(called, false);
});

test('OpenAI provider rejects responses without assistant text', async () => {
  const provider = createProvider(async () => ({
    id: 'resp_empty',
    model: 'gpt-6-luna-2026-09-22',
    output_text: '   ',
    usage: {
      input_tokens: 5,
      output_tokens: 1,
      total_tokens: 6,
    },
  }));

  await assert.rejects(
    provider.generateResponse({
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Respond.' }],
    }),
    (error) => {
      assert.match(error.message, /did not contain assistant text/);
      assert.equal(error.code, 'openai_empty_output');
      assert.equal(error.providerMetadata.provider, 'openai');
      assert.equal(error.providerMetadata.model, 'gpt-6-luna-2026-09-22');
      assert.equal(error.providerMetadata.endpoint, 'responses.create');
      assert.equal(error.providerMetadata.response_id, 'resp_empty');
      assert.equal(error.providerMetadata.status, 'failed');
      assert.equal(error.providerMetadata.error_code, 'openai_empty_output');
      assert.equal(error.providerMetadata.execution_role, 'root');
      assert.match(error.providerMetadata.request_fingerprint, /^sha256:[0-9a-f]{64}$/);
      assert.equal(Number.isInteger(error.providerMetadata.duration_ms), true);
      assert.equal(error.providerMetadata.duration_ms >= 0, true);
      assert.deepEqual(error.providerMetadata.usage, {
        input_tokens: 5,
        prompt_tokens: 5,
        output_tokens: 1,
        completion_tokens: 1,
        total_tokens: 6,
      });
      assert.deepEqual(error.providerMetadata.raw_provider_usage, error.providerMetadata.usage);
      assert.equal(error.providerMetadata.cost.rate_card_version, 'openai-2026-10-07');
      assert.equal(error.providerMetadata.cost.estimated_cost_usd, 0.000001);
      assert.equal(error.providerMetadata.cost.processing_mode, 'standard');
      return true;
    }
  );
});

test('OpenAI client options carry explicit timeout and retry budgets', () => {
  assert.deepEqual(
    openAIClientOptions(
      'test-key-used-only-for-client-option-validation',
      providerOptions({ timeoutMs: 15000, maxRetries: 1 })
    ),
    {
      apiKey: 'test-key-used-only-for-client-option-validation',
      timeout: 15000,
      maxRetries: 1,
    }
  );
});
