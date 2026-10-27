import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const enabled = process.env.THREADKEEPER_C3_ISOLATED_DB_TEST === '1';

const CONVERSATION_ID = 'tk006-conversation';
const CANARY = 'TK006 RAW TRANSCRIPT CANARY MUST REMAIN IN CONVERSATION HISTORY ONLY';
const STREAM_ID = 'c3060000-0000-4000-8000-000000000001';
const A = {
  sourceId: 'c3061000-0000-4000-8000-000000000001',
  importId: 'c3061000-0000-4000-8000-000000000002',
  baselineId: 'c3061000-0000-4000-8000-000000000003',
  checkpointId: 'c3061000-0000-4000-8000-000000000004',
};
const U = {
  sourceId: 'c3062000-0000-4000-8000-000000000001',
  importId: 'c3062000-0000-4000-8000-000000000002',
  checkpointId: 'c3062000-0000-4000-8000-000000000004',
};
const B = {
  sourceId: 'c3063000-0000-4000-8000-000000000001',
  importId: 'c3063000-0000-4000-8000-000000000002',
  checkpointId: 'c3063000-0000-4000-8000-000000000004',
};
const UNCERTIFIED = {
  sourceId: 'c3064000-0000-4000-8000-000000000001',
  importId: 'c3064000-0000-4000-8000-000000000002',
};

async function seedSourceImport(pool, fixture, options) {
  await pool.query(
    `INSERT INTO comind.cm_archive_source (
       source_archive_id, source_system, source_archive_name,
       source_archive_sha256, source_archive_bytes, source_metadata
     ) VALUES ($1::uuid,'chatgpt',$2,$3,2048,$4::jsonb)`,
    [fixture.sourceId, options.archiveName, options.archiveHash, JSON.stringify({ synthetic: true, tk006: true })],
  );
  await pool.query(
    `INSERT INTO comind.cm_archive_import (
       import_id, source_archive_id, parser_version, schema_version, status, import_mode,
       started_at, completed_at, source_conversation_count, source_message_count,
       source_node_count, source_attachment_count, imported_conversation_count,
       imported_message_count, imported_node_count, imported_attachment_count,
       reconciliation, receipt, receipt_sha256
     ) VALUES (
       $1::uuid,$2::uuid,'tk006-parser-v1','archive-v1','PASS',$3,
       $4::timestamptz,$5::timestamptz,1,2,2,0,1,2,2,0,
       '{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,$6
     )`,
    [fixture.importId, fixture.sourceId, options.importMode, options.startedAt, options.completedAt, options.receiptHash],
  );
}

async function seedObservation(pool, fixture, options) {
  await pool.query(
    `INSERT INTO comind.cm_archive_conversation_observation (
       import_id, source_conversation_id, title, created_at, updated_at,
       raw_source_hash, normalized_hash, topology_hash,
       node_count, message_count, attachment_reference_count, raw_conversation
     ) VALUES (
       $1::uuid,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,2,2,0,$9::jsonb
     )`,
    [
      fixture.importId,
      CONVERSATION_ID,
      options.title,
      options.createdAt,
      options.updatedAt,
      options.rawHash,
      options.normalizedHash,
      options.topologyHash,
      JSON.stringify({ id: CONVERSATION_ID, current_node: 'node-2', transcriptCanary: CANARY }),
    ],
  );
}

async function connectHistoryReader() {
  const client = new pg.Client({
    connectionString: 'postgresql://tk006_history_login:history-test-password@localhost:5432/comind_ci',
  });
  await client.connect();
  await client.query('SET ROLE comind_conversation_history_reader');
  return client;
}

