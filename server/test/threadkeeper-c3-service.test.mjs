import test from 'node:test';
import assert from 'node:assert/strict';

// The C3 service contract exercises only reference/reader/observability behavior.
// Satisfy server config parsing with an unreachable local sentinel. If this test
// ever performs database I/O accidentally, the connection must fail closed.
process.env.DATABASE_URL ??= 'postgres://invalid:invalid@127.0.0.1:1/tk006_unit_no_db';

const {
  CONVERSATION_HISTORY_EVIDENCE_KIND,
  CONVERSATION_HISTORY_EVIDENCE_VERSION,
  CONVERSATION_HISTORY_PROVIDER,
  ConversationHistoryEvidenceResolver,
  InMemoryThreadKeeperC3Observability,
  buildConversationHistoryEvidenceRef,
  buildConversationHistoryObservation,
  createCertifiedConversationHistoryReader,
} = await import('../dist/threadkeeper/conversation-history-integration.js');

const BASELINE_ID = 'c3060001-0000-4000-8000-000000000001';
const IMPORT_ID = 'c3060001-0000-4000-8000-000000000002';
const CHECKPOINT_ID = 'c3060001-0000-4000-8000-000000000003';
const STREAM_ID = 'c3060001-0000-4000-8000-000000000004';
const CANARY = 'TOP SECRET TRANSCRIPT TEXT MUST NEVER ENTER THREADKEEPER';

function summary(overrides = {}) {
  return {
    baselineId: BASELINE_ID,
    certificationSha256: 'a'.repeat(64),
    archiveCheckpointId: CHECKPOINT_ID,
    archiveStreamId: STREAM_ID,
    sequenceNo: 1,
    checkpointKind: 'baseline',
    importId: IMPORT_ID,
    acceptedAt: '2026-10-27T18:01:00.000Z',
    sourceConversationId: 'conversation:tk006:fixture',
    classification: 'baseline',
    present: true,
    observationImportId: IMPORT_ID,
    rawSourceHash: 'b'.repeat(64),
    normalizedHash: 'c'.repeat(64),
    topologyHash: 'd'.repeat(64),
    attachmentSetHash: null,
    title: CANARY,
    rawConversation: { text: CANARY },
    ...overrides,
  };
}

function readerReturning(value) {
  return {
    async read() { return value; },
    async readByCheckpoint() { return value; },
  };
}

test('Conversation History evidence and observations are reference-only and exclude user-text canaries', () => {
  const fixture = summary();
  const evidence = buildConversationHistoryEvidenceRef(fixture);
  const observation = buildConversationHistoryObservation({ summary: fixture });

  assert.equal(evidence.provider, CONVERSATION_HISTORY_PROVIDER);
  assert.equal(evidence.kind, CONVERSATION_HISTORY_EVIDENCE_KIND);
  assert.equal(evidence.version, CONVERSATION_HISTORY_EVIDENCE_VERSION);
  assert.match(evidence.digest, /^[a-f0-9]{64}$/);
  assert.match(evidence.ref, /:checkpoint:/);
  assert.equal(observation.scopeBinding.scopeType, 'conversation');
  assert.equal(observation.scopeBinding.subjectRef, 'chatgpt:conversation:tk006:fixture');
  assert.equal(observation.evidenceRefs[0].digest, evidence.digest);
  assert.equal(observation.currentStateRefs.length, 4);
  assert.equal(observation.observedAt, '2026-10-27T18:01:00.000Z');
  assert.match(observation.correlationId, /^tk-c3:/);

  const serialized = JSON.stringify({ evidence, observation });
  assert.equal(serialized.includes(CANARY), false);
  assert.equal(serialized.includes('rawConversation'), false);
  assert.equal(serialized.includes('title'), false);
});

test('Conversation History evidence resolver distinguishes available, missing, conflicting, and unverifiable evidence', async () => {
  const fixture = summary();
  const evidence = buildConversationHistoryEvidenceRef(fixture);
  const available = new ConversationHistoryEvidenceResolver(readerReturning(fixture));
  assert.equal((await available.resolve(evidence)).status, 'available');

  const missing = new ConversationHistoryEvidenceResolver(readerReturning(null));
  assert.equal((await missing.resolve(evidence)).status, 'missing');

  const changed = new ConversationHistoryEvidenceResolver(readerReturning(
    summary({ normalizedHash: 'e'.repeat(64) }),
  ));
  assert.equal((await changed.resolve(evidence)).status, 'conflicting');

  const outage = new ConversationHistoryEvidenceResolver({
    async read() { throw new Error('synthetic history outage'); },
    async readByCheckpoint() { throw new Error('synthetic history outage'); },
  });
  assert.equal((await outage.resolve(evidence)).status, 'unverifiable');

  const malformed = structuredClone(evidence);
  malformed.ref = 'not-a-governed-conversation-history-reference';
  assert.equal((await available.resolve(malformed)).status, 'unverifiable');
});

