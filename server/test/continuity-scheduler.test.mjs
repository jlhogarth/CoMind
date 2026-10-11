import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpointScheduler } from '../dist/continuity/scheduler.js';

const state = (id, executionId = 'generation-1') => ({
  conversationId: id, workflowId: 'conversation.assistant-response', executionId,
  parentCheckpointId: null, executionCursor: 'persisted',
  authority: { subjectId: 'system', capabilityIds: [], policyVersion: 'system-observation-v1' },
  context: { objective: 'Conversation turn persisted', decisions: [], references: [] },
  provenance: { sourceRefs: [], evidenceRefs: [] }, pending: [],
});

function repositoryMock(calls) {
  let sequence = 0;
  return async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT checkpoint_id::text')) return { rows: [] };
    if (sql.startsWith('INSERT INTO comind.cm_continuity_checkpoint')) {
      sequence++;
      return { rows: [{ checkpoint_id: `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}` }] };
    }
    throw new Error('Unexpected SQL');
  };
}

test('scheduler disabled mode never writes', async () => {
  const calls = [];
  const scheduler = createCheckpointScheduler(repositoryMock(calls), { enabled: false });
  assert.equal(scheduler.schedule(state('a')), false);
  await scheduler.drain();
  assert.equal(calls.length, 0);
});

test('scheduler is bounded and defers writes until after caller returns', async () => {
  const calls = [];
  const scheduler = createCheckpointScheduler(repositoryMock(calls), { enabled: true, capacity: 1 });
  assert.equal(scheduler.schedule(state('a')), true);
  assert.equal(scheduler.schedule(state('b')), false);
  assert.equal(calls.length, 0);
  await scheduler.drain();
  assert.equal(calls.length, 2);
});

test('scheduler isolates write failures', async () => {
  const failures = [];
  const scheduler = createCheckpointScheduler(async () => { throw Error('db unavailable'); }, {
    enabled: true, onFailure: reason => failures.push(reason),
  });
  scheduler.schedule(state('a'));
  await scheduler.drain();
  assert.deepEqual(failures, ['checkpoint_write_failed']);
});

test('scheduler coalesces repeated conversation snapshots', async () => {
  const calls = [];
  const parameters = [];
  const query = async (sql, params) => {
    calls.push(sql);
    parameters.push(params);
    if (sql.startsWith('SELECT checkpoint_id::text')) return { rows: [] };
    if (sql.startsWith('INSERT INTO comind.cm_continuity_checkpoint')) {
      return { rows: [{ checkpoint_id: '11111111-1111-4111-8111-111111111111' }] };
    }
    throw new Error('Unexpected SQL');
  };
  const scheduler = createCheckpointScheduler(query, { enabled: true });
  assert.equal(scheduler.schedule(state('a', 'generation-1')), true);
  assert.equal(scheduler.schedule(state('a', 'generation-2')), true);
  await scheduler.drain();
  assert.equal(calls.length, 2);
  assert.equal(parameters[1][2], 'generation-2');
});

test('scheduler drains accepted work during close and refuses later work', async () => {
  const calls = [];
  const scheduler = createCheckpointScheduler(repositoryMock(calls), { enabled: true });
  assert.equal(scheduler.schedule(state('a')), true);
  await scheduler.close();
  assert.equal(calls.length, 2);
  assert.equal(scheduler.schedule(state('b')), false);
});