test('TK-006 integrates accepted Conversation History checkpoint snapshots through ThreadKeeper to continuity handoff', {
  skip: !enabled,
}, async () => {
  const {
    ConversationHistoryEvidenceResolver,
    InMemoryThreadKeeperC3Observability,
    ThreadKeeperConversationHistoryIntegration,
    createCertifiedConversationHistoryReader,
  } = await import('../dist/threadkeeper/conversation-history-integration.js');
  const { InMemoryObservationReferenceRegistry, ThreadKeeperService } = await import('../dist/threadkeeper/service.js');
  const { InMemoryThreadKeeperObservability } = await import('../dist/threadkeeper/observability.js');
  const { closePool } = await import('../dist/db.js');

  let directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let historyClient = null;
  const query = async (sql, params) => ({ rows: (await directPool.query(sql, params)).rows });

  try {
    await seedSourceImport(directPool, A, {
      archiveName: 'tk006-a.zip', archiveHash: '1'.repeat(64), importMode: 'full_snapshot',
      startedAt: '2026-10-27T18:00:00Z', completedAt: '2026-10-27T18:01:00Z', receiptHash: '2'.repeat(64),
    });
    await seedObservation(directPool, A, {
      title: 'Private title A', createdAt: '2026-10-27T17:00:00Z', updatedAt: '2026-10-27T17:01:00Z',
      rawHash: '3'.repeat(64), normalizedHash: '4'.repeat(64), topologyHash: '5'.repeat(64),
    });
    await directPool.query(
      `INSERT INTO comind.cm_conversation_history_baseline (
         baseline_id, import_id, source_archive_id, source_archive_sha256,
         certification_version, source_kind, certified_by, certification_reason,
         evidence, certification_sha256
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4,'tk006-cert-v1','native_openai_export',
         'tk006-isolated-certifier','Synthetic C3 integration baseline.',
         '{"synthetic":true,"scope":"isolated_test_only"}'::jsonb,$5
       )`,
      [A.baselineId, A.importId, A.sourceId, '1'.repeat(64), '6'.repeat(64)],
    );
    await directPool.query(
      `INSERT INTO comind.cm_archive_stream (
         archive_stream_id, source_system, source_identity_key, metadata
       ) VALUES ($1::uuid,'chatgpt','tk006-isolated-stream','{"synthetic":true}'::jsonb)`,
      [STREAM_ID],
    );
    await directPool.query(
      `INSERT INTO comind.cm_archive_checkpoint (
         checkpoint_id, archive_stream_id, import_id, baseline_id, checkpoint_kind,
         sequence_no, predecessor_checkpoint_id, parser_version, schema_version,
         hash_version, accepted_at, receipt, receipt_sha256
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'baseline',1,NULL,
         'tk006-parser-v1','archive-v1','hash-v1','2026-10-27T18:02:00Z',
         '{"status":"accepted","kind":"baseline"}'::jsonb,$5
       )`,
      [A.checkpointId, STREAM_ID, A.importId, A.baselineId, '7'.repeat(64)],
    );
    await directPool.query(
      `INSERT INTO comind.cm_archive_snapshot_conversation (
         import_id, source_conversation_id, classification, present,
         prior_observation_import_id, observation_import_id,
         raw_source_hash, normalized_hash, topology_hash, attachment_set_hash,
         source_path, evidence
       ) VALUES (
         $1::uuid,$2,'baseline',true,NULL,$1::uuid,$3,$4,$5,$6,'conversations.json',
         '{"synthetic":true}'::jsonb
       )`,
      [A.importId, CONVERSATION_ID, '3'.repeat(64), '4'.repeat(64), '5'.repeat(64), '8'.repeat(64)],
    );

    await seedSourceImport(directPool, U, {
      archiveName: 'tk006-unchanged.zip', archiveHash: '9'.repeat(64), importMode: 'differential',
      startedAt: '2026-10-27T19:00:00Z', completedAt: '2026-10-27T19:01:00Z', receiptHash: 'a'.repeat(64),
    });
    await directPool.query(
      `INSERT INTO comind.cm_archive_checkpoint (
         checkpoint_id, archive_stream_id, import_id, baseline_id, checkpoint_kind,
         sequence_no, predecessor_checkpoint_id, parser_version, schema_version,
         hash_version, accepted_at, receipt, receipt_sha256
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'differential',2,$5::uuid,
         'tk006-parser-v1','archive-v1','hash-v1','2026-10-27T19:02:00Z',
         '{"status":"accepted","kind":"differential","classification":"unchanged"}'::jsonb,$6
       )`,
      [U.checkpointId, STREAM_ID, U.importId, A.baselineId, A.checkpointId, 'b'.repeat(64)],
    );
    await directPool.query(
      `INSERT INTO comind.cm_archive_snapshot_conversation (
         import_id, source_conversation_id, classification, present,
         prior_observation_import_id, observation_import_id,
         raw_source_hash, normalized_hash, topology_hash, attachment_set_hash,
         source_path, evidence
       ) VALUES (
         $1::uuid,$2,'unchanged',true,$3::uuid,$3::uuid,$4,$5,$6,$7,'conversations.json',
         '{"synthetic":true,"reuse":true}'::jsonb
       )`,
      [U.importId, CONVERSATION_ID, A.importId, '3'.repeat(64), '4'.repeat(64), '5'.repeat(64), '8'.repeat(64)],
    );

    await seedSourceImport(directPool, B, {
      archiveName: 'tk006-b.zip', archiveHash: 'c'.repeat(64), importMode: 'differential',
      startedAt: '2026-10-27T20:00:00Z', completedAt: '2026-10-27T20:01:00Z', receiptHash: 'd'.repeat(64),
    });
    await seedObservation(directPool, B, {
      title: 'Private title B changed', createdAt: '2026-10-27T17:00:00Z', updatedAt: '2026-10-27T19:30:00Z',
      rawHash: 'e'.repeat(64), normalizedHash: 'f'.repeat(64), topologyHash: '0'.repeat(64),
    });
    await directPool.query(
      `INSERT INTO comind.cm_archive_checkpoint (
         checkpoint_id, archive_stream_id, import_id, baseline_id, checkpoint_kind,
         sequence_no, predecessor_checkpoint_id, parser_version, schema_version,
         hash_version, accepted_at, receipt, receipt_sha256
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'differential',3,$5::uuid,
         'tk006-parser-v1','archive-v1','hash-v1','2026-10-27T20:02:00Z',
         '{"status":"accepted","kind":"differential","classification":"content_changed"}'::jsonb,$6
       )`,
      [B.checkpointId, STREAM_ID, B.importId, A.baselineId, U.checkpointId, '1'.repeat(64)],
    );
    await directPool.query(
      `INSERT INTO comind.cm_archive_snapshot_conversation (
         import_id, source_conversation_id, classification, present,
         prior_observation_import_id, observation_import_id,
         raw_source_hash, normalized_hash, topology_hash, attachment_set_hash,
         source_path, evidence
       ) VALUES (
         $1::uuid,$2,'content_changed',true,$3::uuid,$1::uuid,$4,$5,$6,$7,'conversations.json',
         '{"synthetic":true,"changed":true}'::jsonb
       )`,
      [B.importId, CONVERSATION_ID, A.importId, 'e'.repeat(64), 'f'.repeat(64), '0'.repeat(64), '8'.repeat(64)],
    );

    await seedSourceImport(directPool, UNCERTIFIED, {
      archiveName: 'tk006-uncertified.zip', archiveHash: '2'.repeat(64), importMode: 'full_snapshot',
      startedAt: '2026-10-27T21:00:00Z', completedAt: '2026-10-27T21:01:00Z', receiptHash: '3'.repeat(64),
    });

    historyClient = await connectHistoryReader();
    const historyQuery = async (sql, params) => ({ rows: (await historyClient.query(sql, params)).rows });
    const historyReader = createCertifiedConversationHistoryReader(historyQuery);
    const evidenceResolver = new ConversationHistoryEvidenceResolver(historyReader);
    const tkMetrics = new InMemoryThreadKeeperObservability();
    const c3Metrics = new InMemoryThreadKeeperC3Observability();
    const service = new ThreadKeeperService({
      observationRegistry: new InMemoryObservationReferenceRegistry(),
      evidenceResolver,
      observability: tkMetrics,
    });
    const integration = new ThreadKeeperConversationHistoryIntegration({ query, historyReader, service, observability: c3Metrics });

    const uncertified = await integration.assessCertifiedConversation({
      importId: UNCERTIFIED.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T21:02:00Z',
    });
    assert.deepEqual(uncertified, {
      status: 'source_unavailable',
      reasonCode: 'accepted_conversation_history_snapshot_unavailable',
    });

    const first = await integration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T18:03:00Z',
    });
    assert.equal(first.status, 'assessed');
    assert.equal(first.summary.checkpointKind, 'baseline');
    assert.equal(first.assessment.classification, 'BLOCKED');
    assert.ok(first.assessment.reasonCodes.includes('accepted_baseline_missing'));
    assert.equal(first.materialChange, false);
    assert.equal(JSON.stringify(first.observation).includes(CANARY), false);
    assert.equal(JSON.stringify(first.observation).includes('Private title A'), false);

    const authorityA = {
      valid: true,
      source: 'external',
      actorRef: 'founder:tk006',
      evidenceRef: 'authority:tk006:baseline-a',
      policyRef: 'policy:tk006:c3',
    };
    const checkpointA = await integration.acceptCertifiedConversationCheckpoint({
      assessed: first,
      authority: authorityA,
      proposalId: 'tk006:proposal:a',
      proposedAt: '2026-10-27T18:04:00Z',
      proposedByRef: 'actor:tk006:integration',
      acceptedAt: '2026-10-27T18:05:00Z',
      policyRef: 'policy:tk006:c3',
    });

    const unchanged = await integration.assessCertifiedConversation({
      importId: U.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T19:03:00Z',
    });
    assert.equal(unchanged.status, 'assessed');
    assert.equal(unchanged.summary.classification, 'unchanged');
    assert.equal(unchanged.receipt.disposition, 'accepted');
    assert.equal(unchanged.materialChange, false);
    assert.equal(unchanged.assessment.classification, 'INTACT');

    const unchangedReplay = await integration.assessCertifiedConversation({
      importId: U.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T19:04:00Z',
    });
    assert.equal(unchangedReplay.status, 'assessed');
    assert.equal(unchangedReplay.receipt.disposition, 'duplicate');
    assert.equal(unchangedReplay.assessment.classification, 'INTACT');
    assert.equal(unchangedReplay.storedAssessment.assessment_id, unchanged.storedAssessment.assessment_id);

    const changed = await integration.assessCertifiedConversation({
      importId: B.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T20:03:00Z',
    });
    assert.equal(changed.status, 'assessed');
    assert.equal(changed.summary.checkpointKind, 'differential');
    assert.equal(changed.materialChange, true);
    assert.equal(changed.assessment.classification, 'SUSPECTED_BREAK');

    const authorityB = {
      valid: true,
      source: 'external',
      actorRef: 'founder:tk006',
      evidenceRef: 'authority:tk006:baseline-b',
      policyRef: 'policy:tk006:c3',
    };
    const authorizedChanged = await integration.assessCertifiedConversation({
      importId: B.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T20:04:00Z',
      authority: authorityB,
    });
    assert.equal(authorizedChanged.status, 'assessed');
    assert.equal(authorizedChanged.receipt.disposition, 'duplicate');
    assert.equal(authorizedChanged.assessment.classification, 'CHANGED_WITH_LINEAGE');
    assert.notEqual(authorizedChanged.storedAssessment.assessment_id, changed.storedAssessment.assessment_id);

    const checkpointB = await integration.acceptCertifiedConversationCheckpoint({
      assessed: authorizedChanged,
      authority: authorityB,
      proposalId: 'tk006:proposal:b',
      proposedAt: '2026-10-27T20:05:00Z',
      proposedByRef: 'actor:tk006:integration',
      acceptedAt: '2026-10-27T20:06:00Z',
      policyRef: 'policy:tk006:c3',
    });
    assert.notEqual(checkpointB.checkpointId, checkpointA.checkpointId);
    assert.equal(checkpointB.proposal.parentCheckpointId, checkpointA.checkpointId);

    await assert.rejects(
      () => integration.resolveHandoff({
        scopeSemanticKey: authorizedChanged.assessment.scopeSemanticKey,
        consumerRef: 'consumer:tk006:stale-check',
        expectedCheckpointId: checkpointA.checkpointId,
        resolvedAt: '2026-10-27T20:07:00Z',
      }),
      error => error?.code === 'stale_checkpoint',
    );

    const handoff = await integration.resolveHandoff({
      scopeSemanticKey: authorizedChanged.assessment.scopeSemanticKey,
      consumerRef: 'consumer:tk006:c3-proof',
      providerRef: 'provider:tk006:neutral',
      actorRef: 'actor:tk006:consumer',
      expectedCheckpointId: checkpointB.checkpointId,
      resolvedAt: '2026-10-27T20:08:00Z',
    });
    assert.equal(handoff.currentCheckpoint.checkpointId, checkpointB.checkpointId);
    assert.equal(handoff.currentCheckpoint.parentCheckpointId, checkpointA.checkpointId);
    assert.deepEqual(handoff.lineage.checkpointIds, [checkpointA.checkpointId, checkpointB.checkpointId]);
    assert.equal(handoff.consumer.authorityMode, 'requires_independent_validation');
    assert.match(handoff.continuityDigest, /^[a-f0-9]{64}$/);

    const canaryLeak = await directPool.query(
      `SELECT (
         EXISTS (SELECT 1 FROM comind.cm_threadkeeper_checkpoint WHERE proposal::text LIKE '%' || $1 || '%')
         OR EXISTS (SELECT 1 FROM comind.cm_threadkeeper_assessment WHERE assessment::text LIKE '%' || $1 || '%')
       ) AS leaked`,
      [CANARY],
    );
    assert.equal(canaryLeak.rows[0].leaked, false);
    const titleLeak = await directPool.query(
      `SELECT (
         EXISTS (SELECT 1 FROM comind.cm_threadkeeper_checkpoint WHERE proposal::text LIKE '%Private title%')
         OR EXISTS (SELECT 1 FROM comind.cm_threadkeeper_assessment WHERE assessment::text LIKE '%Private title%')
       ) AS leaked`,
    );
    assert.equal(titleLeak.rows[0].leaked, false);

    await assert.rejects(
      () => historyClient.query(
        `UPDATE comind.cm_archive_snapshot_conversation
            SET classification=classification
          WHERE import_id=$1::uuid AND source_conversation_id=$2`,
        [A.importId, CONVERSATION_ID],
      ),
      /permission denied|row-level security|violates row-level security/i,
    );

    const failedIntegration = new ThreadKeeperConversationHistoryIntegration({
      query,
      historyReader: {
        async read() { throw new Error('synthetic resolver outage'); },
        async readByCheckpoint() { throw new Error('synthetic resolver outage'); },
      },
      service,
      observability: c3Metrics,
    });
    const degraded = await failedIntegration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      assessedAt: '2026-10-27T20:09:00Z',
    });
    assert.deepEqual(degraded, {
      status: 'source_unverifiable',
      reasonCode: 'conversation_history_reader_failure',
    });

    await historyClient.end();
    historyClient = await connectHistoryReader();
    await directPool.end();
    directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

    const restartedHandoff = await integration.resolveHandoff({
      scopeSemanticKey: authorizedChanged.assessment.scopeSemanticKey,
      consumerRef: 'consumer:tk006:restart-proof',
      expectedCheckpointId: checkpointB.checkpointId,
      resolvedAt: '2026-10-27T20:10:00Z',
    });
    assert.equal(restartedHandoff.currentCheckpoint.checkpointId, checkpointB.checkpointId);
    assert.equal(restartedHandoff.lineage.depth, 2);

    const c3Snapshot = c3Metrics.snapshot();
    assert.ok(c3Snapshot.historyEvidence.available >= 4);
    assert.ok(c3Snapshot.historyEvidence.missing >= 1);
    assert.ok(c3Snapshot.historyEvidence.unverifiable >= 1);
    assert.ok(c3Snapshot.handoffs.resolved >= 2);
    assert.ok(c3Snapshot.handoffs.stale_checkpoint >= 1);
    assert.ok((c3Snapshot.latencies.history_summary_read ?? []).length >= 1);
    assert.equal(JSON.stringify(c3Snapshot).includes(CANARY), false);

    const tkSnapshot = tkMetrics.snapshot();
    assert.ok(tkSnapshot.observations.accepted >= 3);
    assert.ok(tkSnapshot.observations.duplicate >= 2);
    assert.ok((tkSnapshot.assessments.BLOCKED ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.INTACT ?? 0) >= 2);
    assert.ok((tkSnapshot.assessments.SUSPECTED_BREAK ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.CHANGED_WITH_LINEAGE ?? 0) >= 1);
  } finally {
    if (historyClient) await historyClient.end().catch(() => {});
    await directPool.end().catch(() => {});
    await closePool().catch(() => {});
  }
});
