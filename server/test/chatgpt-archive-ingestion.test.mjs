import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeChatGptConversation,
  canonicalJson,
  deriveIntegrityStatus,
  sha256Canonical,
} from '../dist/archive/chatgpt-export.js';

function message(id, role, createTime, text, contentType = 'text') {
  return {
    id,
    author: { role },
    create_time: createTime,
    update_time: createTime,
    content: { content_type: contentType, parts: [text] },
    status: 'finished_successfully',
    end_turn: true,
  };
}

function branchedConversation() {
  return {
    id: 'conversation-1',
    title: 'Archive integrity fixture',
    create_time: 1791840000,
    update_time: 1791840060,
    current_node: 'assistant-b',
    mapping: {
      root: {
        id: 'root',
        parent: null,
        children: ['user-1'],
        message: null,
      },
      'user-1': {
        id: 'user-1',
        parent: 'root',
        children: ['assistant-a', 'assistant-b'],
        message: message('message-user-1', 'user', 1791840001, 'hello'),
      },
      'assistant-a': {
        id: 'assistant-a',
        parent: 'user-1',
        children: [],
        message: message('message-assistant-a', 'assistant', 1791840002, 'branch a'),
      },
      'assistant-b': {
        id: 'assistant-b',
        parent: 'user-1',
        children: [],
        message: {
          ...message('message-assistant-b', 'assistant', 1791840003, 'branch b'),
          metadata: {
            attachments: [
              { id: 'attachment-1', file_id: 'file-123', name: 'evidence.txt', mime_type: 'text/plain' },
            ],
          },
        },
      },
    },
  };
}

test('canonical JSON and SHA-256 are stable across object key ordering', () => {
  const left = { b: 2, a: { z: true, y: [3, 4] } };
  const right = { a: { y: [3, 4], z: true }, b: 2 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(sha256Canonical(left), sha256Canonical(right));
});

test('analyzer accounts for conversations, messages, timestamps, roles, branches, current node, and attachments', () => {
  const analysis = analyzeChatGptConversation(branchedConversation());
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  assert.equal(analysis.sourceConversationId, 'conversation-1');
  assert.equal(analysis.currentNodeId, 'assistant-b');
  assert.equal(analysis.nodeCount, 4);
  assert.equal(analysis.messageCount, 3);
  assert.equal(analysis.attachmentReferenceCount >= 1, true);

  const user = analysis.nodes.find((node) => node.sourceMessageId === 'message-user-1');
  assert.ok(user);
  assert.equal(user.role, 'user');
  assert.equal(user.sourceCreatedAt, 1791840001);
  assert.equal(user.createdAt, new Date(1791840001 * 1000).toISOString());

  const parent = analysis.nodes.find((node) => node.sourceNodeId === 'user-1');
  assert.deepEqual(parent?.childSourceNodeIds, ['assistant-a', 'assistant-b']);
  assert.equal(parent?.parentSourceNodeId, 'root');
});

test('topology hash changes when branch structure changes even if message count is unchanged', () => {
  const original = branchedConversation();
  const changed = structuredClone(original);
  changed.mapping['assistant-b'].parent = 'assistant-a';
  changed.mapping['assistant-a'].children = ['assistant-b'];
  changed.mapping['user-1'].children = ['assistant-a'];

  const left = analyzeChatGptConversation(original);
  const right = analyzeChatGptConversation(changed);
  assert.ok(left && right);
  assert.equal(left.messageCount, right.messageCount);
  assert.notEqual(left.topologyHash, right.topologyHash);
});

test('selected branch identity changes normalized history identity without changing topology', () => {
  const original = branchedConversation();
  const changed = structuredClone(original);
  changed.current_node = 'assistant-a';

  const left = analyzeChatGptConversation(original);
  const right = analyzeChatGptConversation(changed);
  assert.ok(left && right);
  assert.equal(left.topologyHash, right.topologyHash);
  assert.notEqual(left.normalizedHash, right.normalizedHash);
});

test('declared current_node must exist in the preserved mapping', () => {
  const fixture = branchedConversation();
  fixture.current_node = 'missing-current-node';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(analysis.events.some((event) => event.eventCode === 'MISSING_CURRENT_NODE'), true);
});

test('duplicate source message IDs fail closed', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-b'].message.id = 'message-assistant-a';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(
    analysis.events.some((event) => event.eventCode === 'DUPLICATE_MESSAGE_ID' && event.severity === 'ERROR'),
    true
  );
});

test('duplicate child references fail closed', () => {
  const fixture = branchedConversation();
  fixture.mapping['user-1'].children = ['assistant-a', 'assistant-a', 'assistant-b'];
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(analysis.events.some((event) => event.eventCode === 'DUPLICATE_CHILD_REFERENCE'), true);
});

test('missing parent references fail the structural handshake', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-a'].parent = 'missing-parent';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(
    analysis.events.some((event) => event.eventCode === 'MISSING_PARENT_NODE'),
    true
  );
});

test('parent children links and child parent links must agree in both directions', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-b'].parent = null;
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(analysis.events.some((event) => event.eventCode === 'ASYMMETRIC_TOPOLOGY'), true);
});

