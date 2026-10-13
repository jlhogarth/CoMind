import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';

if (process.env.CHATGPT_ARCHIVE_DB_TEST !== '1') {
  test('PIT-0 synthetic ChatGPT archive load proof', { skip: 'requires CHATGPT_ARCHIVE_DB_TEST=1 and isolated comind_ci' }, () => {});
} else {
  process.env.ASSISTANT_PROVIDER = 'disabled';

  const { ingestChatGptExport } = await import('../dist/archive/chatgpt-export-ingest.js');
  const { closePool, query } = await import('../dist/db.js');

  after(async () => {
    await closePool();
  });

  const conversationCount = 100;
  const messagesPerConversation = 20;
  const physicalAssetCount = 10;

  function makeConversation(index) {
    const conversationId = `pit0-conversation-${String(index).padStart(4, '0')}`;
    const baseTime = 1791840000 + index * 100;
    const mapping = {
      root: {
        id: `${conversationId}-root`,
        parent: null,
        children: [`${conversationId}-node-0001`],
        message: null,
      },
    };

    let previousNodeId = `${conversationId}-root`;
    for (let messageIndex = 1; messageIndex <= messagesPerConversation; messageIndex += 1) {
      const nodeId = `${conversationId}-node-${String(messageIndex).padStart(4, '0')}`;
      const nextNodeId = messageIndex < messagesPerConversation
        ? `${conversationId}-node-${String(messageIndex + 1).padStart(4, '0')}`
        : null;
      const role = messageIndex % 2 === 1 ? 'user' : 'assistant';
      const attachment = messageIndex === messagesPerConversation && index % 10 === 0
        ? {
            attachments: [{
              file_id: `pit0-asset-${String(index / 10).padStart(2, '0')}`,
              name: `asset-${String(index / 10).padStart(2, '0')}.png`,
              mime_type: 'image/png',
            }],
          }
        : undefined;

      mapping[nodeId] = {
        id: nodeId,
        parent: previousNodeId,
        children: nextNodeId ? [nextNodeId] : [],
        message: {
          id: `${conversationId}-message-${String(messageIndex).padStart(4, '0')}`,
          author: { role },
          create_time: baseTime + messageIndex,
          update_time: baseTime + messageIndex,
          content: {
            content_type: 'text',
            parts: [
              `PIT-0 ${role} message ${messageIndex} in conversation ${index}. ${'load-fixture '.repeat(24)}`,
            ],
          },
          ...(attachment ? { metadata: attachment } : {}),
          status: 'finished_successfully',
          end_turn: true,
        },
      };

      previousNodeId = nodeId;
    }

    return {
      id: conversationId,
      title: `PIT-0 synthetic conversation ${index}`,
      create_time: baseTime,
      update_time: baseTime + messagesPerConversation,
      mapping,
    };
  }

  async function makeLoadFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-pit0-load-'));
    const conversations = Array.from({ length: conversationCount }, (_, index) => makeConversation(index));
    await writeFile(path.join(root, 'conversations.json'), JSON.stringify(conversations), 'utf8');

    for (let index = 0; index < physicalAssetCount; index += 1) {
      await writeFile(
        path.join(root, `asset-${String(index).padStart(2, '0')}.png`),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, index]),
      );
    }

    return root;
  }

  test('PIT-0 synthetic corpus reconciles under constrained archive database role', async () => {
    const root = await makeLoadFixture();
    try {
      const started = performance.now();
      const result = await ingestChatGptExport(root);
      const elapsedMs = performance.now() - started;

      assert.equal(result.status, 'PASS');
      assert.equal(result.reused, false);
      assert.match(result.receiptSha256, /^[a-f0-9]{64}$/);

      const receipt = result.receipt;
      assert.deepEqual(receipt.sourceCounts, {
        conversations: conversationCount,
        messages: conversationCount * messagesPerConversation,
        nodes: conversationCount * (messagesPerConversation + 1),
        assets: physicalAssetCount,
      });
      assert.equal(receipt.status, 'PASS');

      const counts = await query(
        `SELECT
           (SELECT count(*) FROM comind.cm_archive_conversation_observation WHERE import_id = $1)::int AS conversations,
           (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id = $1 AND source_message_id IS NOT NULL)::int AS messages,
           (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id = $1)::int AS nodes,
           (SELECT count(*) FROM comind.cm_archive_attachment_reference WHERE import_id = $1)::int AS attachment_refs`,
        [result.importId]
      );
      assert.deepEqual(counts.rows[0], {
        conversations: conversationCount,
        messages: conversationCount * messagesPerConversation,
        nodes: conversationCount * (messagesPerConversation + 1),
        attachment_refs: physicalAssetCount,
      });

      const secondStarted = performance.now();
      const repeated = await ingestChatGptExport(root);
      const repeatedElapsedMs = performance.now() - secondStarted;
      assert.equal(repeated.reused, true);
      assert.equal(repeated.importId, result.importId);
      assert.equal(repeated.receiptSha256, result.receiptSha256);

      const artifactDir = path.resolve(process.cwd(), '..', 'artifacts');
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        path.join(artifactDir, 'chatgpt-archive-pit0-load-baseline.json'),
        JSON.stringify({
          evidenceState: 'synthetic-isolated-development-only',
          conversationCount,
          messagesPerConversation,
          sourceMessageCount: conversationCount * messagesPerConversation,
          sourceNodeCount: conversationCount * (messagesPerConversation + 1),
          physicalAssetCount,
          firstImportElapsedMs: Number(elapsedMs.toFixed(3)),
          repeatedImportElapsedMs: Number(repeatedElapsedMs.toFixed(3)),
          status: result.status,
          receiptSha256: result.receiptSha256,
          reusedImportId: repeated.importId,
        }, null, 2) + '\n',
        'utf8'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
