import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

if (process.env.CHATGPT_ARCHIVE_DB_TEST !== '1') {
  test('isolated PostgreSQL ChatGPT archive ingestion', { skip: 'requires CHATGPT_ARCHIVE_DB_TEST=1 and isolated comind_ci' }, () => {});
} else {
  process.env.ASSISTANT_PROVIDER = 'disabled';

  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const { closePool, prepareArchiveDatabaseSession, query } = await import('../dist/db.js');

  await prepareArchiveDatabaseSession();

  after(async () => {
    await closePool();
  });

  function conversationFixture(id = 'fixture-conversation') {
    return {
      id,
      title: 'Integrity handshake fixture',
      create_time: 1791840000,
      update_time: 1791840002,
      current_node: 'assistant-b',
      future_export_field: { preserved: true },
      mapping: {
        root: { id: 'root', parent: null, children: ['user'], message: null },
        user: {
          id: 'user',
          parent: 'root',
          children: ['assistant-a', 'assistant-b'],
          message: {
            id: `${id}-user-message`,
            author: { role: 'user' },
            create_time: 1791840001,
            update_time: 1791840001,
            content: { content_type: 'text', parts: ['fixture question'] },
            status: 'finished_successfully',
            end_turn: true,
          },
        },
        'assistant-a': {
          id: 'assistant-a',
          parent: 'user',
          children: [],
          message: {
            id: `${id}-assistant-a`,
            author: { role: 'assistant' },
            create_time: 1791840002,
            update_time: 1791840002,
            content: {
              content_type: 'multimodal_text',
              parts: [{ type: 'text', text: 'branch a' }],
            },
            status: 'finished_successfully',
            end_turn: true,
          },
        },
        'assistant-b': {
          id: 'assistant-b',
          parent: 'user',
          children: [],
          message: {
            id: `${id}-assistant-b`,
            author: { role: 'assistant' },
            create_time: 1791840002,
            update_time: 1791840002,
            content: { content_type: 'text', parts: ['branch b'] },
            metadata: {
              attachments: [
                { file_id: 'file-fixture', name: 'file-fixture.png', mime_type: 'image/png' },
                { file_id: 'file-missing', name: 'file-missing.png', mime_type: 'image/png' },
              ],
            },
            status: 'finished_successfully',
            end_turn: true,
          },
        },
      },
    };
  }

  async function makeFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-fixture-'));
    await writeFile(path.join(root, 'conversations.json'), JSON.stringify([conversationFixture()]), 'utf8');
    await writeFile(path.join(root, 'file-fixture.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return root;
  }

  async function makeDuplicateShardFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-duplicate-shards-'));
    const duplicate = conversationFixture('duplicate-conversation');
    delete duplicate.future_export_field;
    await writeFile(path.join(root, 'conversations-000.json'), JSON.stringify([duplicate]), 'utf8');
    await writeFile(path.join(root, 'conversations-001.json'), JSON.stringify([structuredClone(duplicate)]), 'utf8');
    return root;
  }

  test('isolated PostgreSQL import reconciles source, preserves INFO drift telemetry, and reuses exact archive attempt', async () => {
    const root = await makeFixture();
    try {
      const first = await ingestChatGptExport(root);
      assert.equal(first.status, 'PASS');
      assert.equal(first.reused, false);
      assert.match(first.receiptSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(first.receipt.reconciliation, {
        conversationsAccounted: true,
        messagesAccounted: true,
        nodesAccounted: true,
        assetsInventoried: true,
        parserErrors: 0,
        parserWarnings: 0,
        quarantinedFragments: 0,
      });

      const importRows = await query(
        `SELECT status, source_conversation_count, source_message_count, source_node_count,
                imported_conversation_count, imported_message_count, imported_node_count,
                source_attachment_count, imported_attachment_count, receipt_sha256
         FROM comind.cm_archive_import WHERE import_id = $1`,
        [first.importId]
      );
      assert.equal(importRows.rows.length, 1);
      const row = importRows.rows[0];
      assert.equal(row.status, 'PASS');
      assert.equal(Number(row.source_conversation_count), 1);
      assert.equal(Number(row.source_message_count), 3);
      assert.equal(Number(row.source_node_count), 4);
      assert.equal(Number(row.imported_conversation_count), 1);
      assert.equal(Number(row.imported_message_count), 3);
      assert.equal(Number(row.imported_node_count), 4);
      assert.equal(Number(row.source_attachment_count), 1);
      assert.equal(Number(row.imported_attachment_count), 1);
      assert.equal(row.receipt_sha256, first.receiptSha256);

      const topologyRows = await query(
        `SELECT source_node_id, parent_source_node_id, child_source_node_ids, source_message_id, role,
                source_created_at, created_at, content_type
         FROM comind.cm_archive_node_observation
         WHERE import_id = $1
         ORDER BY source_node_id`,
        [first.importId]
      );
      assert.equal(topologyRows.rows.length, 4);
      const user = topologyRows.rows.find((candidate) => candidate.source_node_id === 'user');
      assert.deepEqual(user.child_source_node_ids, ['assistant-a', 'assistant-b']);
      assert.equal(user.role, 'user');
      assert.equal(Number(user.source_created_at), 1791840001);
      assert.equal(
        topologyRows.rows.find((candidate) => candidate.source_node_id === 'assistant-a')?.content_type,
        'multimodal_text'
      );

      const attachmentRows = await query(
        `SELECT reference_kind, source_reference
         FROM comind.cm_archive_attachment_reference
         WHERE import_id = $1
         ORDER BY source_reference`,
        [first.importId]
      );
      assert.equal(attachmentRows.rows.some((candidate) => candidate.source_reference === 'file-fixture'), true);
      assert.equal(attachmentRows.rows.some((candidate) => candidate.source_reference === 'file-missing'), true);

      const sourceAssetRows = await query(
        `SELECT source_path
         FROM comind.cm_archive_source_file
         WHERE source_archive_id = $1 AND file_role = 'asset'
         ORDER BY source_path`,
        [first.sourceArchiveId]
      );
      assert.deepEqual(sourceAssetRows.rows.map((candidate) => candidate.source_path), ['file-fixture.png']);

      const infoRows = await query(
        `SELECT event_code, severity
         FROM comind.cm_archive_parser_event
         WHERE import_id = $1 AND severity = 'INFO'
         ORDER BY parser_event_id`,
        [first.importId]
      );
      assert.equal(infoRows.rows.some((candidate) => candidate.event_code === 'SCHEMA_DRIFT_CONVERSATION_FIELDS'), true);

      const second = await ingestChatGptExport(root);
      assert.equal(second.reused, true);
      assert.equal(second.importId, first.importId);
      assert.equal(second.receiptSha256, first.receiptSha256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('duplicate conversation IDs across numbered shards fail closed rather than overwrite evidence', async () => {
    const root = await makeDuplicateShardFixture();
    try {
      await assert.rejects(
        () => ingestChatGptExport(root),
        /duplicate key value|unique constraint/i
      );

      const pending = await query(
        `SELECT count(*)::int AS count
         FROM comind.cm_archive_import
         WHERE parser_version = 'chatgpt-export-v0.2.0' AND status = 'PENDING'`
      );
      assert.equal(Number(pending.rows[0]?.count ?? 0) >= 1, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
