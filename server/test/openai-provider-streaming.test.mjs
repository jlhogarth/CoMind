import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { OpenAIAssistantProvider } = await import('../dist/providers/openai.js');

function providerOptions() {
  return {
    model: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'root',
    reasoningEffort: 'low',
    maxOutputTokens: 512,
    timeoutMs: 30000,
    maxRetries: 0,
  };
}

function asyncEvents(events) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

test('OpenAI streaming emits only output-text deltas and completes from response.completed', async () => {
  const calls = [];
  const observed = [];
  const providerEvents = [];
  const provider = new OpenAIAssistantProvider(
    {
      async create(request) {
        calls.push(request);
        return asyncEvents([
          {
            type: 'response.created',
            sequence_number: 1,
            response: { id: 'resp_stream_1', status: 'in_progress' },
          },
          {
            type: 'response.reasoning_text.delta',
            sequence_number: 2,
            delta: 'hidden reasoning must not be observed',
          },
          {
            type: 'response.output_text.delta',
            sequence_number: 3,
            delta: '  Durable ',
            item_id: 'item_1',
            output_index: 0,
            content_index: 0,
          },
          {
            type: 'response.output_text.delta',
            sequence_number: 4,
            delta: 'streaming answer  ',
            item_id: 'item_1',
            output_index: 0,
            content_index: 0,
          },
          {
            type: 'response.completed',
            sequence_number: 5,
            response: {
              id: 'resp_stream_1',
              model: 'gpt-6-luna-2026-09-22',
              status: 'completed',
              usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
            },
          },
        ]);
      },
    },
    providerOptions(),
    true
  );

  const response = await provider.generateResponse(
    {
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Stream the answer.' }],
    },
    {
      stage: 'direct',
      onTextDelta(event) { observed.push(event); },
      onProviderEvent(event) { providerEvents.push(event); },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].stream, true);
  assert.equal(calls[0].store, false);
  assert.equal(response.content, 'Durable streaming answer');
  assert.equal(response.metadata.response_id, 'resp_stream_1');
  assert.equal(response.metadata.status, 'succeeded');
  assert.deepEqual(
    observed.map((event) => ({
      delta: event.delta,
      stage: event.stage,
      type: event.providerEventType,
      sequence: event.providerSequenceNumber,
      responseId: event.providerResponseId,
    })),
    [
      {
        delta: '  Durable ',
        stage: 'direct',
        type: 'response.output_text.delta',
        sequence: 3,
        responseId: 'resp_stream_1',
      },
      {
        delta: 'streaming answer  ',
        stage: 'direct',
        type: 'response.output_text.delta',
        sequence: 4,
        responseId: 'resp_stream_1',
      },
    ]
  );
  assert.equal(observed.some((event) => event.delta.includes('hidden reasoning')), false);
  assert.deepEqual(providerEvents.map((event) => event.providerEventType), [
    'response.created', 'response.reasoning_text.delta', 'response.output_text.delta',
    'response.output_text.delta', 'response.completed',
  ]);
  assert.deepEqual(providerEvents.map((event) => event.providerSequenceNumber), [1, 2, 3, 4, 5]);
  assert.equal(providerEvents[0].providerResponseId, 'resp_stream_1');
  assert.equal(providerEvents[1].payload.delta, 'hidden reasoning must not be observed');
  assert.equal(providerEvents[1].provider, 'openai');
  assert.equal(providerEvents[1].providerEndpoint, 'responses.create');
});