test('parent cycles fail closed even when every referenced node exists', () => {
  const fixture = branchedConversation();
  fixture.current_node = 'assistant-a';
  fixture.mapping.root.parent = 'assistant-a';
  fixture.mapping.root.children = ['user-1'];
  fixture.mapping['user-1'].parent = 'root';
  fixture.mapping['user-1'].children = ['assistant-a', 'assistant-b'];
  fixture.mapping['assistant-a'].parent = 'user-1';
  fixture.mapping['assistant-a'].children = ['root'];
  fixture.mapping['assistant-b'].parent = 'user-1';
  fixture.mapping['assistant-b'].children = [];

  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(analysis.events.some((event) => event.eventCode === 'GRAPH_CYCLE_DETECTED'), true);
});

test('mapping key and embedded node id mismatch fails closed', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-a'].id = 'different-node-id';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  assert.equal(analysis.events.some((event) => event.eventCode === 'MAPPING_NODE_ID_MISMATCH'), true);
});

test('non-text multimodal content remains preserved and hashable', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-a'].message.content = {
    content_type: 'multimodal_text',
    parts: [
      { type: 'text', text: 'caption' },
      { type: 'image_asset_pointer', asset_pointer: 'file-service://file-multimodal' },
    ],
  };
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  const node = analysis.nodes.find((candidate) => candidate.sourceNodeId === 'assistant-a');
  assert.equal(node?.contentType, 'multimodal_text');
  assert.ok(node?.rawNode.message);
  assert.equal(
    analysis.attachments.some((attachment) => attachment.sourceReference === 'file-service://file-multimodal'),
    true
  );
});

test('message-null topology nodes remain valid source evidence', () => {
  const analysis = analyzeChatGptConversation(branchedConversation());
  assert.ok(analysis);
  const root = analysis.nodes.find((candidate) => candidate.sourceNodeId === 'root');
  assert.ok(root);
  assert.equal(root.sourceMessageId, null);
  assert.equal(root.normalizedMessageHash, null);
});

test('system and tool roles are preserved rather than filtered from source evidence', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-a'].message.author.role = 'system';
  fixture.mapping['assistant-b'].message.author.role = 'tool';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  assert.equal(analysis.nodes.find((node) => node.sourceNodeId === 'assistant-a')?.role, 'system');
  assert.equal(analysis.nodes.find((node) => node.sourceNodeId === 'assistant-b')?.role, 'tool');
});

test('unknown source fields emit non-degrading schema-drift telemetry while raw evidence remains intact', () => {
  const fixture = branchedConversation();
  fixture.future_conversation_field = { version: 99 };
  fixture.mapping['assistant-a'].future_node_field = true;
  fixture.mapping['assistant-a'].message.future_message_field = 'new-shape';
  fixture.mapping['assistant-a'].message.metadata = { future_metadata_field: 42 };

  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  const drift = analysis.events.filter((event) => event.severity === 'INFO');
  assert.equal(drift.some((event) => event.eventCode === 'SCHEMA_DRIFT_CONVERSATION_FIELDS'), true);
  assert.equal(drift.some((event) => event.eventCode === 'SCHEMA_DRIFT_NODE_FIELDS'), true);
  assert.equal(drift.some((event) => event.eventCode === 'SCHEMA_DRIFT_MESSAGE_FIELDS'), true);
  assert.equal(drift.some((event) => event.eventCode === 'SCHEMA_DRIFT_MESSAGE_METADATA_FIELDS'), true);
  assert.deepEqual(analysis.rawConversation.future_conversation_field, { version: 99 });
});

test('missing message roles are explicitly surfaced without losing raw evidence', () => {
  const fixture = branchedConversation();
  delete fixture.mapping['assistant-a'].message.author.role;
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'WARN');
  assert.equal(
    analysis.events.some((event) => event.eventCode === 'MISSING_MESSAGE_ROLE'),
    true
  );
  const node = analysis.nodes.find((candidate) => candidate.sourceNodeId === 'assistant-a');
  assert.ok(node?.rawNode.message);
});

test('invalid timestamp is preserved raw and fails normalization evidence', () => {
  const fixture = branchedConversation();
  fixture.mapping['assistant-a'].message.create_time = 'not-a-time';
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'FAIL');
  const node = analysis.nodes.find((candidate) => candidate.sourceNodeId === 'assistant-a');
  assert.equal(node?.sourceCreatedAt, 'not-a-time');
  assert.equal(node?.createdAt, null);
  assert.equal(
    analysis.events.some((event) => event.eventCode === 'INVALID_MESSAGE_TIMESTAMP'),
    true
  );
});

test('aggregate integrity status ignores INFO telemetry and propagates strongest failure state', () => {
  const infoFixture = branchedConversation();
  infoFixture.future_field = 'telemetry-only';
  const pass = analyzeChatGptConversation(infoFixture);
  assert.ok(pass);
  assert.equal(pass.status, 'PASS');

  const warnFixture = branchedConversation();
  delete warnFixture.mapping['assistant-a'].message.author.role;
  const warn = analyzeChatGptConversation(warnFixture);
  assert.ok(warn);

  const failFixture = branchedConversation();
  failFixture.mapping['assistant-a'].parent = 'missing-parent';
  const fail = analyzeChatGptConversation(failFixture);
  assert.ok(fail);

  assert.equal(deriveIntegrityStatus([pass]), 'PASS');
  assert.equal(deriveIntegrityStatus([pass, warn]), 'WARN');
  assert.equal(deriveIntegrityStatus([pass, warn, fail]), 'FAIL');
});
