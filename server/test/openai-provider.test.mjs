import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { OpenAIAssistantProvider, openAIClientOptions } = await import('../dist/providers/openai.js');

function createProvider(create) {
  return new OpenAIAssistantProvider(
    { create },
    {
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
      maxOutputTokens: 512,
      timeoutMs: 30000,
      maxRetries: 2,
    }
  );
}

test('OpenAI provider sends CoMind history without provider-side storage', async () => {
  const calls = [];
  const provider = createProvider(async (request) => {
    calls.push(request);
    return {
      id: 'resp_test_123',
      model: 'gpt-6-luna-2026-09-22',
      output_text: '  Durable assistant response  ',
      usage: {
        input_tokens: 21,
        output_tokens: 7,
        total_tokens: 28,
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
  assert.deepEqual(response, {
    content: 'Durable assistant response',
    metadata: {
      provider: 'openai',
      model: 'gpt-6-luna-2026-09-22',
      response_id: 'resp_test_123',
      usage: {
        input_tokens: 21,
        output_tokens: 7,
        total_tokens: 28,
      },
    },
  });
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
    model: 'gpt-6-luna',
    output_text: '   ',
    usage: null,
  }));

  await assert.rejects(
    provider.generateResponse({
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Respond.' }],
    }),
    /did not contain assistant text/
  );
});

test('OpenAI client options carry explicit timeout and retry budgets', () => {
  assert.deepEqual(
    openAIClientOptions('test-key-used-only-for-client-option-validation', {
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
      maxOutputTokens: 512,
      timeoutMs: 15000,
      maxRetries: 1,
    }),
    {
      apiKey: 'test-key-used-only-for-client-option-validation',
      timeout: 15000,
      maxRetries: 1,
    }
  );
});
