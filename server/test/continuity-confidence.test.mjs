import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint } from '../dist/continuity/checkpoint.js';
import { evaluateRecovery } from '../dist/continuity/confidence.js';
const time = '2026-10-09T00:00:00.000Z';
const authority = { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' };
const state = () => ({
  conversationId: 'conversation-1', executionId: 'execution-1', parentCheckpointId: null,
  authority, context: { objective: 'Resume', decisions: [], references: [] }, pending: []
});
test('confidence READY for validated state without unresolved work', () => {
  assert.equal(evaluateRecovery(createCheckpoint(state(), time), authority, time, true).status, 'READY');
});
test('confidence DEGRADED for uncertain operations and unavailable dependencies', () => {
  const s = state(); s.pending.push({ operationId: 'op-1', idempotencyKey: 'id-1', status: 'uncertain' });
  const result = evaluateRecovery(createCheckpoint(s, time), authority, time, false);
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['dependency_unavailable', 'unreconciled_operation']);
});
test('confidence BLOCKED for invalid authority', () => {
  const result = evaluateRecovery(createCheckpoint(state(), time), { ...authority, subjectId: 'other' }, time, true);
  assert.deepEqual(result, { status: 'BLOCKED', reasons: ['checkpoint_integrity_freshness_or_authority_invalid'] });
});
