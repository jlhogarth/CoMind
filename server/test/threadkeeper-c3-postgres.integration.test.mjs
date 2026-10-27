import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const enabled = process.env.THREADKEEPER_C3_ISOLATED_DB_TEST === '1';

const CONVERSATION_ID = 'tk006-conversation';
const CANARY = 'TK006 RAW TRANSCRIPT CANARY MUST REMAIN IN CONVERSATION HISTORY ONLY';
const A = {
  sourceId: 'c3061000-0000-4000-8000-000000000001',
  importId: 'c3061000-0000-4000-8000-000000000002',
  baselineId: 'c3061000-0000-4000-8000-000000000003',
};
const B = {
  sourceId: 'c3062000-0000-4000-8000-000000000001',
  importId: 'c3062000-0000-4000-8000-000000000002',
  baselineId: 'c3062000-0000-4000-8000-000000000003',
};
const UNCERTIFIED = {
  sourceId: 'c3063000-0000-4000-8000-000000000001',
  importId: 'c3063000-0000-4000-8000-000000000002',
};

async function seedImport(pool, fixture, options) {
  await pool.query(
    `INSERT INTO comind.cm_archive_source (
       source_archive_id, source_system, source_archive_name,
       source_archive_sha256, source_archive_bytes, source_metadata
     ) VALUES ($1::uuid,'chatgpt',$2,$3,2048,$4::jsonb)`,
    [fixture.sourceId, options.archiveName, options.archiveHash, JSON.stringify({ synthetic: true, tk006: true })],
  );
  await pool.query(
    `INSERT INTO comind.cm_archive_import (
       import_id, source_archive_id, parser_version, schema_version, status,
       started_at, completed_at, source_conversation_count, source_message_count,
       source_node_count, source_attachment_count, imported_conversation_count,
       imported_message_count, imported_node_count, imported_attachment_count,
       reconciliation, receipt, receipt_sha256
     ) VALUES (
       $1::uuid,$2::uuid,'tk006-fixture','archive-v1','PASS',
       $3::timestamptz,$4::timestamptz,1,2,2,0,1,2,2,0,
       '{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,$5
     )`,
    [fixture.importId, fixture.sourceId, options.startedAt, options.completedAt, options.receiptHash],
  );
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

async function certifyImport(pool, fixture, options) {
  await pool.query(
    `INSERT INTO comind.cm_conversation_history_baseline (
       baseline_id, import_id, source_archive_id, source_archive_sha256,
       certification_version, source_kind, certified_by, certification_reason,
       evidence, certification_sha256
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,$4,'tk006-cert-v1','native_openai_export',
       'tk006-isolated-certifier','Synthetic C3 real-contract integration fixture.',
       '{"synthetic":true,"scope":"isolated_test_only"}'::jsonb,$5
     )`,
    [fixture.baselineId, fixture.importId, fixture.sourceId, options.archiveHash, options.certificationHash],
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

test('TK-006 integrates certified Conversation History through ThreadKeeper to continuity handoff', {
  skip: !enabled,
}, async () => {
  const {
    ConversationHistoryEvidenceResolver,
    InMemoryThreadKeeperC3Observability,
    ThreadKeeperConversationHistoryIntegration,
    createCertifiedConversationHistoryReader,
  } = await import('../dist/threadkeeper/conversation-history-integration.js');
  const {
    InMemoryObservationReferenceRegistry,
    ThreadKeeperService,
  } = await import('../dist/threadkeeper/service.js');
  const { InMemoryThreadKeeperObservability } = await import('../dist/threadkeeper/observability.js');
  const { closePool } = await import('../dist/db.js');

  let directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let historyClient = null;
  const query = async (sql, params) => ({ rows: (await directPool.query(sql, params)).rows });

  try {
    await seedImport(directPool, A, {
      archiveName: 'tk006-a.zip',
      archiveHash: '1'.repeat(64),
      startedAt: '2026-10-27T18:00:00Z',
      completedAt: '2026-10-27T18:01:00Z',
      receiptHash: '2'.repeat(64),
      title: 'Private title A',
      createdAt: '2026-10-27T17:00:00Z',
      updatedAt: '2026-10-27T17:01:00Z',
      rawHash: '3'.repeat(64),
      normalizedHash: '4'.repeat(64),
      topologyHash: '5'.repeat(64),
    });
    await certifyImport(directPool, A, {
      archiveHash: '1'.repeat(64),
      certificationHash: '6'.repeat(64),
    });

    await seedImport(directPool, B, {
      archiveName: 'tk006-b.zip',
      archiveHash: '7'.repeat(64),
      startedAt: '2026-10-27T19:00:00Z',
      completedAt: '2026-10-27T19:01:00Z',
      receiptHash: '8'.repeat(64),
      title: 'Private title B changed',
      createdAt: '2026-10-27T17:00:00Z',
      updatedAt: '2026-10-27T18:30:00Z',
      rawHash: '9'.repeat(64),
      normalizedHash: 'a'.repeat(64),
      topologyHash: 'b'.repeat(64),
    });
    await certifyImport(directPool, B, {
      archiveHash: '7'.repeat(64),
      certificationHash: 'c'.repeat(64),
    });

    await seedImport(directPool, UNCERTIFIED, {
      archiveName: 'tk006-uncertified.zip',
      archiveHash: 'd'.repeat(64),
      startedAt: '2026-10-27T20:00:00Z',
      completedAt: '2026-10-27T20:01:00Z',
      receiptHash: 'e'.repeat(64),
      title: 'Uncertified private title',
      createdAt: '2026-10-27T17:00:00Z',
      updatedAt: '2026-10-27T20:00:00Z',
      rawHash: 'f'.repeat(64),
      normalizedHash: '0'.repeat(64),
      topologyHash: '1'.repeat(64),
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
    const integration = new ThreadKeeperConversationHistoryIntegration({
      query,
      historyReader,
      service,
      observability: c3Metrics,
    });

    const uncertified = await integration.assessCertifiedConversation({
      importId: UNCERTIFIED.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T20:02:00Z',
    });
    assert.deepEqual(uncertified, {
      status: 'source_unavailable',
      reasonCode: 'certified_conversation_history_unavailable',
    });

    const first = await integration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T18:02:00Z',
      correlationId: 'corr:tk006:a',
      traceId: 'trace-tk006-a',
    });
    assert.equal(first.status, 'assessed');
    assert.equal(first.assessment.classification, 'BLOCKED');
    assert.ok(first.assessment.reasonCodes.includes('accepted_baseline_missing'));
    assert.equal(first.materialChange, false);
    assert.equal(JSON.stringify(first.observation).includes(CANARY), false);
    assert.equal(JSON.stringify(first.observation).includes('Private title A'), false);
    assert.equal(first.observation.traceId, 'trace-tk006-a');

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
      proposedAt: '2026-10-27T18:03:00Z',
      proposedByRef: 'actor:tk006:integration',
      acceptedAt: '2026-10-27T18:04:00Z',
      policyRef: 'policy:tk006:c3',
    });

    const intact = await integration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T18:05:00Z',
      correlationId: 'corr:tk006:a-replay',
    });
    assert.equal(intact.status, 'assessed');
    assert.equal(intact.receipt.disposition, 'duplicate');
    assert.equal(intact.assessment.classification, 'INTACT');
    assert.equal(intact.materialChange, false);

    const duplicateReplay = await integration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T18:05:00Z',
      correlationId: 'corr:tk006:a-replay',
    });
    assert.equal(duplicateReplay.status, 'assessed');
    assert.equal(duplicateReplay.receipt.disposition, 'duplicate');
    assert.equal(duplicateReplay.storedAssessment.assessment_id, intact.storedAssessment.assessment_id);

    const changed = await integration.assessCertifiedConversation({
      importId: B.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T19:02:00Z',
      correlationId: 'corr:tk006:b',
      traceId: 'trace-tk006-b',
    });
    assert.equal(changed.status, 'assessed');
    assert.equal(changed.materialChange, true);
    assert.equal(changed.assessment.classification, 'SUSPECTED_BREAK');

    const authorityB = {
      valid: true,
      source: 'external',
      actorRef: 'founder:tk006',
      evidenceRef: 'authority:tk006:baseline-b',
      policyRef: 'policy:tk006:c3',
    };
    const checkpointB = await integration.acceptCertifiedConversationCheckpoint({
      assessed: changed,
      authority: authorityB,
      proposalId: 'tk006:proposal:b',
      proposedAt: '2026-10-27T19:03:00Z',
      proposedByRef: 'actor:tk006:integration',
      acceptedAt: '2026-10-27T19:04:00Z',
      policyRef: 'policy:tk006:c3',
    });
    assert.notEqual(checkpointB.checkpointId, checkpointA.checkpointId);
    assert.equal(checkpointB.proposal.parentCheckpointId, checkpointA.checkpointId);

    await assert.rejects(
      () => integration.resolveHandoff({
        scopeSemanticKey: changed.assessment.scopeSemanticKey,
        consumerRef: 'consumer:tk006:stale-check',
        expectedCheckpointId: checkpointA.checkpointId,
        resolvedAt: '2026-10-27T19:05:00Z',
      }),
      error => error?.code === 'stale_checkpoint',
    );

    const handoff = await integration.resolveHandoff({
      scopeSemanticKey: changed.assessment.scopeSemanticKey,
      consumerRef: 'consumer:tk006:c3-proof',
      providerRef: 'provider:tk006:neutral',
      actorRef: 'actor:tk006:consumer',
      expectedCheckpointId: checkpointB.checkpointId,
      resolvedAt: '2026-10-27T19:06:00Z',
    });
    assert.equal(handoff.currentCheckpoint.checkpointId, checkpointB.checkpointId);
    assert.equal(handoff.currentCheckpoint.parentCheckpointId, checkpointA.checkpointId);
    assert.deepEqual(handoff.lineage.checkpointIds, [checkpointA.checkpointId, checkpointB.checkpointId]);
    assert.equal(handoff.consumer.authorityMode, 'requires_independent_validation');
    assert.match(handoff.continuityDigest, /^[a-f0-9]{64}$/);

    const tkLeak = await directPool.query(
      `SELECT (
         EXISTS (SELECT 1 FROM comind.cm_threadkeeper_checkpoint WHERE proposal::text LIKE '%' || $1 || '%')
         OR EXISTS (SELECT 1 FROM comind.cm_threadkeeper_assessment WHERE assessment::text LIKE '%' || $1 || '%')
       ) AS leaked`,
      [CANARY],
    );
    assert.equal(tkLeak.rows[0].leaked, false);
    const titleLeak = await directPool.query(
      `SELECT (
         EXISTS (SELECT 1 FROM comind.cm_threadkeeper_checkpoint WHERE proposal::text LIKE '%Private title%')
         OR EXISTS (SELECT 1 FROM comind.cm_threadkeeper_assessment WHERE assessment::text LIKE '%Private title%')
       ) AS leaked`,
    );
    assert.equal(titleLeak.rows[0].leaked, false);

    await assert.rejects(
      () => historyClient.query(
        `UPDATE comind.cm_archive_conversation_observation
            SET title='forbidden'
          WHERE import_id=$1::uuid AND source_conversation_id=$2`,
        [A.importId, CONVERSATION_ID],
      ),
      /permission denied|row-level security|violates row-level security/i,
    );

    const failedIntegration = new ThreadKeeperConversationHistoryIntegration({
      query,
      historyReader: { async read() { throw new Error('synthetic resolver outage'); } },
      service,
      observability: c3Metrics,
    });
    const degraded = await failedIntegration.assessCertifiedConversation({
      importId: A.importId,
      sourceConversationId: CONVERSATION_ID,
      observedAt: '2026-10-27T19:07:00Z',
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
      scopeSemanticKey: changed.assessment.scopeSemanticKey,
      consumerRef: 'consumer:tk006:restart-proof',
      expectedCheckpointId: checkpointB.checkpointId,
      resolvedAt: '2026-10-27T19:08:00Z',
    });
    assert.equal(restartedHandoff.currentCheckpoint.checkpointId, checkpointB.checkpointId);
    assert.equal(restartedHandoff.lineage.depth, 2);

    const c3Snapshot = c3Metrics.snapshot();
    assert.ok(c3Snapshot.historyEvidence.available >= 4);
    assert.ok(c3Snapshot.historyEvidence.missing >= 1);
    assert.ok(c3Snapshot.historyEvidence.unverifiable >= 1);
    assert.ok(c3Snapshot.handoffs.resolved >= 2);
    assert.ok(c3Snapshot.handoffs.stale_checkpoint >= 1);
    assert.equal(JSON.stringify(c3Snapshot).includes(CANARY), false);

    const tkSnapshot = tkMetrics.snapshot();
    assert.ok(tkSnapshot.observations.accepted >= 2);
    assert.ok(tkSnapshot.observations.duplicate >= 2);
    assert.ok((tkSnapshot.assessments.BLOCKED ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.INTACT ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.SUSPECTED_BREAK ?? 0) >= 1);
  } finally {
    if (historyClient) await historyClient.end().catch(() => {});
    await directPool.end().catch(() => {});
    await closePool().catch(() => {});
  }
});
