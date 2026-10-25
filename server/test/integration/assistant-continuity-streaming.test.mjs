import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
process.env.ASSISTANT_PROVIDER = 'disabled';

const { buildApp } = await import('../../dist/app.js');
const { query, closePool } = await import('../../dist/db.js');

after(closePool);

async function setup(t, assistantProvider) {
  const app = await buildApp({ assistantProvider, closePool: async () => {} });
  const ids = [];
  t.after(async () => {
    try {
      for (const id of ids) {
        await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [id]);
      }
    } finally {
      await app.close();
    }
  });

  async function createConversation() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title: `CFR stream fixture ${process.pid} ${t.name}` },
    });
    assert.equal(response.statusCode, 201);
    const id = response.json().conv_id;
    ids.push(id);
    return id;
  }

  async function appendUser(id, content) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/messages`,
      payload: { role: 'user', content },
    });
    assert.equal(response.statusCode, 201);
    return response.json();
  }

  const generate = (id) => app.inject({
    method: 'POST',
    url: `/api/conversations/${id}/assistant-response`,
  });

  return { app, createConversation, appendUser, generate };
}

async function captureEvents(convId) {
  const result = await query(
    `SELECT sequence_no, event_type, role, content_delta, generation_id,
            source_system, source_event_ref, raw_payload
     FROM comind.cm_conversation_capture_event
     WHERE conv_id=$1
     ORDER BY sequence_no`,
    [convId]
  );
  return result.rows;
}

async function messages(convId) {
  const result = await query(
    `SELECT msg_id, role, content, meta
     FROM comind.cm_message
     WHERE conv_id=$1
     ORDER BY created_at, msg_id`,
    [convId]
  );
  return result.rows;
}

async function generations(convId) {
  const result = await query(
    `SELECT generation_id, status, assistant_msg_id, failure_code,
            interruption_reason, completed_at, interrupted_at, failed_at
     FROM comind.cm_assistant_generation
     WHERE conv_id=$1
     ORDER BY claimed_at, generation_id`,
    [convId]
  );
  return result.rows;
}

test('completed streaming generation persists ordered deltas before canonical completion', async (t) => {
  const provider = {
    name: 'synthetic_stream',
    async generateResponse(_request, observer) {
      assert.ok(observer);
      await observer.onTextDelta({
        delta: 'Durable ',
        stage: observer.stage,
        providerEventType: 'synthetic.output_text.delta',
        providerSequenceNumber: 10,
        providerResponseId: 'synthetic-complete-1',
      });
      await observer.onTextDelta({
        delta: 'completion',
        stage: observer.stage,
        providerEventType: 'synthetic.output_text.delta',
        providerSequenceNumber: 11,
        providerResponseId: 'synthetic-complete-1',
      });
      return {
        content: 'Durable completion',
        metadata: { provider: 'synthetic_stream', response_id: 'synthetic-complete-1' },
      };
    },
  };

  const f = await setup(t, provider);
  const id = await f.createConversation();
  const user = await f.appendUser(id, 'Prove completed CFR streaming.');
  const response = await f.generate(id);
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().content, 'Durable completion');

  const storedMessages = await messages(id);
  assert.equal(storedMessages.length, 2);
  assert.equal(storedMessages[0].msg_id, user.msg_id);
  assert.deepEqual(storedMessages.map((row) => row.role), ['user', 'assistant']);

  const storedGenerations = await generations(id);
  assert.equal(storedGenerations.length, 1);
  assert.equal(storedGenerations[0].status, 'completed');
  assert.equal(storedGenerations[0].assistant_msg_id, storedMessages[1].msg_id);
  assert.ok(storedGenerations[0].completed_at);

  const events = await captureEvents(id);
  assert.deepEqual(events.map((row) => Number(row.sequence_no)), [1, 2, 3, 4, 5]);
  assert.deepEqual(events.map((row) => row.event_type), [
    'user_message_observed',
    'assistant_generation_started',
    'assistant_delta',
    'assistant_delta',
    'assistant_generation_completed',
  ]);
  assert.equal(
    events.filter((row) => row.event_type === 'assistant_delta')
      .map((row) => row.content_delta)
      .join(''),
    'Durable completion'
  );
  assert.deepEqual(
    events.filter((row) => row.event_type === 'assistant_delta')
      .map((row) => row.raw_payload.quality_stage),
    ['direct', 'direct']
  );
  assert.deepEqual(
    events.filter((row) => row.event_type === 'assistant_delta')
      .map((row) => row.raw_payload.provider_sequence_number),
    [10, 11]
  );
});

test('interrupted streaming generation preserves partial deltas with no canonical assistant message', async (t) => {
  const provider = {
    name: 'synthetic_stream',
    async generateResponse(_request, observer) {
      assert.ok(observer);
      await observer.onTextDelta({
        delta: 'This survived ',
        stage: observer.stage,
        providerEventType: 'synthetic.output_text.delta',
        providerSequenceNumber: 20,
        providerResponseId: 'synthetic-interrupted-1',
      });
      await observer.onTextDelta({
        delta: 'the interruption.',
        stage: observer.stage,
        providerEventType: 'synthetic.output_text.delta',
        providerSequenceNumber: 21,
        providerResponseId: 'synthetic-interrupted-1',
      });
      const error = new Error('Synthetic stream interruption');
      error.code = 'synthetic_disconnect';
      throw error;
    },
  };

  const f = await setup(t, provider);
  const id = await f.createConversation();
  const user = await f.appendUser(id, 'Prove interrupted CFR streaming.');
  const response = await f.generate(id);
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { error: 'Assistant provider request failed' });

  const storedMessages = await messages(id);
  assert.equal(storedMessages.length, 1);
  assert.equal(storedMessages[0].msg_id, user.msg_id);
  assert.equal(storedMessages[0].role, 'user');

  const storedGenerations = await generations(id);
  assert.equal(storedGenerations.length, 1);
  assert.equal(storedGenerations[0].status, 'interrupted');
  assert.equal(storedGenerations[0].assistant_msg_id, null);
  assert.equal(storedGenerations[0].failure_code, null);
  assert.equal(storedGenerations[0].interruption_reason, 'provider_stream_interrupted');
  assert.ok(storedGenerations[0].interrupted_at);

  const events = await captureEvents(id);
  assert.deepEqual(events.map((row) => Number(row.sequence_no)), [1, 2, 3, 4, 5]);
  assert.deepEqual(events.map((row) => row.event_type), [
    'user_message_observed',
    'assistant_generation_started',
    'assistant_delta',
    'assistant_delta',
    'assistant_generation_interrupted',
  ]);
  assert.equal(
    events.filter((row) => row.event_type === 'assistant_delta')
      .map((row) => row.content_delta)
      .join(''),
    'This survived the interruption.'
  );
  assert.equal(events[4].raw_payload.observed_delta_count, 2);
  assert.equal(events[4].raw_payload.captured_delta_count, 2);
});