test('OpenAI streaming preserves observed deltas before an incomplete terminal', async () => {
  const observed = [];
  const providerEvents = [];
  const provider = new OpenAIAssistantProvider(
    {
      async create(request) {
        assert.equal(request.stream, true);
        return asyncEvents([
          {
            type: 'response.created',
            sequence_number: 1,
            response: { id: 'resp_stream_incomplete', status: 'in_progress' },
          },
          {
            type: 'response.output_text.delta',
            sequence_number: 2,
            delta: 'Preserved before failure.',
          },
          {
            type: 'response.incomplete',
            sequence_number: 3,
            response: {
              id: 'resp_stream_incomplete',
              model: 'gpt-6-luna-2026-09-22',
              status: 'incomplete',
              usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
            },
          },
        ]);
      },
    },
    providerOptions(),
    true
  );

  await assert.rejects(
    provider.generateResponse(
      {
        conversationId: '44444444-4444-4444-8444-444444444449',
        messages: [{ role: 'user', content: 'Interrupt this stream.' }],
      },
      {
        stage: 'draft',
        onTextDelta(event) { observed.push(event); },
        onProviderEvent(event) { providerEvents.push(event); },
      }
    ),
    (error) => {
      assert.equal(error.code, 'openai_stream_incomplete');
      assert.equal(error.providerMetadata.response_id, 'resp_stream_incomplete');
      assert.equal(error.providerMetadata.status, 'incomplete');
      return true;
    }
  );

  assert.deepEqual(observed.map((event) => event.delta), ['Preserved before failure.']);
  assert.equal(observed[0].stage, 'draft');
  assert.equal(observed[0].providerSequenceNumber, 2);
  assert.equal(observed[0].providerResponseId, 'resp_stream_incomplete');
  assert.deepEqual(providerEvents.map((event) => event.providerEventType), [
    'response.created', 'response.output_text.delta', 'response.incomplete',
  ]);
});

test('OpenAI streaming emits exposed reasoning-summary events without mixing them into assistant text', async () => {
  const providerEvents = []; const textDeltas = [];
  const provider = new OpenAIAssistantProvider({ async create() { return asyncEvents([
    { type: 'response.created', sequence_number: 1, response: { id: 'resp_summary_1', status: 'in_progress' } },
    { type: 'response.reasoning_summary_text.delta', sequence_number: 2, delta: 'Summary fragment', item_id: 'reasoning_1', summary_index: 0 },
    { type: 'response.reasoning_summary_text.done', sequence_number: 3, text: 'Summary fragment', item_id: 'reasoning_1', summary_index: 0 },
    { type: 'response.output_text.delta', sequence_number: 4, delta: 'Visible answer' },
    { type: 'response.completed', sequence_number: 5, response: { id: 'resp_summary_1', model: 'gpt-6-luna-2026-09-22', status: 'completed', usage: null } },
  ]); } }, providerOptions(), true);
  const response = await provider.generateResponse(
    { conversationId: '44444444-4444-4444-8444-444444444449', messages: [{ role: 'user', content: 'Summarize reasoning.' }] },
    { stage: 'direct', onTextDelta(event) { textDeltas.push(event); }, onProviderEvent(event) { providerEvents.push(event); } }
  );
  assert.equal(response.content, 'Visible answer');
  assert.deepEqual(textDeltas.map((event) => event.delta), ['Visible answer']);
  assert.deepEqual(providerEvents.map((event) => event.providerEventType), [
    'response.created', 'response.reasoning_summary_text.delta', 'response.reasoning_summary_text.done',
    'response.output_text.delta', 'response.completed',
  ]);
  assert.equal(providerEvents[1].payload.delta, 'Summary fragment');
  assert.equal(providerEvents[2].payload.text, 'Summary fragment');
  assert.equal(providerEvents[1].metadata.summary_index, 0);
});

test('direct OpenAI provider instances remain non-streaming unless explicitly enabled', async () => {
  const calls = [];
  const provider = new OpenAIAssistantProvider(
    {
      async create(request) {
        calls.push(request);
        return {
          id: 'resp_legacy_nonstream',
          output_text: 'Legacy-compatible response',
          usage: null,
        };
      },
    },
    providerOptions()
  );

  const response = await provider.generateResponse(
    {
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Use the existing test path.' }],
    },
    {
      stage: 'direct',
      onTextDelta() {
        throw new Error('Observer must not run on a non-streaming provider instance');
      },
    }
  );

  assert.equal(response.content, 'Legacy-compatible response');
  assert.equal(calls.length, 1);
  assert.equal('stream' in calls[0], false);
});
