import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

const execFileAsync = promisify(execFile);

if (process.env.CHATGPT_ARCHIVE_DB_TEST !== '1') {
  test('isolated PostgreSQL ChatGPT archive ingestion', { skip: 'requires CHATGPT_ARCHIVE_DB_TEST=1 and isolated comind_ci' }, () => {});
} else {
  process.env.ASSISTANT_PROVIDER = 'disabled';

  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const { closePool, prepareArchiveDatabaseSession, query } = await import('../dist/db.js');
  await prepareArchiveDatabaseSession();
  after(async () => closePool());

  function conversation(id, { text = 'fixture question', attachment = null, currentNode = 'assistant' } = {}) {
    const metadata = attachment ? { attachments: [attachment] } : undefined;
    return {
      id,
      title: `Fixture ${id}`,
      create_time: 1791840000,
      update_time: 1791840002,
      current_node: currentNode,
      mapping: {
        root: { id: 'root', parent: null, children: ['user'], message: null },
        user: {
          id: 'user', parent: 'root', children: ['assistant'],
          message: {
            id: `${id}-user`, author: { role: 'user' }, create_time: 1791840001, update_time: 1791840001,
            content: { content_type: 'text', parts: [text] }, status: 'finished_successfully', end_turn: true,
          },
        },
        assistant: {
          id: 'assistant', parent: 'user', children: [],
          message: {
            id: `${id}-assistant`, author: { role: 'assistant' }, create_time: 1791840002, update_time: 1791840002,
            content: { content_type: 'text', parts: [`answer for ${id}`] },
            ...(metadata ? { metadata } : {}), status: 'finished_successfully', end_turn: true,
          },
        },
      },
    };
  }

  async function tempRoot(prefix) {
    return mkdtemp(path.join(tmpdir(), prefix));
  }

  async function createZip(zipPath, files) {
    const script = [
      'import sys, zipfile',
      'archive = sys.argv[1]',
      'pairs = sys.argv[2:]',
      'with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:',
      '    for pair in pairs:',
      '        source, arcname = pair.split("::", 1)',
      '        z.write(source, arcname)',
    ].join('\n');
    await execFileAsync('python3', ['-c', script, zipPath, ...files.map(({ source, arcname }) => `${source}::${arcname}`)]);
  }

  test('isolated PostgreSQL import reconciles source and database, resolves attachments, and reuses exact archive attempt', async () => {
    const root = await tempRoot('comind-chatgpt-fixture-');
    try {
      const item = conversation('fixture-conversation', {
        attachment: { file_id: 'file-fixture', name: 'fixture.png', mime_type: 'image/png' },
      });
      await writeFile(path.join(root, 'conversations.json'), JSON.stringify([item]), 'utf8');
      await writeFile(path.join(root, 'fixture.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

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
      assert.equal(first.receipt.attachmentAssetCoverage.resolved >= 1, true);

      const attachmentRows = await query(
        `SELECT source_reference,source_metadata FROM comind.cm_archive_attachment_reference WHERE import_id=$1`,
        [first.importId]
      );
      assert.equal(attachmentRows.rows.length >= 1, true);
      assert.deepEqual([...new Set(attachmentRows.rows.map((row) => row.source_reference))], ['file-fixture']);
      assert.equal(attachmentRows.rows.every((row) => row.source_metadata.resolved_source_path === 'fixture.png'), true);
      assert.equal(attachmentRows.rows.every((row) => /^[a-f0-9]{64}$/.test(row.source_metadata.resolved_sha256)), true);

      const second = await ingestChatGptExport(root);
      assert.equal(second.reused, true);
      assert.equal(second.importId, first.importId);
      assert.equal(second.receiptSha256, first.receiptSha256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('numbered shards are one logical snapshot and stream a conversation larger than a read chunk', async () => {
    const root = await tempRoot('comind-chatgpt-shards-');
    try {
      const giant = 'chunk-boundary '.repeat(30000);
      const first = conversation('shard-conversation-1', {
        text: giant,
        attachment: { asset_pointer: 'file-service://file_abc123', name: 'file_abc123.dat', mime_type: 'application/octet-stream' },
      });
      first.future_conversation_field = { emitted_by: 'future-exporter' };
      first.mapping.assistant.message.future_message_field = 'preserve-me';
      const second = conversation('shard-conversation-2');
      await writeFile(path.join(root, 'conversations-000.json'), JSON.stringify([first]), 'utf8');
      await writeFile(path.join(root, 'conversations-001.json'), JSON.stringify([second]), 'utf8');
      await writeFile(path.join(root, 'file_abc123.dat'), Buffer.from([1, 2, 3, 4]));

      const result = await ingestChatGptExport(root);
      assert.equal(result.status, 'PASS');
      assert.equal(result.receipt.sourceCounts.conversations, 2);
      assert.equal(result.receipt.sourceCounts.assets, 1);
      assert.equal(result.receipt.attachmentAssetCoverage.resolved >= 1, true);
      assert.deepEqual(
        result.receipt.sourceConversationFiles.map((file) => file.sourcePath),
        ['conversations-000.json', 'conversations-001.json']
      );
      assert.equal(result.receipt.schemaDriftTelemetry.unmodeledFields.conversation.includes('future_conversation_field'), true);
      assert.equal(result.receipt.schemaDriftTelemetry.unmodeledFields.message.includes('future_message_field'), true);
      const infoRows = await query(
        `SELECT event_code,severity FROM comind.cm_archive_parser_event WHERE import_id=$1 AND severity='INFO' ORDER BY event_code`,
        [result.importId]
      );
      assert.equal(infoRows.rows.some((row) => row.event_code === 'SCHEMA_DRIFT_CONVERSATION_FIELDS'), true);
      assert.equal(infoRows.rows.some((row) => row.event_code === 'SCHEMA_DRIFT_MESSAGE_FIELDS'), true);

      const rows = await query(
        `SELECT source_conversation_id,raw_conversation FROM comind.cm_archive_conversation_observation WHERE import_id=$1 ORDER BY source_conversation_id`,
        [result.importId]
      );
      assert.equal(rows.rows.length, 2);
      assert.equal(rows.rows[0].raw_conversation.mapping.user.message.content.parts[0].length, giant.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('missing physical attachment assets are preserved as explicit non-degrading coverage gaps', async () => {
    const root = await tempRoot('comind-chatgpt-missing-asset-');
    try {
      const item = conversation('missing-asset-conversation', {
        attachment: { file_id: 'file-not-exported', name: 'missing.png', mime_type: 'image/png' },
      });
      await writeFile(path.join(root, 'conversations.json'), JSON.stringify([item]), 'utf8');
      const result = await ingestChatGptExport(root);
      assert.equal(result.status, 'PASS');
      assert.equal(result.receipt.attachmentAssetCoverage.references >= 1, true);
      assert.equal(result.receipt.attachmentAssetCoverage.resolved, 0);
      assert.equal(result.receipt.attachmentAssetCoverage.unresolved >= 1, true);
      const refs = await query(
        `SELECT source_reference,source_metadata FROM comind.cm_archive_attachment_reference WHERE import_id=$1`,
        [result.importId]
      );
      assert.deepEqual([...new Set(refs.rows.map((row) => row.source_reference))], ['file-not-exported']);
      assert.equal(refs.rows.every((row) => row.source_metadata.asset_resolution === 'missing_in_export'), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('duplicate conversation IDs across numbered shards fail closed and quarantine the duplicate', async () => {
    const root = await tempRoot('comind-chatgpt-duplicate-shard-');
    try {
      await writeFile(path.join(root, 'conversations-000.json'), JSON.stringify([conversation('duplicate-id', { text: 'first' })]), 'utf8');
      await writeFile(path.join(root, 'conversations-001.json'), JSON.stringify([conversation('duplicate-id', { text: 'second' })]), 'utf8');
      const result = await ingestChatGptExport(root);
      assert.equal(result.status, 'FAIL');
      const events = await query(
        `SELECT event_code FROM comind.cm_archive_parser_event WHERE import_id=$1`,
        [result.importId]
      );
      assert.equal(events.rows.some((row) => row.event_code === 'DUPLICATE_CONVERSATION_ID'), true);
      const quarantine = await query(
        `SELECT reason_code,source_conversation_id FROM comind.cm_archive_quarantine WHERE import_id=$1`,
        [result.importId]
      );
      assert.equal(quarantine.rows.some((row) => row.reason_code === 'DUPLICATE_CONVERSATION_ID' && row.source_conversation_id === 'duplicate-id'), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('nested Privacy-Portal-style ZIPs are expanded in staging without mutating the supplied source directory', async () => {
    const root = await tempRoot('comind-chatgpt-nested-source-');
    const inner = await tempRoot('comind-chatgpt-nested-inner-');
    try {
      await writeFile(path.join(inner, 'conversations-000.json'), JSON.stringify([conversation('nested-conversation')]), 'utf8');
      const innerZip = path.join(root, 'Conversations__part-000.zip');
      await createZip(innerZip, [{ source: path.join(inner, 'conversations-000.json'), arcname: 'conversations-000.json' }]);
      await writeFile(path.join(root, 'export_manifest.json'), JSON.stringify({ parts: ['Conversations__part-000.zip'] }), 'utf8');
      const before = (await readdir(root)).sort();
      const result = await ingestChatGptExport(root);
      const after = (await readdir(root)).sort();
      assert.equal(result.status, 'PASS');
      assert.deepEqual(after, before);
      assert.equal(after.includes('__nested_exports'), false);
      const rows = await query(
        `SELECT source_conversation_id FROM comind.cm_archive_conversation_observation WHERE import_id=$1`,
        [result.importId]
      );
      assert.deepEqual(rows.rows.map((row) => row.source_conversation_id), ['nested-conversation']);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(inner, { recursive: true, force: true });
    }
  });

  test('unrelated ZIP attachments are not recursively treated as export shards', async () => {
    const root = await tempRoot('comind-chatgpt-unrelated-zip-');
    const payload = await tempRoot('comind-chatgpt-unrelated-payload-');
    try {
      await writeFile(path.join(root, 'conversations.json'), JSON.stringify([conversation('unrelated-zip-conversation')]), 'utf8');
      await writeFile(path.join(payload, 'notes.json'), JSON.stringify({ note: 'ordinary uploaded zip content' }), 'utf8');
      await createZip(path.join(root, 'ordinary-upload.zip'), [{ source: path.join(payload, 'notes.json'), arcname: 'notes.json' }]);
      const result = await ingestChatGptExport(root);
      assert.equal(result.status, 'PASS');
      assert.equal(result.receipt.sourceCounts.conversations, 1);
      assert.deepEqual(result.receipt.sourceConversationFiles.map((file) => file.sourcePath), ['conversations.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(payload, { recursive: true, force: true });
    }
  });

  test('unsafe ZIP traversal entries are rejected before extraction', async () => {
    const root = await tempRoot('comind-chatgpt-unsafe-zip-');
    try {
      const archive = path.join(root, 'unsafe.zip');
      const script = [
        'import sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as z:',
        '    z.writestr("../escape.txt", "forbidden")',
        '    z.writestr("conversations.json", "[]")',
      ].join('\n');
      await execFileAsync('python3', ['-c', script, archive]);
      await assert.rejects(() => ingestChatGptExport(archive), /Unsafe ZIP entry rejected/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
