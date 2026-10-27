import test from 'node:test';
import assert from 'node:assert/strict';

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
const CANARY = 'TOP SECRET TRANSCRIPT TEXT MUST NEVER ENTER THREADKEEPER';

function summary(overrides = {}) {
  return {
    baselineId: BASELINE_ID,
    certificationSha256: 'a'.repeat(64),
    importId: IMPORT_ID,
    sourceConversationId: 'conversation:tk006:fixture',
    createdAt: '2026-10-27T18:00:00.000Z',
    updatedAt: '2026-10-27T18:01:00.000Z',
    rawSourceHash: 'b'.repeat(64),
    normalizedHash: 'c'.repeat(64),
    topologyHash: 'd'.repeat(64),
    nodeCount: 4,
    messageCount: 3,
    attachmentReferenceCount: 1,
    title: CANARY,
    rawConversation: { text: CANARY },
    ...overrides,
  };
}

test('Conversation History evidence and observations are reference-only and exclude user-text canaries', () => {
  const fixture = summary();
  const evidence = buildConversationHistoryEvidenceRef(fixture);
  const observation = buildConversationHistoryObservation({
    summary: fixture,
    observedAt: '2026-10-27T18:02:00.000Z',
    correlationId: 'corr:tk006:1',
    traceId: 'trace-tk006-1',
  });

  assert.equal(evidence.provider, CONVERSATION_HISTORY_PROVIDER);
  assert.equal(evidence.kind, CONVERSATION_HISTORY_EVIDENCE_KIND);
  assert.equal(evidence.version, CONVERSATION_HISTORY_EVIDENCE_VERSION);
  assert.match(evidence.digest, /^[a-f0-9]{64}$/);
  assert.equal(observation.scopeBinding.scopeType, 'conversation');
  assert.equal(observation.scopeBinding.subjectRef, 'chatgpt:conversation:tk006:fixture');
  assert.equal(observation.evidenceRefs[0].digest, evidence.digest);
  assert.equal(observation.currentStateRefs.length, 3);
  assert.equal(observation.traceId, 'trace-tk006-1');

  const serialized = JSON.stringify({ evidence, observation });
  assert.equal(serialized.includes(CANARY), false);
  assert.equal(serialized.includes('rawConversation'), false);
  assert.equal(serialized.includes('title'), false);
});

test('Conversation History evidence resolver distinguishes available, missing, conflicting, and unverifiable evidence', async () => {
  const fixture = summary();
  const evidence = buildConversationHistoryEvidenceRef(fixture);
  const available = new ConversationHistoryEvidenceResolver({
    async read() { return fixture; },
  });
  assert.equal((await available.resolve(evidence)).status, 'available');

  const missing = new ConversationHistoryEvidenceResolver({
    async read() { return null; },
  });
  assert.equal((await missing.resolve(evidence)).status, 'missing');

  const changed = new ConversationHistoryEvidenceResolver({
    async read() { return summary({ normalizedHash: 'e'.repeat(64) }); },
  });
  assert.equal((await changed.resolve(evidence)).status, 'conflicting');

  const outage = new ConversationHistoryEvidenceResolver({
    async read() { throw new Error('synthetic history outage'); },
  });
  assert.equal((await outage.resolve(evidence)).status, 'unverifiable');

  const malformed = structuredClone(evidence);
  malformed.ref = 'not-a-governed-conversation-history-reference';
  assert.equal((await available.resolve(malformed)).status, 'unverifiable');
});

test('certified Conversation History reader requires the governed reader role and selects summary fields only', async () => {
  const queries = [];
  const wrongRoleReader = createCertifiedConversationHistoryReader(async (sql) => {
    queries.push(sql);
    return { rows: [{ current_user: 'service_role' }] };
  });
  await assert.rejects(
    () => wrongRoleReader.read({ importId: IMPORT_ID, sourceConversationId: 'conversation:tk006:fixture' }),
    /requires comind_conversation_history_reader/,
  );

  let call = 0;
  const governedReader = createCertifiedConversationHistoryReader(async (sql) => {
    queries.push(sql);
    call += 1;
    if (call === 1) return { rows: [{ current_user: 'comind_conversation_history_reader' }] };
    assert.equal(/raw_conversation|raw_node|content_text|title/i.test(sql), false, sql);
    return {
      rows: [{
        baseline_id: BASELINE_ID,
        certification_sha256: 'a'.repeat(64),
        import_id: IMPORT_ID,
        source_conversation_id: 'conversation:tk006:fixture',
        created_at: '2026-10-27T18:00:00.000Z',
        updated_at: '2026-10-27T18:01:00.000Z',
        raw_source_hash: 'b'.repeat(64),
        normalized_hash: 'c'.repeat(64),
        topology_hash: 'd'.repeat(64),
        node_count: '4',
        message_count: '3',
        attachment_reference_count: '1',
      }],
    };
  });
  const result = await governedReader.read({
    importId: IMPORT_ID,
    sourceConversationId: 'conversation:tk006:fixture',
  });
  assert.equal(result.sourceConversationId, 'conversation:tk006:fixture');
  assert.equal(result.normalizedHash, 'c'.repeat(64));
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
