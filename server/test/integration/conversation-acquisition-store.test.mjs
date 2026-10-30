import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');
const { query, closePool } = await import('../../dist/db.js');
const { persistOpenAIProviderAcquisitionEvent } = await import('../../dist/conversation-acquisition-store.js');
const runStoreIntegration = process.env.CFR_002A_STORE_INTEGRATION === '1';
after(closePool);
async function createFixtureConversation() {
  const convId = 'c002a000-0000-4000-8000-000000000101';
  await query(`INSERT INTO comind.cm_conversation (conv_id, org_id, project_id, source, title, metadata)
    SELECT $1::uuid, p.org_id, p.project_id, 'cfr_002a_synthetic', 'CFR-002A provider acquisition proof',
           '{"synthetic":true,"provider_call":false}'::jsonb
    FROM comind.cm_project p ORDER BY p.created_at, p.project_id LIMIT 1 ON CONFLICT (conv_id) DO NOTHING`, [convId]);
  const message = await query(`INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES ($1::uuid, 'user', 'Synthetic CFR-002A acquisition fixture', '{"synthetic":true}'::jsonb)
    RETURNING msg_id`, [convId]);
  assert.ok(message.rows[0]?.msg_id);
  const generation = await query(`INSERT INTO comind.cm_assistant_generation (conv_id, user_msg_id, provider, metadata)
    VALUES ($1::uuid, $2::uuid, 'openai', '{"synthetic":true,"provider_call":false}'::jsonb) RETURNING generation_id`,
    [convId, message.rows[0].msg_id]);
  assert.ok(generation.rows[0]?.generation_id); return { convId, generationId: generation.rows[0].generation_id };
}
test(
  'CFR-002A store persists source-distinct provider events under constrained writer role',
  { skip: runStoreIntegration ? false : 'requires isolated CFR-002A acquisition schema and writer role' },
  async () => {
  const { convId, generationId } = await createFixtureConversation();
  const summaryReceipt = await persistOpenAIProviderAcquisitionEvent({ conversationId: convId, generationId, localSequence: 1, event: {
    provider: 'openai', providerEndpoint: 'responses.create', providerEventType: 'response.reasoning_summary_text.delta',
    providerSequenceNumber: 7, providerResponseId: 'resp_cfr002a_synthetic', observedAt: '2026-10-30T16:50:00.000Z', stage: 'direct',
    payload: { type: 'response.reasoning_summary_text.delta', sequence_number: 7, item_id: 'reasoning_synthetic_1', summary_index: 0, delta: 'Provider-exposed summary fragment' },
    metadata: { item_id: 'reasoning_synthetic_1', summary_index: 0 } } });
  assert.equal(summaryReceipt.normalizationStatus, 'normalized'); assert.equal(summaryReceipt.normalizationClass, 'reasoning_summary_delta');
  const textReceipt = await persistOpenAIProviderAcquisitionEvent({ conversationId: convId, generationId, localSequence: 2, event: {
    provider: 'openai', providerEndpoint: 'responses.create', providerEventType: 'response.output_text.delta',
    providerSequenceNumber: 8, providerResponseId: 'resp_cfr002a_synthetic', observedAt: '2026-10-30T16:50:00.010Z', stage: 'direct',
    payload: { type: 'response.output_text.delta', sequence_number: 8, delta: 'Visible answer' } } });
  assert.equal(textReceipt.normalizationClass, 'assistant_text_delta');
  const rows = await query(`SELECT o.source_event_family, o.source_sequence_no, o.source_stream_ref, o.raw_envelope_sha256,
    o.raw_envelope_bytes, o.acquisition_metadata, n.status, n.normalization_class, n.evidence
    FROM comind.cm_conversation_acquisition_observation o JOIN comind.cm_conversation_acquisition_normalization n
      ON n.acquisition_observation_id=o.acquisition_observation_id WHERE o.conv_id=$1::uuid ORDER BY o.acquisition_sequence`, [convId]);
  assert.equal(rows.rows.length, 2); assert.deepEqual(rows.rows.map((row) => Number(row.source_sequence_no)), [7, 8]);
  assert.deepEqual(rows.rows.map((row) => row.normalization_class), ['reasoning_summary_delta', 'assistant_text_delta']);
  assert.equal(rows.rows[0].source_stream_ref, 'resp_cfr002a_synthetic'); assert.equal(rows.rows[0].raw_envelope_sha256.length, 64);
  assert.ok(Number(rows.rows[0].raw_envelope_bytes) > 0); assert.equal(rows.rows[0].evidence.normalized_event.content, 'Provider-exposed summary fragment');
  assert.equal(rows.rows[0].acquisition_metadata.provider, 'openai');
  const canonical = await query(`SELECT count(*)::int AS count FROM comind.cm_conversation_capture_event
    WHERE conv_id=$1::uuid AND event_type='assistant_delta'`, [convId]);
  assert.equal(canonical.rows[0].count, 0);
});
