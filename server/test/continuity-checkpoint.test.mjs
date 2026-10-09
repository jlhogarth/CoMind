import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint, restoreCheckpoint } from '../dist/continuity/checkpoint.js';

const state = () => ({
  conversationId: 'conversation-1', executionId: 'execution-1', parentCheckpointId: null,
  authority: { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' },
  context: { objective: 'Resume authorized work', decisions: ['Use compact state'], references: ['issue-83'] },
  pending: [{ operationId: 'op-1', idempotencyKey: 'key-1', status: 'uncertain' }]
});
const now = '2026-10-09T00:00:00.000Z';
test('roundtrip preserves pending uncertain work without executing it', () => {
  const saved = createCheckpoint(state(), now);
  assert.deepEqual(restoreCheckpoint(saved, state().authority, now), state());
});
test('tampering fails closed', () => {
  const saved = createCheckpoint(state(), now);
  saved.state.context.objective = 'modified';
  assert.throws(() => restoreCheckpoint(saved, state().authority, now), /integrity/);
});
test('authority reduction fails closed', () => {
  const saved = createCheckpoint(state(), now);
  assert.throws(() => restoreCheckpoint(saved, { ...state().authority, capabilityIds: [] }, now), /Authority/);
});
test('stale checkpoint fails closed', () => {
  const saved = createCheckpoint(state(), now);
  assert.throws(() => restoreCheckpoint(saved, state().authority, '2026-10-11T00:00:00.000Z'), /expired/);
});
test('duplicate idempotency keys fail closed', () => {
  const s = state(); s.pending.push({ operationId: 'op-2', idempotencyKey: 'key-1', status: 'pending' });
  assert.throws(() => createCheckpoint(s, now), /Duplicate/);
});
test('secret material rejected', () => {
  const s = state(); s.context.references.push('postgresql://user:password@db.example/test');
  assert.throws(() => createCheckpoint(s, now), /credential/);
});
