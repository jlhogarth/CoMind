import assert from 'node:assert/strict';
import test from 'node:test';

const { runParallelCollaboration } = await import('../dist/parallel-agent-collaboration.js');
const tasks = [
  { key: 'scout', predecessors: [] },
  { key: 'analyst', predecessors: [] },
  { key: 'reviewer', predecessors: ['scout', 'analyst'] },
].map((task, i) => ({
  ...task, profileId: `profile-${i}`, taskId: `task-${i}`,
  capabilityCode: 'test_read', targetKind: 'module_plan',
  targetRef: 'plan-1', projectId: 'project-1',
}));
function fixture({ fail = '', hold = false } = {}) {
  const pending = new Map();
  const started = [];
  const authorized = [];
  const dependencies = {
    async authorize(task, receipts) {
      authorized.push([task.key, receipts.map(r => r.key)]);
      return `decision-${task.key}`;
    },
    foundry: {
      async execute(request) {
        const key = request.idempotencyKey.split(':')[1];
        started.push(key);
        if (hold && key !== 'reviewer') await new Promise(resolve => pending.set(key, resolve));
        if (key === fail) throw new Error('bounded failure');
        return {
          terminalStatus: 'succeeded', executionContextId: `execution-${key}`,
          adapterOperationResultId: `operation-${key}`, executionOutcomeId: `outcome-${key}`,
          resultRef: `evidence-${key}`,
        };
      },
    },
    async verifyEvidence(_task, result) { return result.resultRef; },
  };
  return { dependencies, pending, started, authorized };
}
test('parallel roots and deterministic evidence-backed reviewer join', async () => {
  const f = fixture({ hold: true });
  const run = runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.started, ['scout', 'analyst']);
  assert.equal(f.started.includes('reviewer'), false);
  f.pending.get('analyst')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.started.includes('reviewer'), false);
  f.pending.get('scout')();
  const outcome = await run;
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.receipts.map(r => r.key), ['scout', 'analyst', 'reviewer']);
  assert.deepEqual(f.authorized[2], ['reviewer', ['scout', 'analyst']]);
});
test('partial failure drains in-flight specialist and blocks join', async () => {
  const f = fixture({ fail: 'scout', hold: true });
  const run = runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  await new Promise(resolve => setImmediate(resolve));
  f.pending.get('scout')();
  f.pending.get('analyst')();
  const outcome = await run;
  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(outcome.blocked, ['scout', 'reviewer']);
  assert.deepEqual(f.started, ['scout', 'analyst']);
});
test('cycle, duplicate identity and invalid concurrency fail before execution', async () => {
  const f = fixture();
  for (const [graph, limit] of [
    [[{ ...tasks[0], predecessors: ['reviewer'] }, ...tasks.slice(1)], 2],
    [[tasks[0], { ...tasks[1], profileId: tasks[0].profileId }, tasks[2]], 2],
    [tasks, 9],
  ]) {
    await assert.rejects(runParallelCollaboration(f.dependencies, graph, 'agcol002', limit), { code: 'invalid_graph' });
  }
  assert.deepEqual(f.started, []);
});
test('missing canonical evidence prevents reviewer authorization', async () => {
  const f = fixture();
  f.dependencies.verifyEvidence = async (task, result) => task.key === 'scout' ? 'wrong' : result.resultRef;
  const outcome = await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  assert.equal(outcome.status, 'blocked');
  assert.equal(f.started.includes('reviewer'), false);
});
