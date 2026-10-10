import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint, createSuccessorState, fingerprintState, restoreCheckpoint } from '../dist/continuity/checkpoint.js';

const now = '2026-10-10T12:00:00.000Z';
const parent = '11111111-1111-4111-8111-111111111111';
const authority = { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' };
const state = () => ({
  conversationId: 'conversation-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  parentCheckpointId: null,
  executionCursor: 'after-persist',
  authority,
  context: { objective: 'Resume authorized work', decisions: ['Use compact state'], references: ['issue-83'] },
  provenance: { sourceRefs: ['conversation:1'], evidenceRefs: ['issue:83'] },
  pending: [{
    operationId: 'op-1', idempotencyKey: 'key-1', status: 'uncertain',
    taskId: null, fencingEpoch: null, adapterOperationId: null,
  }],
});

test('checkpoint roundtrip is deterministic and preserves unresolved work without executing it', () => {
  const first = createCheckpoint(state(), now);
  const second = createCheckpoint(state(), now);
  assert.deepEqual(first, second);
  assert.equal(first.stateDigest, fingerprintState(state()));
  assert.deepEqual(restoreCheckpoint(first, authority, now), state());
});

test('checkpoint tampering fails closed', () => {
  const saved = createCheckpoint(state(), now);
  saved.state.context.objective = 'modified';
  assert.throws(() => restoreCheckpoint(saved, authority, now), /integrity/);
});

test('authority reduction fails closed', () => {
  const saved = createCheckpoint(state(), now);
  assert.throws(() => restoreCheckpoint(saved, { ...authority, capabilityIds: [] }, now), /Authority/);
});

test('embedded expiration fails closed', () => {
  const saved = createCheckpoint(state(), now, 1000);
  assert.throws(() => restoreCheckpoint(saved, authority, '2026-10-10T12:00:01.000Z'), /expired/);
});

test('duplicate idempotency keys fail closed', () => {
  const candidate = state();
  candidate.pending.push({
    operationId: 'op-2', idempotencyKey: 'key-1', status: 'pending',
    taskId: null, fencingEpoch: null, adapterOperationId: null,
  });
  assert.throws(() => createCheckpoint(candidate, now), /Duplicate/);
});

test('credential material is rejected', () => {
  const candidate = state();
  candidate.context.references.push('postgresql://user:password@db.example/test');
  assert.throws(() => createCheckpoint(candidate, now), /credential/);
});

test('full checkpoint size is bounded to 64 KiB', () => {
  const candidate = state();
  candidate.context.objective = 'x'.repeat(70000);
  assert.throws(() => createCheckpoint(candidate, now), /64 KiB/);
});

test('successor restoration is deterministic and explicit about lineage and cursor', () => {
  const restored = restoreCheckpoint(createCheckpoint(state(), now), authority, now);
  const first = createSuccessorState(restored, parent, 'execution-2', 'recovered-ready');
  const second = createSuccessorState(restored, parent, 'execution-2', 'recovered-ready');
  assert.deepEqual(first, second);
  assert.equal(first.parentCheckpointId, parent);
  assert.equal(first.executionId, 'execution-2');
  assert.equal(first.executionCursor, 'recovered-ready');
  assert.deepEqual(first.pending, restored.pending);
  assert.deepEqual(first.authority, restored.authority);
});
