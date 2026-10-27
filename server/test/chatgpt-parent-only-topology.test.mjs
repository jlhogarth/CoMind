import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeChatGptConversation,
  CHATGPT_ARCHIVE_PARSER_VERSION,
} from '../dist/archive/chatgpt-export.js';

function message(id, role, createTime, text) {
  return {
    id,
    author: { role },
    create_time: createTime,
    update_time: createTime,
    content: { content_type: 'text', parts: [text] },
    status: 'finished_successfully',
    end_turn: true,
  };
}

function bidirectionalFixture() {
  return {
    id: 'parent-only-fixture',
    title: 'Topology representation fixture',
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
        message: message('message-assistant-b', 'assistant', 1791840003, 'branch b'),
      },
    },
  };
}

function parentOnlyFixture() {
  const fixture = structuredClone(bidirectionalFixture());
  for (const node of Object.values(fixture.mapping)) delete node.children;
  return fixture;
}

test('parser version changes when topology normalization semantics change', () => {
  assert.equal(CHATGPT_ARCHIVE_PARSER_VERSION, 'chatgpt-export-v0.4.0');
});

test('parent-only topology is normalized without changing raw source evidence', () => {
  const fixture = parentOnlyFixture();
  const analysis = analyzeChatGptConversation(fixture);
  assert.ok(analysis);
  assert.equal(analysis.status, 'PASS');
  assert.equal(Object.hasOwn(analysis.rawConversation.mapping.root, 'children'), false);
  assert.deepEqual(
    analysis.nodes.find((node) => node.sourceNodeId === 'root')?.childSourceNodeIds,
    ['user-1']
  );
  assert.deepEqual(
    analysis.nodes.find((node) => node.sourceNodeId === 'user-1')?.childSourceNodeIds,
    ['assistant-a', 'assistant-b']
  );
  const event = analysis.events.find((candidate) => candidate.eventCode === 'TOPOLOGY_CHILDREN_DERIVED_FROM_PARENT_LINKS');
  assert.ok(event);
  assert.equal(event.severity, 'INFO');
  assert.deepEqual(event.evidence, {
    nodesWithoutExplicitChildren: 4,
    derivedParentCount: 2,
    derivedEdgeCount: 3,
  });
});

test('parent-only and bidirectional encodings produce the same logical topology identity', () => {
  const explicit = analyzeChatGptConversation(bidirectionalFixture());
  const parentOnly = analyzeChatGptConversation(parentOnlyFixture());
  assert.ok(explicit && parentOnly);
  assert.equal(explicit.status, 'PASS');
  assert.equal(parentOnly.status, 'PASS');
  assert.equal(parentOnly.topologyHash, explicit.topologyHash);
  assert.equal(parentOnly.normalizedHash, explicit.normalizedHash);
});

test('mixed topology derives only missing children arrays and retains strict explicit checks', () => {
  const mixed = bidirectionalFixture();
  delete mixed.mapping['user-1'].children;
  const normalized = analyzeChatGptConversation(mixed);
  assert.ok(normalized);
  assert.equal(normalized.status, 'PASS');
  assert.deepEqual(
    normalized.nodes.find((node) => node.sourceNodeId === 'user-1')?.childSourceNodeIds,
    ['assistant-a', 'assistant-b']
  );

  const inconsistent = bidirectionalFixture();
  inconsistent.mapping['user-1'].children = ['assistant-a'];
  const failed = analyzeChatGptConversation(inconsistent);
  assert.ok(failed);
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.events.some((event) => event.eventCode === 'ASYMMETRIC_TOPOLOGY'), true);
});
