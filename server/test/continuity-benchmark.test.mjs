import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createCheckpointScheduler } from '../dist/continuity/scheduler.js';
const state = (id) => ({
  conversationId: id, executionId: 'exec-' + id, parentCheckpointId: null,
  authority: { subjectId: 'system', capabilityIds: [], policyVersion: 'system-observation-v1' },
  context: { objective: 'persisted turn', decisions: [], references: [] }, pending: []
});
test('scheduler measures enqueue and drain without a paid provider', async (t) => {
  const count = 1000;
  let writes = 0;
  const scheduler = createCheckpointScheduler(async () => {
    writes++;
    return { rows: [{ checkpoint_id: String(writes) }] };
  }, { enabled: true, capacity: count });
  const started = performance.now();
  for (let i = 0; i < count; i++) assert.equal(scheduler.schedule(state(String(i))), true);
  const enqueueMs = performance.now() - started;
  await scheduler.drain();
  const totalMs = performance.now() - started;
  assert.equal(writes, count);
  t.diagnostic(JSON.stringify({
    sample_count: count,
    enqueue_total_ms: Number(enqueueMs.toFixed(3)),
    enqueue_mean_ms: Number((enqueueMs / count).toFixed(6)),
    total_ms: Number(totalMs.toFixed(3)),
    writes,
    note: 'mock query benchmark; excludes network, PostgreSQL and provider latency'
  }));
});
