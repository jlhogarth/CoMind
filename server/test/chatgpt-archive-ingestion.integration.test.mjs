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

  async function makeFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-fixture-'));
    const conversation = {
      id: 'fixture-conversation',
      title: 'Integrity handshake fixture',
      create_time: 1791840000,
      update_time: 1791840002,
      mapping: {
        root: { id: 'root', parent: null, children: ['user'], message: null },
        user: {
          id: 'user',
          parent: 'root',
          children: ['assistant-a', 'assistant-b'],
          message: {
            id: 'fixture-user-message',
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
            id: 'fixture-assistant-a',
            author: { role: 'assistant' },
            create_time: 1791840002,
            update_time: 1791840002,
            content: { content_type: 'text', parts: ['branch a'] },
            status: 'finished_successfully',
            end_turn: true,
          },
        },
        'assistant-b': {
          id: 'assistant-b',
          parent: 'user',
          children: [],
          message: {
            id: 'fixture-assistant-b',
            author: { role: 'assistant' },
            create_time: 1791840002,
            update_time: 1791840002,
            content: { content_type: 'text', parts: ['branch b'] },
            metadata: {
              attachments: [{ file_id: 'file-fixture', name: 'fixture.png', mime_type: 'image/png' }],
            },
            status: 'finished_successfully',
            end_turn: true,
          },
        },
      },
    };
    await writeFile(path.join(root, 'conversations.json'), JSON.stringify([conversation]), 'utf8');
    await writeFile(path.join(root, 'fixture.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return root;
  }

  test('isolated PostgreSQL import reconciles source and database and reuses exact archive attempt', async () => {
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
                source_created_at, created_at
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

      const attachmentRows = await query(
        `SELECT reference_kind, source_reference FROM comind.cm_archive_attachment_reference WHERE import_id = $1`,
        [first.importId]
      );
      assert.equal(attachmentRows.rows.length >= 1, true);
      assert.equal(attachmentRows.rows.some((candidate) => candidate.source_reference === 'file-fixture'), true);

      const second = await ingestChatGptExport(root);
      assert.equal(second.reused, true);
      assert.equal(second.importId, first.importId);
      assert.equal(second.receiptSha256, first.receiptSha256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
