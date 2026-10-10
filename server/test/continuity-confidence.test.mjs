import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint } from '../dist/continuity/checkpoint.js';
import { evaluateRecovery } from '../dist/continuity/confidence.js';

const time = '2026-10-10T12:00:00.000Z';
const authority = { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' };
const state = () => ({
  conversationId: 'conversation-1', workflowId: 'workflow-1', executionId: 'execution-1',
  parentCheckpointId: null, executionCursor: 'saved', authority,
  context: { objective: 'Resume', decisions: [], references: [] },
  provenance: { sourceRefs: [], evidenceRefs: [] }, pending: [],
});

test('confidence READY for validated state without recorded side effects', () => {
  assert.equal(evaluateRecovery(createCheckpoint(state(), time), authority, time, true).status, 'READY');
});

test('confidence DEGRADED for recorded work and unavailable dependencies', () => {
  const candidate = state();
  candidate.pending.push({
    operationId: 'op-1', idempotencyKey: 'id-1', status: 'uncertain',
    taskId: null, fencingEpoch: null, adapterOperationId: null,
  });
  const result = evaluateRecovery(createCheckpoint(candidate, time), authority, time, false);
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['dependency_unavailable', 'operation_reconciliation_required']);
});

test('confidence never trusts checkpoint-local completed status as canonical outcome evidence', () => {
  const candidate = state();
  candidate.pending.push({
    operationId: 'op-1', idempotencyKey: 'id-1', status: 'completed',
    taskId: null, fencingEpoch: null, adapterOperationId: null,
  });
  const result = evaluateRecovery(createCheckpoint(candidate, time), authority, time, true);
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['operation_reconciliation_required']);
});

test('confidence BLOCKED for invalid authority', () => {
  const result = evaluateRecovery(createCheckpoint(state(), time), { ...authority, subjectId: 'other' }, time, true);
  assert.deepEqual(result, { status: 'BLOCKED', reasons: ['checkpoint_integrity_freshness_or_authority_invalid'] });
});
