import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveConversation } from '../dist/analytics/conversation-derivation.js';

const ids = {
  conv: '11111111-1111-4111-8111-111111111111',
  user1: '22222222-2222-4222-8222-222222222221',
  assistant1: '22222222-2222-4222-8222-222222222222',
  user2: '22222222-2222-4222-8222-222222222223',
  checkpoint: '33333333-3333-4333-8333-333333333333',
};

function message(msgId, role, content, createdAt) {
  return { msgId, role, content, createdAt };
}

function baseInput(messages, overrides = {}) {
  return {
    convId: ids.conv,
    title: 'CFR analytics test',
    source: 'live',
    messages,
    captureEventCount: 8,
    checkpointCount: 0,
    maxCaptureSequence: 8,
    ...overrides,
  };
}

test('derives explicit intent, requirement, decision, action and reviewable promotion candidates', () => {
  const result = deriveConversation(baseInput([
    message(ids.user1, 'user', 'I want CFR-001G to preserve evidence. We must never auto-promote analytics. I approve this rule and we will implement it next.', '2026-10-25T20:00:00.000Z'),
    message(ids.assistant1, 'assistant', 'CFR-001G reads cm_message and writes derived evidence.', '2026-10-25T20:00:10.000Z'),
  ]));

  const kinds = new Set(result.derivations.map((item) => item.derivationKind));
  assert.equal(kinds.has('intent'), true);
  assert.equal(kinds.has('requirement'), true);
  assert.equal(kinds.has('decision_candidate'), true);
  assert.equal(kinds.has('commitment'), true);
  assert.equal(kinds.has('action_candidate'), true);
  assert.equal(kinds.has('entity'), true);

  const targetTypes = new Set(result.promotionCandidates.map((item) => item.targetType));
  assert.equal(targetTypes.has('rule'), true);
  assert.equal(targetTypes.has('decision'), true);
  assert.equal(targetTypes.has('task'), true);
  assert.equal(result.conversationAnalytics.stats.promotion_candidate_count, result.promotionCandidates.length);
});

test('preserves interrupted assistant text as analytical evidence without treating it as a canonical message', () => {
  const partialText = 'This interrupted assistant fragment must survive separately.';
  const result = deriveConversation(baseInput([
    message(ids.user1, 'user', 'Please explain the recovery state.', '2026-10-25T20:00:00.000Z'),
  ], {
    checkpointCount: 1,
    interruptedPartials: [{
      checkpointId: ids.checkpoint,
      generationId: '44444444-4444-4444-8444-444444444444',
      content: partialText,
      createdAt: '2026-10-25T20:00:05.000Z',
      captureSequenceStart: 3,
      captureSequenceEnd: 5,
    }],
  }));

  const partial = result.derivations.find((item) => item.sourceKind === 'live_partial');
  assert.ok(partial);
  assert.equal(partial.msgId, null);
  assert.equal(partial.checkpointId, ids.checkpoint);
  assert.equal(partial.valueText, partialText);
  assert.equal(partial.metadata.canonical_message, false);
  assert.equal(result.sourceStats.interruptedPartialCount, 1);
  assert.match(result.conversationAnalytics.summary, /Interrupted partials preserved: 1/);
});

test('marks a user question unresolved only when no later canonical assistant message exists', () => {
  const unresolved = deriveConversation(baseInput([
    message(ids.user1, 'user', 'What remains unresolved?', '2026-10-25T20:00:00.000Z'),
  ]));
  assert.equal(unresolved.derivations.some((item) => item.derivationKind === 'unresolved_thread'), true);

  const resolved = deriveConversation(baseInput([
    message(ids.user1, 'user', 'What remains unresolved?', '2026-10-25T20:00:00.000Z'),
    message(ids.assistant1, 'assistant', 'The remaining item is the analytics lane.', '2026-10-25T20:00:10.000Z'),
  ]));
  assert.equal(resolved.derivations.some((item) => item.derivationKind === 'unresolved_thread'), false);
});

test('same immutable source snapshot and policy produces identical run and derivation identities', () => {
  const input = baseInput([
    message(ids.user1, 'user', 'I want deterministic analytics. We should verify idempotency.', '2026-10-25T20:00:00.000Z'),
    message(ids.assistant1, 'assistant', 'We will verify it.', '2026-10-25T20:00:10.000Z'),
  ]);
  const first = deriveConversation(input);
  const second = deriveConversation(input);
  assert.equal(first.sourceSnapshotSha256, second.sourceSnapshotSha256);
  assert.equal(first.runIdentitySha256, second.runIdentitySha256);
  assert.deepEqual(first.derivations.map((item) => item.derivationSha256), second.derivations.map((item) => item.derivationSha256));
  assert.deepEqual(first.promotionCandidates.map((item) => item.candidateSha256), second.promotionCandidates.map((item) => item.candidateSha256));
});

test('a source change creates a different point-in-time run identity', () => {
  const initial = deriveConversation(baseInput([
    message(ids.user1, 'user', 'I want deterministic analytics.', '2026-10-25T20:00:00.000Z'),
  ]));
  const extended = deriveConversation(baseInput([
    message(ids.user1, 'user', 'I want deterministic analytics.', '2026-10-25T20:00:00.000Z'),
    message(ids.assistant1, 'assistant', 'The source snapshot now has another message.', '2026-10-25T20:00:10.000Z'),
  ]));
  assert.notEqual(initial.sourceSnapshotSha256, extended.sourceSnapshotSha256);
  assert.notEqual(initial.runIdentitySha256, extended.runIdentitySha256);
});

test('contrast language is retained as an ambiguous conflict signal and never auto-promoted as a conflict fact', () => {
  const result = deriveConversation(baseInput([
    message(ids.user1, 'user', 'We should preserve the evidence, but this may conflict with an older assumption.', '2026-10-25T20:00:00.000Z'),
  ]));
  const conflict = result.derivations.find((item) => item.derivationKind === 'conflict_signal');
  assert.ok(conflict);
  assert.equal(conflict.conflictState, 'ambiguous');
  assert.match(conflict.uncertainty ?? '', /not proof/i);
  assert.equal(result.promotionCandidates.some((item) => item.derivationSha256 === conflict.derivationSha256), false);
});

test('architecture relationships require an explicit relation cue and multiple identifiable entities', () => {
  const result = deriveConversation(baseInput([
    message(ids.user1, 'user', 'CFR-001G reads from CoMind and extends Conversation Continuity.', '2026-10-25T20:00:00.000Z'),
  ]));
  const relationship = result.derivations.find((item) => item.derivationKind === 'architecture_relationship');
  assert.ok(relationship);
  assert.equal(relationship.sourceKind, 'canonical_message');
  assert.equal(result.promotionCandidates.some((item) => item.targetType === 'architecture'), true);
});
