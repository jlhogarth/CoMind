import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparableArchiveMessage,
  comparableLiveMessage,
  reconcileConversationEvidence,
} from '../dist/archive/chatgpt-live-reconcile.js';

function archiveMessage(id, role, content, createdAt = '2026-10-25T18:00:00.000Z') {
  return comparableArchiveMessage({
    sourceNodeId: `node-${id}`,
    sourceMessageId: id,
    role,
    createdAt,
    rawNode: {
      id: `node-${id}`,
      message: {
        id,
        author: { role },
        content: { content_type: 'text', parts: [content] },
      },
    },
  });
}

function archive(messages, overrides = {}) {
  return {
    importId: '11111111-1111-4111-8111-111111111111',
    sourceConversationId: 'native-chatgpt-conversation-1',
    title: 'CFR continuity discussion',
    createdAt: '2026-10-25T18:00:00.000Z',
    updatedAt: '2026-10-25T18:10:00.000Z',
    normalizedHash: 'a'.repeat(64),
    topologyHash: 'b'.repeat(64),
    messages: messages.map((message) => {
      assert.ok(message);
      return message;
    }),
    ...overrides,
  };
}

function live(convId, messages, overrides = {}) {
  return {
    convId,
    source: 'native_chatgpt_live',
    title: 'CFR continuity discussion',
    externalRef: null,
    metadata: {},
    createdAt: '2026-10-25T18:00:30.000Z',
    messages: messages.map(([role, content, createdAt]) => comparableLiveMessage({ role, content, createdAt })),
    interruptedPartials: [],
    ...overrides,
  };
}

const twoArchiveMessages = () => [
  archiveMessage('m1', 'user', 'Preserve every consequential turn.'),
  archiveMessage('m2', 'assistant', 'Capture first, interpret second.'),
];

const twoLiveMessages = () => [
  ['user', 'Preserve every consequential turn.', '2026-10-25T18:00:00.000Z'],
  ['assistant', 'Capture first, interpret second.', '2026-10-25T18:00:10.000Z'],
];

test('explicit native source identity produces an exact match', () => {
  const source = archive(twoArchiveMessages());
  const candidate = live('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', twoLiveMessages(), {
    externalRef: source.sourceConversationId,
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'exact_match');
  assert.equal(result.matchMethod, 'explicit_source_id');
  assert.equal(result.selectedConvId, candidate.convId);
  assert.equal(result.candidates[0]?.matchStrength, 'strong');
  assert.equal(result.candidates[0]?.selected, true);
});

test('two ordered matching messages can establish a unique fingerprint match without a source id', () => {
  const source = archive(twoArchiveMessages());
  const candidate = live('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', twoLiveMessages(), {
    source: 'live',
    title: 'different local title',
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'exact_match');
  assert.equal(result.matchMethod, 'ordered_message_fingerprint');
  assert.equal(result.selectedConvId, candidate.convId);
});

test('an interrupted live partial can be preserved while a later archive observation completes it', () => {
  const source = archive([
    archiveMessage('m1', 'user', 'Explain the recovery contract.'),
    archiveMessage('m2', 'assistant', 'The recovery contract preserves the partial answer and later evidence.'),
  ]);
  const candidate = live('cccccccc-cccc-4ccc-8ccc-cccccccccccc', [
    ['user', 'Explain the recovery contract.', '2026-10-25T18:00:00.000Z'],
  ], {
    externalRef: source.sourceConversationId,
    interruptedPartials: [{
      generationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      content: 'The recovery contract preserves the partial answer',
      observedAt: '2026-10-25T18:00:20.000Z',
    }],
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'compatible_extension');
  assert.equal(result.classificationCounts.later_archive_completion, 1);
  assert.equal(result.classificationCounts.live_only_interrupted_partial, 0);
  assert.equal(result.evidence.selectedInterruptedPartialEvidence.details[0].classification, 'later_archive_completion');
});

test('live-only interrupted text prevents an otherwise exact pair from being labeled exact', () => {
  const source = archive(twoArchiveMessages());
  const candidate = live('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', twoLiveMessages(), {
    externalRef: source.sourceConversationId,
    interruptedPartials: [{
      generationId: 'abababab-abab-4bab-8bab-abababababab',
      content: 'This unfinished assistant text exists only in the live CFR evidence.',
      observedAt: '2026-10-25T18:00:20.000Z',
    }],
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'compatible_extension');
  assert.equal(result.matchMethod, 'explicit_source_id');
  assert.equal(result.candidates[0]?.classification, 'extension_candidate');
  assert.equal(result.classificationCounts.live_only_interrupted_partial, 1);
  assert.equal(result.classificationCounts.later_archive_completion, 0);
  assert.equal(result.evidence.selectedInterruptedPartialEvidence.details[0].classification, 'live_only_interrupted_partial');
});

test('explicit identity plus differing ordered content is a conflicting observation', () => {
  const source = archive(twoArchiveMessages());
  const candidate = live('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', [
    ['user', 'Preserve every consequential turn.', '2026-10-25T18:00:00.000Z'],
    ['assistant', 'This text materially differs.', '2026-10-25T18:00:10.000Z'],
  ], {
    externalRef: source.sourceConversationId,
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'conflicting_observation');
  assert.equal(result.matchMethod, 'explicit_source_id');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.candidates[0]?.classification, 'conflict_candidate');
});

test('title and timestamp correlation alone remains ambiguous and cannot establish identity', () => {
  const source = archive([archiveMessage('m1', 'user', 'Archive-specific text')]);
  const candidate = live('ffffffff-ffff-4fff-8fff-ffffffffffff', [
    ['user', 'Different live text', '2026-10-25T18:00:00.000Z'],
  ], {
    source: 'live',
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'ambiguous_match');
  assert.equal(result.selectedConvId, null);
  assert.equal(result.matchMethod, 'weak_correlation');
  assert.equal(result.unresolved[0]?.reason, 'weak_correlation_cannot_establish_identity');
});

test('archive evidence with no credible live candidate stays unmatched', () => {
  const source = archive([archiveMessage('m1', 'user', 'Only in the archive')], {
    title: 'Archive-only conversation',
  });
  const candidate = live('99999999-9999-4999-8999-999999999999', [
    ['user', 'Unrelated live conversation', '2026-10-24T12:00:00.000Z'],
  ], {
    source: 'live',
    title: 'Unrelated title',
    createdAt: '2026-10-24T12:00:00.000Z',
  });
  const result = reconcileConversationEvidence(source, [candidate]);
  assert.equal(result.result, 'unmatched_archive');
  assert.equal(result.matchMethod, 'none');
  assert.equal(result.selectedConvId, null);
  assert.equal(result.candidates.length, 0);
});
