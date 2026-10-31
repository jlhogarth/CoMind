import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

const execFileAsync = promisify(execFile);

if (process.env.CHATGPT_ARCHIVE_DB_TEST !== '1') {
  test('isolated PostgreSQL ChatGPT archive interruption recovery', { skip: 'requires CHATGPT_ARCHIVE_DB_TEST=1 and isolated comind_ci' }, () => {});
} else {
  process.env.ASSISTANT_PROVIDER = 'disabled';

  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const { recoverInterruptedArchiveImport } = await import('../dist/archive/chatgpt-archive-recovery.js');
  const {
    CHATGPT_ARCHIVE_PARSER_VERSION,
    CHATGPT_ARCHIVE_SCHEMA_VERSION,
    analyzeChatGptConversation,
    sha256Canonical,
    sha256Text,
  } = await import('../dist/archive/chatgpt-export.js');
  const { closePool, pool, prepareArchiveDatabaseSession, query } = await import('../dist/db.js');
  await prepareArchiveDatabaseSession();
  after(async () => closePool());

  function conversation(id) {
    return {
      id,
      title: `Interrupted fixture ${id}`,
      create_time: 1791840000,
      update_time: 1791840002,
      current_node: 'assistant',
      mapping: {
        root: { id: 'root', parent: null, children: ['user'], message: null },
        user: {
          id: 'user', parent: 'root', children: ['assistant'],
          message: {
            id: `${id}-user`, author: { role: 'user' }, create_time: 1791840001, update_time: 1791840001,
            content: { content_type: 'text', parts: ['interrupted source question'] }, status: 'finished_successfully', end_turn: true,
          },
        },
        assistant: {
          id: 'assistant', parent: 'user', children: [],
          message: {
            id: `${id}-assistant`, author: { role: 'assistant' }, create_time: 1791840002, update_time: 1791840002,
            content: { content_type: 'text', parts: ['interrupted source answer'] }, status: 'finished_successfully', end_turn: true,
          },
        },
      },
    };
  }

  async function seedInterruptedAttempt(id) {
    const root = await mkdtemp(path.join(tmpdir(), `comind-pfc-a01-${id}-`));
    const item = conversation(id);
    const sourceText = JSON.stringify([item]);
    const sourcePath = path.join(root, 'conversations.json');
    await writeFile(sourcePath, sourceText, 'utf8');

    const fileSha256 = sha256Text(sourceText);
    const sourceArchiveSha256 = sha256Canonical([{
      sourcePath: 'conversations.json',
      byteLength: Buffer.byteLength(sourceText),
      sha256: fileSha256,
    }]);

    const sourceResult = await query(
      `INSERT INTO comind.cm_archive_source
         (source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_uri,source_metadata)
       VALUES ('chatgpt',$1,$2,$3,$4,$5::jsonb)
       RETURNING source_archive_id`,
      [path.basename(root), sourceArchiveSha256, Buffer.byteLength(sourceText), root, JSON.stringify({ fixture: 'PFC-A01' })]
    );
    const sourceArchiveId = sourceResult.rows[0].source_archive_id;

    await query(
      `INSERT INTO comind.cm_archive_source_file
         (source_archive_id,source_path,file_role,byte_length,sha256,media_type,source_metadata)
       VALUES ($1,'conversations.json','conversation_json',$2,$3,'application/json','{}'::jsonb)`,
      [sourceArchiveId, Buffer.byteLength(sourceText), fileSha256]
    );

    const importResult = await query(
      `INSERT INTO comind.cm_archive_import
         (source_archive_id,parser_version,schema_version,attempt_number)
       VALUES ($1,$2,$3,1)
       RETURNING import_id`,
      [sourceArchiveId, CHATGPT_ARCHIVE_PARSER_VERSION, CHATGPT_ARCHIVE_SCHEMA_VERSION]
    );
    const importId = importResult.rows[0].import_id;

    const analysis = analyzeChatGptConversation(item);
    assert.ok(analysis, 'fixture must parse');
    const branchAwareTopologyHash = sha256Canonical({
      graphTopologyHash: analysis.topologyHash,
      currentNodeId: analysis.currentNodeId,
    });

    // This committed conversation transaction is the exact durable state left
    // by an abrupt process death before the import receipt is finalized.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO comind.cm_archive_conversation_observation
           (import_id,source_conversation_id,title,source_created_at,source_updated_at,created_at,updated_at,
            raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
        [
          importId, analysis.sourceConversationId, analysis.title,
          JSON.stringify(analysis.sourceCreatedAt), JSON.stringify(analysis.sourceUpdatedAt), analysis.createdAt, analysis.updatedAt,
          analysis.rawSourceHash, analysis.normalizedHash, branchAwareTopologyHash,
          analysis.nodeCount, analysis.messageCount, analysis.attachmentReferenceCount, JSON.stringify(analysis.rawConversation),
        ]
      );
      for (const node of analysis.nodes) {
        await client.query(
          `INSERT INTO comind.cm_archive_node_observation
             (import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,
              source_message_id,role,source_created_at,source_updated_at,created_at,updated_at,content_type,
              raw_node_hash,normalized_message_hash,raw_node)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb)`,
          [
            importId, analysis.sourceConversationId, node.sourceNodeId, node.parentSourceNodeId, JSON.stringify(node.childSourceNodeIds),
            node.sourceMessageId, node.role, JSON.stringify(node.sourceCreatedAt), JSON.stringify(node.sourceUpdatedAt), node.createdAt,
            node.updatedAt, node.contentType, node.rawNodeHash, node.normalizedMessageHash, JSON.stringify(node.rawNode),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { root, item, importId, sourceArchiveId };
  }

  async function attemptSnapshot(importId) {
    const result = await query(
      `SELECT i.import_id,i.status,i.attempt_number,i.predecessor_import_id,i.root_import_id,i.recovery_reason,
              i.receipt,i.receipt_sha256,
              (SELECT count(*)::int FROM comind.cm_archive_conversation_observation c WHERE c.import_id=i.import_id) AS conversations,
              (SELECT count(*)::int FROM comind.cm_archive_node_observation n WHERE n.import_id=i.import_id) AS nodes
         FROM comind.cm_archive_import i
        WHERE i.import_id=$1`,
      [importId]
    );
    assert.equal(result.rows.length, 1);
    return result.rows[0];
  }

  test('interrupted import fails closed, preserves the abandoned attempt, and succeeds through a clean successor', async () => {
    const fixture = await seedInterruptedAttempt('recovery-success');
    try {
      const before = await attemptSnapshot(fixture.importId);
      assert.equal(before.status, 'PENDING');
      assert.equal(before.conversations, 1);
      assert.equal(before.nodes, 3);

      await assert.rejects(
        () => ingestChatGptExport(fixture.root),
        /explicit recovery is required before retry/
      );

      const recovery = await recoverInterruptedArchiveImport(
        fixture.importId,
        'PFC-A01 controlled interruption after first conversation commit'
      );
      assert.equal(recovery.reused, false);
      assert.equal(recovery.abandonedImportId, fixture.importId);
      assert.equal(recovery.abandonedAttemptNumber, 1);
      assert.equal(recovery.successorAttemptNumber, 2);
      assert.equal(recovery.rootImportId, fixture.importId);
      assert.match(recovery.abandonedReceiptSha256, /^[a-f0-9]{64}$/);

      const abandoned = await attemptSnapshot(fixture.importId);
      assert.equal(abandoned.status, 'ABANDONED');
      assert.equal(abandoned.conversations, before.conversations);
      assert.equal(abandoned.nodes, before.nodes);
      assert.equal(abandoned.receipt.status, 'ABANDONED');
      assert.equal(abandoned.receipt.sourceEvidencePreserved, true);
      assert.equal(abandoned.receipt.deletionPerformed, false);

      const successorBefore = await attemptSnapshot(recovery.successorImportId);
      assert.equal(successorBefore.status, 'PENDING');
      assert.equal(successorBefore.attempt_number, 2);
      assert.equal(successorBefore.predecessor_import_id, fixture.importId);
      assert.equal(successorBefore.root_import_id, fixture.importId);
      assert.equal(successorBefore.conversations, 0);
      assert.equal(successorBefore.nodes, 0);

      const repeatedRecovery = await recoverInterruptedArchiveImport(
        fixture.importId,
        'PFC-A01 controlled interruption after first conversation commit'
      );
      assert.equal(repeatedRecovery.reused, true);
      assert.equal(repeatedRecovery.successorImportId, recovery.successorImportId);

      const successfulRetry = await ingestChatGptExport(fixture.root);
      assert.equal(successfulRetry.status, 'PASS');
      assert.equal(successfulRetry.reused, false);
      assert.equal(successfulRetry.importId, recovery.successorImportId);

      const repeatedIngest = await ingestChatGptExport(fixture.root);
      assert.equal(repeatedIngest.status, 'PASS');
      assert.equal(repeatedIngest.reused, true);
      assert.equal(repeatedIngest.importId, recovery.successorImportId);
      assert.equal(repeatedIngest.receiptSha256, successfulRetry.receiptSha256);

      const lineage = await query(
        `SELECT import_id,status,attempt_number,predecessor_import_id,root_import_id
           FROM comind.cm_archive_import
          WHERE source_archive_id=$1
          ORDER BY attempt_number`,
        [fixture.sourceArchiveId]
      );
      assert.equal(lineage.rows.length, 2);
      assert.deepEqual(lineage.rows.map((row) => row.status), ['ABANDONED', 'PASS']);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('concurrent recovery requests converge on one successor identity', async () => {
    const fixture = await seedInterruptedAttempt('recovery-concurrency');
    try {
      const reason = 'PFC-A01 concurrent recovery convergence proof';
      const env = {
        ...process.env,
        COMIND_DATABASE_PURPOSE: 'chatgpt_archive',
      };
      const args = ['dist/archive/chatgpt-export-cli.js', '--recover', fixture.importId, reason];
      const [first, second] = await Promise.all([
        execFileAsync('node', args, { env }),
        execFileAsync('node', args, { env }),
      ]);
      const firstResult = JSON.parse(first.stdout);
      const secondResult = JSON.parse(second.stdout);
      assert.equal(firstResult.status, 'PASS');
      assert.equal(secondResult.status, 'PASS');
      assert.equal(firstResult.successorImportId, secondResult.successorImportId);
      assert.equal([firstResult.reused, secondResult.reused].filter(Boolean).length, 1);

      const successors = await query(
        `SELECT import_id FROM comind.cm_archive_import WHERE predecessor_import_id=$1`,
        [fixture.importId]
      );
      assert.equal(successors.rows.length, 1);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
}