test('Conversation History snapshot validation supports differential and absence evidence explicitly', () => {
  const differential = summary({
    archiveCheckpointId: 'c3060002-0000-4000-8000-000000000003',
    importId: 'c3060002-0000-4000-8000-000000000002',
    observationImportId: IMPORT_ID,
    sequenceNo: 2,
    checkpointKind: 'differential',
    classification: 'unchanged',
    acceptedAt: '2026-10-27T19:01:00.000Z',
  });
  const unchangedObservation = buildConversationHistoryObservation({ summary: differential });
  assert.equal(unchangedObservation.findingType, 'unchanged');
  assert.equal(unchangedObservation.currentStateRefs.length, 4);

  const absent = summary({
    archiveCheckpointId: 'c3060003-0000-4000-8000-000000000003',
    importId: 'c3060003-0000-4000-8000-000000000002',
    sequenceNo: 2,
    checkpointKind: 'differential',
    classification: 'absent',
    present: false,
    observationImportId: null,
    rawSourceHash: null,
    normalizedHash: null,
    topologyHash: null,
    attachmentSetHash: null,
    acceptedAt: '2026-10-27T20:01:00.000Z',
  });
  const absentObservation = buildConversationHistoryObservation({ summary: absent });
  assert.deepEqual(absentObservation.currentStateRefs, ['urn:comind:chist:presence:absent']);
  assert.equal(absentObservation.findingType, 'absent');
});

test('accepted Conversation History reader requires governed role and selects summary fields only', async () => {
  const wrongRoleReader = createCertifiedConversationHistoryReader(async () => ({
    rows: [{ current_user: 'service_role' }],
  }));
  await assert.rejects(
    () => wrongRoleReader.read({ importId: IMPORT_ID, sourceConversationId: 'conversation:tk006:fixture' }),
    /requires comind_conversation_history_reader/,
  );

  let call = 0;
  const governedReader = createCertifiedConversationHistoryReader(async (sql) => {
    call += 1;
    if (call === 1) return { rows: [{ current_user: 'comind_conversation_history_reader' }] };
    assert.equal(/raw_conversation|raw_node|content_text|title/i.test(sql), false, sql);
    return {
      rows: [{
        baseline_id: BASELINE_ID,
        certification_sha256: 'a'.repeat(64),
        checkpoint_id: CHECKPOINT_ID,
        archive_stream_id: STREAM_ID,
        sequence_no: '1',
        checkpoint_kind: 'baseline',
        import_id: IMPORT_ID,
        accepted_at: '2026-10-27T18:01:00.000Z',
        source_conversation_id: 'conversation:tk006:fixture',
        classification: 'baseline',
        present: true,
        observation_import_id: IMPORT_ID,
        raw_source_hash: 'b'.repeat(64),
        normalized_hash: 'c'.repeat(64),
        topology_hash: 'd'.repeat(64),
        attachment_set_hash: null,
      }],
    };
  });
  const result = await governedReader.read({
    importId: IMPORT_ID,
    sourceConversationId: 'conversation:tk006:fixture',
  });
  assert.equal(result.sourceConversationId, 'conversation:tk006:fixture');
  assert.equal(result.normalizedHash, 'c'.repeat(64));
  assert.equal(result.archiveCheckpointId, CHECKPOINT_ID);
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test('C3 observability accepts only categorical outcomes and numeric latencies', () => {
  const metrics = new InMemoryThreadKeeperC3Observability();
  metrics.historyEvidence('available');
  metrics.historyEvidence('missing');
  metrics.handoff('resolved');
  metrics.handoff('stale_checkpoint');
  metrics.latency('history_summary_read', 2.5);
  metrics.latency('integration_assessment', 4);
  metrics.latency('handoff_resolution', 1);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.historyEvidence.available, 1);
  assert.equal(snapshot.historyEvidence.missing, 1);
  assert.equal(snapshot.handoffs.resolved, 1);
  assert.equal(snapshot.handoffs.stale_checkpoint, 1);
  assert.deepEqual(snapshot.latencies.history_summary_read, [2.5]);
  assert.equal(JSON.stringify(snapshot).includes(CANARY), false);
  assert.throws(() => metrics.latency('handoff_resolution', -1), /Invalid ThreadKeeper C3 latency/);
});
