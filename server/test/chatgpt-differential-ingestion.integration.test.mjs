import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';

if (process.env.CHATGPT_ARCHIVE_DIFFERENTIAL_DB_TEST !== '1') {
  test('checkpointed ChatGPT differential ingestion', { skip: 'requires isolated PostgreSQL differential test lane' }, () => {});
} else {
  const { Pool } = pg;
  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const {
    CHATGPT_ARCHIVE_HASH_VERSION,
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

  function messageNode(id, parent, children, role, text, time, metadata = {}) {
    return {
      id,
      parent,
      children,
      message: {
        id: `${id}-message`,
        author: { role },
        create_time: time,
        update_time: time,
        content: { content_type: 'text', parts: [text] },
        metadata,
        status: 'finished_successfully',
        end_turn: true,
      },
    };
  }

  function conversation(id, options = {}) {
    const {
      title = `Conversation ${id}`,
      answer = `Answer ${id}`,
      extra = undefined,
      branchBackdated = false,
      attachment = false,
      appended = false,
    } = options;
    const userChildren = [];
    if (branchBackdated) userChildren.push('historic');
    userChildren.push('assistant');
    const assistantChildren = appended ? ['followup'] : [];
    const metadata = attachment
      ? { attachments: [{ asset_pointer: 'file-service://asset.bin', name: 'asset.bin', mime_type: 'application/octet-stream' }] }
      : {};
    const mapping = {
      root: { id: 'root', parent: null, children: ['user'], message: null },
      user: messageNode('user', 'root', userChildren, 'user', `Question ${id}`, 1791840001),
      assistant: messageNode('assistant', 'user', assistantChildren, 'assistant', answer, 1791840002, metadata),
    };
    if (branchBackdated) mapping.historic = messageNode('historic', 'user', [], 'assistant', `Backdated ${id}`, 1790000000);
    if (appended) mapping.followup = messageNode('followup', 'assistant', [], 'user', `Followup ${id}`, 1791840100);
    const result = {
      id,
      title,
      create_time: 1791840000,
      update_time: appended ? 1791840100 : 1791840002,
      current_node: appended ? 'followup' : 'assistant',
      mapping,
    };
    if (extra !== undefined) result.future_export_field = extra;
    return result;
  }

  async function makeExport(label, conversations, assetBytes = null) {
    const root = await mkdtemp(path.join(tmpdir(), `comind-native-${label}-`));
    roots.push(root);
    await writeFile(path.join(root, 'conversations.json'), JSON.stringify(conversations), 'utf8');
    if (assetBytes !== null) {
      await mkdir(path.join(root, 'assets'), { recursive: true });
      await writeFile(path.join(root, 'assets', 'asset.bin'), assetBytes);
    }
    return root;
  }

  async function certifySyntheticBaseline(importId) {
    const row = (await admin.query(
      `SELECT i.source_archive_id::text,s.source_archive_sha256::text
         FROM comind.cm_archive_import i JOIN comind.cm_archive_source s USING(source_archive_id)
        WHERE i.import_id=$1::uuid`, [importId],
    )).rows[0];
    assert.ok(row);
    const certification = {
      importId,
      sourceArchiveId: row.source_archive_id,
      sha256: row.source_archive_sha256,
      scope: 'isolated differential acceptance fixture only',
    };
    const baselineId = (await admin.query(
      `INSERT INTO comind.cm_conversation_history_baseline
         (import_id,source_archive_id,source_archive_sha256,certification_version,source_kind,certified_by,certification_reason,evidence,certification_sha256)
       VALUES ($1,$2,$3,'diff-ci-v1','native_openai_export','isolated-ci','Synthetic fixture certification. Not real history.',
               '{"synthetic":true,"scope":"isolated_test_only"}'::jsonb,$4)
       RETURNING baseline_id::text`,
      [importId,row.source_archive_id,row.source_archive_sha256,sha256Canonical(certification)],
    )).rows[0]?.baseline_id;
    assert.ok(baselineId);
    return baselineId;
  }

  async function checkpointHead(streamId) {
    return (await admin.query(
      `SELECT checkpoint_id::text,import_id::text,baseline_id::text,sequence_no::int,parser_version,schema_version,hash_version
         FROM comind.cm_archive_checkpoint WHERE archive_stream_id=$1::uuid ORDER BY sequence_no DESC LIMIT 1`, [streamId],
    )).rows[0];
  }

  async function snapshotRows(importId) {
    return (await admin.query(
      `SELECT source_conversation_id,classification,present,prior_observation_import_id::text,observation_import_id::text,
              raw_source_hash::text,normalized_hash::text,topology_hash::text,attachment_set_hash::text
         FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid ORDER BY source_conversation_id`, [importId],
    )).rows;
  }

  test('A→B→C creates one baseline and differential checkpoints with content reuse and no deletion semantics', async () => {
    const streamKey = `chatgpt-diff-ci-${Date.now()}`;
    const aConversations = [
      conversation('conv-unchanged'),
      conversation('conv-branch'),
      conversation('conv-missing'),
      conversation('conv-attachment', { attachment: true }),
      conversation('conv-title'),
      conversation('conv-edit'),
      conversation('conv-raw', { extra: { version: 1 } }),
    ];
    const aRoot = await makeExport('a', aConversations, 'asset-version-a');
    const a = await ingestChatGptExport(aRoot);
    assert.equal(a.status, 'PASS');
    assert.equal(a.reused, false);
    const baselineId = await certifySyntheticBaseline(a.importId);
    const baselineCheckpoint = await establishChatGptBaselineCheckpoint({ sourceIdentityKey: streamKey, importId: a.importId });
    assert.equal(baselineCheckpoint.sequenceNo, 1);
    assert.equal(baselineCheckpoint.baselineId, baselineId);

    const baselineMembership = await snapshotRows(a.importId);
    assert.equal(baselineMembership.length, aConversations.length);
    assert.ok(baselineMembership.every((row) => row.present && row.classification === 'baseline' && row.observation_import_id === a.importId));

    const bConversations = [
      conversation('conv-unchanged'),
      conversation('conv-branch', { branchBackdated: true }),
      conversation('conv-attachment', { attachment: true }),
      conversation('conv-title', { title: 'Renamed title only' }),
      conversation('conv-edit', { answer: 'Edited old answer' }),
      conversation('conv-raw', { extra: { version: 2 } }),
      conversation('conv-new'),
    ];
    const bRoot = await makeExport('b', bConversations, 'asset-version-b');
    const b = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: bRoot });
    assert.ok(['PASS', 'WARN'].includes(b.status));
    assert.equal(b.sequenceNo, 2);
    assert.equal(b.reused, false);
    assert.equal(b.deltaCounts.unchanged, 1);
    assert.equal(b.deltaCounts.new, 1);
    assert.equal(b.deltaCounts.absent, 1);
    assert.ok((b.deltaCounts.structurally_changed ?? 0) >= 1);
    assert.ok((b.deltaCounts.content_changed ?? 0) >= 2);
    assert.ok((b.deltaCounts.raw_changed ?? 0) >= 1);
    assert.ok((b.deltaCounts.attachment_changed ?? 0) >= 1);
    assert.ok(b.contentWrites.conversations < bConversations.length);

    const bRows = await snapshotRows(b.importId);
    const bById = new Map(bRows.map((row) => [row.source_conversation_id, row]));
    assert.equal(bById.get('conv-unchanged').classification, 'unchanged');
    assert.equal(bById.get('conv-unchanged').observation_import_id, a.importId);
    assert.equal(bById.get('conv-missing').classification, 'absent');
    assert.equal(bById.get('conv-missing').present, false);
    assert.equal(bById.get('conv-missing').observation_import_id, null);
    assert.equal(bById.get('conv-missing').prior_observation_import_id, a.importId);
    assert.equal(bById.get('conv-attachment').classification, 'attachment_changed');
    assert.equal(bById.get('conv-raw').classification, 'raw_changed');

    const unchangedAuthority = await admin.query(
      `SELECT count(*)::int AS n FROM comind.cm_archive_conversation_observation WHERE source_conversation_id='conv-unchanged'`,
    );
    assert.equal(unchangedAuthority.rows[0].n, 1, 'unchanged content must remain single-copy authoritative evidence');
    const missingAuthority = await admin.query(
      `SELECT count(*)::int AS n FROM comind.cm_archive_conversation_observation WHERE source_conversation_id='conv-missing'`,
    );
    assert.equal(missingAuthority.rows[0].n, 1, 'absence must never delete prior source evidence');

    const beforeRepeat = (await admin.query(
      `SELECT
        (SELECT count(*) FROM comind.cm_archive_conversation_observation)::int AS conversations,
        (SELECT count(*) FROM comind.cm_archive_node_observation)::int AS nodes,
        (SELECT count(*) FROM comind.cm_archive_checkpoint)::int AS checkpoints`,
    )).rows[0];
    const bRepeat = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: bRoot });
    assert.equal(bRepeat.reused, true);
    assert.equal(bRepeat.checkpointId, b.checkpointId);
    const afterRepeat = (await admin.query(
      `SELECT
        (SELECT count(*) FROM comind.cm_archive_conversation_observation)::int AS conversations,
        (SELECT count(*) FROM comind.cm_archive_node_observation)::int AS nodes,
        (SELECT count(*) FROM comind.cm_archive_checkpoint)::int AS checkpoints`,
    )).rows[0];
    assert.deepEqual(afterRepeat, beforeRepeat, 'exact reprocessing must create zero additional authoritative content or checkpoints');

    const cConversations = bConversations.map((item) => item.id === 'conv-unchanged' ? conversation('conv-unchanged', { appended: true }) : item);
    const cRoot = await makeExport('c', cConversations, 'asset-version-b');
    const c = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: cRoot });
    assert.ok(['PASS', 'WARN'].includes(c.status));
    assert.equal(c.sequenceNo, 3);
    const head = await checkpointHead(c.archiveStreamId);
    assert.equal(head.sequence_no, 3);
    assert.equal(head.baseline_id, baselineId, 'operational head must retain original certified baseline anchor');
    assert.equal(head.hash_version, CHATGPT_ARCHIVE_HASH_VERSION);

    const reconstructed = await admin.query(
      `SELECT s.source_conversation_id,o.raw_conversation
         FROM comind.cm_archive_snapshot_conversation s
         JOIN comind.cm_archive_conversation_observation o
           ON o.import_id=s.observation_import_id AND o.source_conversation_id=s.source_conversation_id
        WHERE s.import_id=$1::uuid AND s.present ORDER BY s.source_conversation_id`, [c.importId],
    );
    assert.deepEqual(reconstructed.rows.map((row) => row.source_conversation_id), cConversations.map((item) => item.id).sort());
    const expectedRaw = new Map(cConversations.map((item) => [item.id, item]));
    for (const row of reconstructed.rows) assert.deepEqual(row.raw_conversation, expectedRaw.get(row.source_conversation_id));

    const duplicateRoot = await makeExport('duplicate', [conversation('dup-id'), conversation('dup-id')]);
    const failed = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: duplicateRoot });
    assert.equal(failed.status, 'FAIL');
    assert.equal(failed.checkpointId, null);
    const headAfterFail = await checkpointHead(c.archiveStreamId);
    assert.equal(headAfterFail.sequence_no, 3, 'failed import must not advance accepted checkpoint');

    const failedImport = (await admin.query(`SELECT status FROM comind.cm_archive_import WHERE import_id=$1::uuid`, [failed.importId])).rows[0];
    assert.equal(failedImport.status, 'FAIL');
    const preservedFailure = await admin.query(`SELECT count(*)::int AS n FROM comind.cm_archive_quarantine WHERE import_id=$1::uuid`, [failed.importId]);
    assert.ok(preservedFailure.rows[0].n >= 1);

    const mismatchSource = (await admin.query(
      `INSERT INTO comind.cm_archive_source(source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata)
       VALUES ('chatgpt','parser-mismatch.zip',$1,1,'{}') RETURNING source_archive_id::text`, [sha256Canonical({ mismatch: streamKey })],
    )).rows[0];
    const mismatchImport = (await admin.query(
      `INSERT INTO comind.cm_archive_import(source_archive_id,parser_version,schema_version,import_mode,status,completed_at,receipt,receipt_sha256)
       VALUES ($1,'incompatible-parser',$2,'differential','PASS',now(),'{"status":"PASS"}',repeat('a',64)) RETURNING import_id::text`,
      [mismatchSource.source_archive_id,CHATGPT_ARCHIVE_SCHEMA_VERSION],
    )).rows[0];
    await assert.rejects(
      () => admin.query(
        `INSERT INTO comind.cm_archive_checkpoint
           (archive_stream_id,import_id,baseline_id,checkpoint_kind,sequence_no,predecessor_checkpoint_id,parser_version,schema_version,hash_version,receipt,receipt_sha256)
         VALUES ($1,$2,$3,'differential',4,$4,'incompatible-parser',$5,$6,'{}',repeat('b',64))`,
        [c.archiveStreamId,mismatchImport.import_id,baselineId,c.checkpointId,CHATGPT_ARCHIVE_SCHEMA_VERSION,CHATGPT_ARCHIVE_HASH_VERSION],
      ),
      /parser\/schema\/hash version mismatch|parser\/schema identity/,
    );
    const headAfterMismatch = await checkpointHead(c.archiveStreamId);
    assert.equal(headAfterMismatch.sequence_no, 3);

    const concurrencyRoot = await makeExport('concurrent', [...cConversations, conversation('conv-concurrent')], 'asset-version-b');
    const concurrent = await Promise.allSettled([
      ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: concurrencyRoot }),
      ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: concurrencyRoot }),
    ]);
    assert.ok(concurrent.some((item) => item.status === 'fulfilled'));
    assert.ok(concurrent.some((item) => item.status === 'rejected') || concurrent.every((item) => item.status === 'fulfilled'));
    const finalRetry = await ingestChatGptDifferentialExport({ sourceIdentityKey: streamKey, inputPath: concurrencyRoot });
    assert.equal(finalRetry.reused, true);
  });
}
