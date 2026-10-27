import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';

if (process.env.CHATGPT_ARCHIVE_DIFFERENTIAL_DB_TEST !== '1') {
  test('interrupted differential import recovery', { skip: 'requires isolated PostgreSQL differential test lane' }, () => {});
} else {
  const { Pool } = pg;
  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const { recoverInterruptedArchiveImport } = await import('../dist/archive/chatgpt-archive-recovery.js');
  const { prepareChatGptExport } = await import('../dist/archive/chatgpt-export-scan.js');
  const {
    establishChatGptBaselineCheckpoint,
    ingestChatGptDifferentialExport,
  } = await import('../dist/archive/chatgpt-differential-ingest.js');
  const {
    CHATGPT_ARCHIVE_PARSER_VERSION,
    CHATGPT_ARCHIVE_SCHEMA_VERSION,
    sha256Canonical,
  } = await import('../dist/archive/chatgpt-export.js');
  const { closePool, prepareArchiveDatabaseSession } = await import('../dist/db.js');

  await prepareArchiveDatabaseSession();
  const admin = new Pool({ connectionString: process.env.TEST_ADMIN_DATABASE_URL });
  const roots = [];

  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    await admin.end();
    await closePool();
  });

  function conversation(id, answer = `Answer ${id}`) {
    return {
      id,
      title: `Conversation ${id}`,
      create_time: 1791840000,
      update_time: 1791840002,
      current_node: 'assistant',
      mapping: {
        root: { id: 'root', parent: null, children: ['user'], message: null },
        user: {
          id: 'user', parent: 'root', children: ['assistant'],
          message: {
            id: 'user-message', author: { role: 'user' }, create_time: 1791840001, update_time: 1791840001,
            content: { content_type: 'text', parts: [`Question ${id}`] }, metadata: {}, status: 'finished_successfully', end_turn: true,
          },
        },
        assistant: {
          id: 'assistant', parent: 'user', children: [],
          message: {
            id: 'assistant-message', author: { role: 'assistant' }, create_time: 1791840002, update_time: 1791840002,
            content: { content_type: 'text', parts: [answer] }, metadata: {}, status: 'finished_successfully', end_turn: true,
          },
        },
      },
    };
  }

  async function makeExport(label, conversations) {
    const root = await mkdtemp(path.join(tmpdir(), `comind-diff-recovery-${label}-`));
    roots.push(root);
    await writeFile(path.join(root, 'conversations.json'), JSON.stringify(conversations), 'utf8');
    return root;
  }

  async function certifySyntheticBaseline(importId) {
    const row = (await admin.query(
      `SELECT i.source_archive_id::text,s.source_archive_sha256::text
         FROM comind.cm_archive_import i JOIN comind.cm_archive_source s USING(source_archive_id)
        WHERE i.import_id=$1::uuid`, [importId],
    )).rows[0];
    assert.ok(row);
    const hash = sha256Canonical({ importId, sourceArchiveId: row.source_archive_id, sha256: row.source_archive_sha256, scope: 'differential recovery fixture' });
    const baselineId = (await admin.query(
      `INSERT INTO comind.cm_conversation_history_baseline
         (import_id,source_archive_id,source_archive_sha256,certification_version,source_kind,certified_by,certification_reason,evidence,certification_sha256)
       VALUES ($1,$2,$3,'diff-recovery-ci-v1','native_openai_export','isolated-ci','Synthetic recovery fixture. Not real history.',
               '{"synthetic":true,"scope":"isolated_recovery_test_only"}'::jsonb,$4)
       RETURNING baseline_id::text`,
      [importId,row.source_archive_id,row.source_archive_sha256,hash],
    )).rows[0]?.baseline_id;
    assert.ok(baselineId);
    return baselineId;
  }

  test('committed differential membership is recoverable and successor resumes without advancing the abandoned attempt', async () => {
    const streamKey = `chatgpt-diff-recovery-${Date.now()}`;
    const baselineRoot = await makeExport('baseline', [conversation('recovery-conversation')]);
    const baseline = await ingestChatGptExport(baselineRoot);
    assert.equal(baseline.status, 'PASS');
    await certifySyntheticBaseline(baseline.importId);
    const checkpoint = await establishChatGptBaselineCheckpoint({ sourceIdentityKey: streamKey, importId: baseline.importId });
    assert.equal(checkpoint.sequenceNo, 1);

    const nextRoot = await makeExport('next', [
      conversation('recovery-conversation', 'Changed after recovery'),
      conversation('new-after-recovery'),
    ]);
    const prepared = await prepareChatGptExport(nextRoot);
    try {
      await admin.query(
        `INSERT INTO comind.cm_archive_source
           (source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_uri,source_metadata)
         VALUES ('chatgpt',$1,$2,$3,$4,'{"synthetic_interruption":true}'::jsonb)
         ON CONFLICT (source_system,source_archive_sha256) DO NOTHING`,
        [prepared.sourceArchiveName,prepared.sourceArchiveSha256,prepared.sourceArchiveBytes,prepared.sourceUri],
      );
      const sourceArchiveId = (await admin.query(
        `SELECT source_archive_id::text FROM comind.cm_archive_source WHERE source_system='chatgpt' AND source_archive_sha256=$1`,
        [prepared.sourceArchiveSha256],
      )).rows[0]?.source_archive_id;
      assert.ok(sourceArchiveId);

      const interruptedImportId = (await admin.query(
        `INSERT INTO comind.cm_archive_import
           (source_archive_id,parser_version,schema_version,attempt_number,import_mode)
         VALUES ($1,$2,$3,1,'differential') RETURNING import_id::text`,
        [sourceArchiveId,CHATGPT_ARCHIVE_PARSER_VERSION,CHATGPT_ARCHIVE_SCHEMA_VERSION],
      )).rows[0]?.import_id;
      assert.ok(interruptedImportId);

      await admin.query(
        `INSERT INTO comind.cm_archive_snapshot_conversation
           (import_id,source_conversation_id,classification,present,prior_observation_import_id,observation_import_id,
            raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,source_path,evidence)
         SELECT $1,source_conversation_id,'unchanged',true,observation_import_id,observation_import_id,
                raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,'conversations.json',
                '{"synthetic_committed_before_interrupt":true}'::jsonb
           FROM comind.cm_archive_snapshot_conversation
          WHERE import_id=$2::uuid AND source_conversation_id='recovery-conversation'`,
        [interruptedImportId,baseline.importId],
      );

      const headBeforeRecovery = (await admin.query(
        `SELECT sequence_no::int FROM comind.cm_archive_checkpoint WHERE archive_stream_id=$1::uuid ORDER BY sequence_no DESC LIMIT 1`,
        [checkpoint.archiveStreamId],
      )).rows[0];
      assert.equal(headBeforeRecovery.sequence_no, 1);

      const recovery = await recoverInterruptedArchiveImport(interruptedImportId, 'synthetic committed-membership interruption');
      assert.equal(recovery.abandonedImportId, interruptedImportId);
      assert.equal(recovery.abandonedAttemptNumber, 1);
      assert.equal(recovery.successorAttemptNumber, 2);
      assert.equal(recovery.reused, false);

      const lineage = (await admin.query(
        `SELECT import_id::text,status,attempt_number,import_mode,predecessor_import_id::text,root_import_id::text
           FROM comind.cm_archive_import
          WHERE import_id IN ($1::uuid,$2::uuid) ORDER BY attempt_number`,
        [recovery.abandonedImportId,recovery.successorImportId],
      )).rows;
      assert.equal(lineage[0].status, 'ABANDONED');
      assert.equal(lineage[0].import_mode, 'differential');
      assert.equal(lineage[1].status, 'PENDING');
      assert.equal(lineage[1].import_mode, 'differential');
      assert.equal(lineage[1].predecessor_import_id, recovery.abandonedImportId);
      assert.equal(lineage[1].root_import_id, recovery.abandonedImportId);

      const headAfterRecovery = (await admin.query(
        `SELECT sequence_no::int FROM comind.cm_archive_checkpoint WHERE archive_stream_id=$1::uuid ORDER BY sequence_no DESC LIMIT 1`,
        [checkpoint.archiveStreamId],
      )).rows[0];
      assert.equal(headAfterRecovery.sequence_no, 1, 'ABANDONED recovery must not advance accepted checkpoint');

      const resumed = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: nextRoot });
      assert.ok(['PASS', 'WARN'].includes(resumed.status));
      assert.equal(resumed.importId, recovery.successorImportId);
      assert.equal(resumed.sequenceNo, 2);
      assert.ok(resumed.checkpointId);

      const preserved = await admin.query(
        `SELECT count(*)::int AS n FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid`,
        [recovery.abandonedImportId],
      );
      assert.equal(preserved.rows[0].n, 1, 'partial interrupted evidence must remain preserved');

      const replay = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: nextRoot });
      assert.equal(replay.reused, true);
      assert.equal(replay.checkpointId, resumed.checkpointId);
    } finally {
      await prepared.cleanup();
    }
  });
}
