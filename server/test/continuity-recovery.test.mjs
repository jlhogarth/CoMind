import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint } from '../dist/continuity/checkpoint.js';
import { coordinateRecovery } from '../dist/continuity/recovery.js';
const now = '2026-10-09T00:00:00.000Z';
const authority = { subjectId: 'system', capabilityIds: [], policyVersion: 'system-observation-v1' };
const state = {
  conversationId: 'conv', executionId: 'exec', parentCheckpointId: null,
  authority, context: { objective: 'recover', decisions: [], references: [] }, pending: []
};
const query = (checkpoint) => async () => ({ rows: checkpoint ? [{ checkpoint }] : [] });
test('coordinator returns ABSENT without a checkpoint', async () => {
  assert.equal((await coordinateRecovery(query(null), 'conv', authority, now, true)).status, 'ABSENT');
});
test('coordinator permits verified read-only recovery', async () => {
  const result = await coordinateRecovery(query(createCheckpoint(state, now)), 'conv', authority, now, true);
  assert.equal(result.status, 'READY');
  assert.equal(result.state.executionId, 'exec');
});
test('coordinator blocks cross-conversation restoration', async () => {
  assert.equal((await coordinateRecovery(query(createCheckpoint(state, now)), 'other', authority, now, true)).status, 'BLOCKED');
});
test('coordinator degrades unresolved work and never executes it', async () => {
  const s = structuredClone(state);
  s.pending = [{ operationId: 'op', idempotencyKey: 'key', status: 'uncertain' }];
  const result = await coordinateRecovery(query(createCheckpoint(s, now)), 'conv', authority, now, true);
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['unreconciled_operation']);
});
