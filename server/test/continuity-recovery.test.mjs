import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint } from '../dist/continuity/checkpoint.js';
import { coordinateRecovery } from '../dist/continuity/recovery.js';

const now = '2026-10-10T12:00:00.000Z';
const authority = { subjectId: 'system', capabilityIds: [], policyVersion: 'system-observation-v1' };
const baseState = () => ({
  conversationId: 'conv', workflowId: 'workflow', executionId: 'exec', parentCheckpointId: null,
  executionCursor: 'saved', authority,
  context: { objective: 'recover', decisions: [], references: [] },
  provenance: { sourceRefs: [], evidenceRefs: [] }, pending: [],
});

function checkpointQuery(checkpoint, extras = {}) {
  return async (sql) => {
    if (sql.includes('FROM comind.cm_continuity_checkpoint')) {
      return { rows: checkpoint ? [{ checkpoint_id: '11111111-1111-4111-8111-111111111111', checkpoint }] : [] };
    }
    if (sql.includes("to_regclass('comind.cm_foundry_work_lease')")) {
      return { rows: [{ work_lease_table: 'comind.cm_foundry_work_lease', adapter_operation_table: 'comind.cm_foundry_adapter_operation', adapter_result_table: 'comind.cm_foundry_adapter_operation_result' }] };
    }
    if (sql.includes('FROM comind.cm_foundry_adapter_operation AS o')) return { rows: extras.adapter ?? [] };
    if (sql.includes('FROM comind.cm_foundry_work_lease')) return { rows: extras.lease ?? [] };
    throw new Error('Unexpected SQL: ' + sql);
  };
}

test('coordinator returns ABSENT without a checkpoint', async () => {
  assert.equal((await coordinateRecovery(checkpointQuery(null), 'conv', authority, now, true)).status, 'ABSENT');
});

test('coordinator permits verified read-only recovery without recorded side effects', async () => {
  const result = await coordinateRecovery(checkpointQuery(createCheckpoint(baseState(), now)), 'conv', authority, now, true);
  assert.equal(result.status, 'READY');
  assert.equal(result.state.executionId, 'exec');
});

test('coordinator blocks cross-conversation restoration', async () => {
  const result = await coordinateRecovery(checkpointQuery(createCheckpoint(baseState(), now)), 'other', authority, now, true);
  assert.equal(result.status, 'BLOCKED');
});

test('terminal canonical adapter result reconciles uncertain operation without replay', async () => {
  const candidate = baseState();
  candidate.pending = [{
    operationId: 'op', idempotencyKey: 'key', status: 'uncertain', taskId: null,
    fencingEpoch: null, adapterOperationId: '22222222-2222-4222-8222-222222222222',
  }];
  const result = await coordinateRecovery(
    checkpointQuery(createCheckpoint(candidate, now), {
      adapter: [{ adapter_operation_id: '22222222-2222-4222-8222-222222222222', terminal_status: 'succeeded' }],
    }),
    'conv', authority, now, true
  );
  assert.equal(result.status, 'READY');
  assert.equal(result.state.pending[0].status, 'completed');
});

test('checkpoint-local completed status still requires canonical outcome evidence', async () => {
  const candidate = baseState();
  candidate.pending = [{
    operationId: 'op', idempotencyKey: 'key', status: 'completed', taskId: null,
    fencingEpoch: null, adapterOperationId: null,
  }];
  const result = await coordinateRecovery(
    checkpointQuery(createCheckpoint(candidate, now), { adapter: [] }),
    'conv', authority, now, true
  );
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['adapter_outcome_unresolved']);
});

test('newer canonical work-lease fencing epoch keeps recovery degraded', async () => {
  const candidate = baseState();
  candidate.pending = [{
    operationId: 'op', idempotencyKey: 'key', status: 'uncertain',
    taskId: '33333333-3333-4333-8333-333333333333', fencingEpoch: 1, adapterOperationId: null,
  }];
  const result = await coordinateRecovery(
    checkpointQuery(createCheckpoint(candidate, now), {
      adapter: [], lease: [{ state: 'leased', fencing_epoch: 2, lease_expires_at: '2026-10-10T12:05:00.000Z' }],
    }),
    'conv', authority, now, true
  );
  assert.equal(result.status, 'DEGRADED');
  assert.deepEqual(result.reasons, ['work_lease_superseded']);
});
