import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpointScheduler } from '../dist/continuity/scheduler.js';
const state = (id) => ({
  conversationId: id, executionId: 'generation-1', parentCheckpointId: null,
  authority: { subjectId: 'system', capabilityIds: [], policyVersion: 'system-observation-v1' },
  context: { objective: 'Conversation turn persisted', decisions: [], references: [] },
  pending: []
});
test('scheduler defaults to disabled and never writes', async () => {
  let writes = 0;
  const scheduler = createCheckpointScheduler(async () => { writes++; return { rows: [] }; }, { enabled: false });
  assert.equal(scheduler.schedule(state('a')), false);
  await scheduler.drain();
  assert.equal(writes, 0);
});
test('scheduler is bounded and defers writes until after caller returns', async () => {
  const calls = [];
  const scheduler = createCheckpointScheduler(async (sql, params) => {
    calls.push({ sql, params }); return { rows: [{ checkpoint_id: '1' }] };
  }, { enabled: true, capacity: 1 });
  assert.equal(scheduler.schedule(state('a')), true);
  assert.equal(scheduler.schedule(state('b')), false);
  assert.equal(calls.length, 0);
  await scheduler.drain();
  assert.equal(calls.length, 1);
});
test('scheduler isolates write failures', async () => {
  const failures = [];
  const scheduler = createCheckpointScheduler(async () => { throw Error('db unavailable'); },
    { enabled: true, onFailure: reason => failures.push(reason) });
  scheduler.schedule(state('a'));
  await scheduler.drain();
  assert.deepEqual(failures, ['checkpoint_write_failed']);
});

test('scheduler coalesces repeated conversation snapshots', async () => {
  const calls = [];
  const scheduler = createCheckpointScheduler(async (sql, params) => {
    calls.push(params); return { rows: [{ checkpoint_id: '1' }] };
  }, { enabled: true });
  const first = state('a');
  const second = { ...state('a'), executionId: 'generation-2' };
  assert.equal(scheduler.schedule(first), true);
  assert.equal(scheduler.schedule(second), true);
  await scheduler.drain();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'generation-2');
});
test('scheduler refuses new work after close', async () => {
  const scheduler = createCheckpointScheduler(async () => ({ rows: [{ checkpoint_id: '1' }] }), { enabled: true });
  await scheduler.close();
  assert.equal(scheduler.schedule(state('a')), false);
});
