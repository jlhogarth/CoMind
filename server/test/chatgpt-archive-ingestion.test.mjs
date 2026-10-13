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

test('analyzer accounts for conversations, messages, timestamps, roles, branches, and attachments', () => {
  const analysis = analyzeChatGptConversation(branchedConversation());
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  assert.equal(analysis.sourceConversationId, 'conversation-1');
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

test('aggregate integrity status propagates the strongest failure state', () => {
  const pass = analyzeChatGptConversation(branchedConversation());
  assert.ok(pass);

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
