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
  const finished = [];
  const observed = [];
  const dependencies = {
    async prepareRun() { return 'manifest-evidence'; },
    async loadCompleted() { return null; },
    async observe(event) { observed.push(event); },
    async claim(task) { return { taskId: task.taskId, leaseToken: `token-${task.key}`, fencingEpoch: 1 }; },
    async finish(task, claim, completed) { finished.push([task.key, claim.leaseToken, completed]); return true; },
    async renew() { return true; },
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
  return { dependencies, pending, started, authorized, finished, observed };
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
  assert.deepEqual(f.finished.map(x => x[2]), [true, true, true]);
  assert.deepEqual(f.observed.filter(x => x.phase === 'completed').map(x => x.key), ['analyst', 'scout', 'reviewer']);
  assert.equal('leaseToken' in outcome.receipts[0], false);
  assert.deepEqual(outcome.blockers, []);
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
  assert.deepEqual(outcome.blockers, [{ key: 'scout', taskId: 'task-0', code: 'specialist_failed', reconciliationRequired: false }]);
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

test('fenced claim mismatch blocks execution and releases the claim', async () => {
  const f = fixture();
  f.dependencies.claim = async task => ({ taskId: 'another-task', leaseToken: 'token', fencingEpoch: 1 });
  const outcome = await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(f.started, []);
  assert.deepEqual(f.finished.map(x => x[2]), [false, false]);
});
test('replayed handoff is refused by Foundry idempotency before reviewer', async () => {
  const f = fixture();
  const seen = new Set();
  const execute = f.dependencies.foundry.execute;
  f.dependencies.foundry.execute = async request => {
    if (seen.has(request.idempotencyKey)) throw new Error('duplicate_idempotency');
    seen.add(request.idempotencyKey);
    return execute(request);
  };
  assert.equal((await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2)).status, 'completed');
  const replay = await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  assert.equal(replay.status, 'blocked');
  assert.equal(replay.receipts.length, 0);
  assert.equal(seen.size, 3);
  assert.deepEqual(replay.blockers.map(b => b.code), ['specialist_failed', 'specialist_failed']);
});

test('human stop prevents further claims and reports pending work', async () => {
  const f = fixture({ hold: true });
  const controller = new AbortController();
  f.dependencies.signal = controller.signal;
  const run = runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  f.pending.get('scout')();
  f.pending.get('analyst')();
  const outcome = await run;
  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(f.started, ['scout', 'analyst']);
  assert.deepEqual(outcome.blockers.map(b => b.code), ['human_stop', 'human_stop', 'human_stop']);
  assert.equal(outcome.blockers.filter(b => b.reconciliationRequired).length, 2);
});

test('observation failure blocks new work and exposes recovery need', async () => {
  const f = fixture();
  f.dependencies.observe = async event => { if (event.phase === 'completed') throw new Error('RunBook unavailable'); };
  const outcome = await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 1);
  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(f.started, ['scout']);
  assert.deepEqual(outcome.blockers.map(b => b.code), ['observation_failed']);
  assert.equal(outcome.blockers.every(b => b.reconciliationRequired), true);
});

test('lost fenced renewal blocks the reviewer and requires reconciliation', async () => {
  const f = fixture({ hold: true });
  f.dependencies.renewalIntervalMs = 10;
  f.dependencies.renew = async task => task.key !== 'scout';
  const run = runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  await new Promise(resolve => setTimeout(resolve, 25));
  f.pending.get('scout')();
  f.pending.get('analyst')();
  const outcome = await run;
  assert.equal(outcome.status, 'blocked');
  assert.equal(f.started.includes('reviewer'), false);
  assert.equal(outcome.blockers.find(b => b.key === 'scout')?.code, 'lease_lost');
  assert.equal(outcome.blockers.find(b => b.key === 'scout')?.reconciliationRequired, true);
});

test('restart reuses verified terminal receipts and dispatches only the missing reviewer', async () => {
  const first = fixture();
  const accepted = await runParallelCollaboration(first.dependencies, tasks, 'agcol002', 2);
  const f = fixture();
  f.dependencies.loadCompleted = async (_runKey, task) => accepted.receipts.find(r => r.key === task.key && task.key !== 'reviewer') ?? null;
  const resumed = await runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2);
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(f.started, ['reviewer']);
  assert.deepEqual(resumed.receipts.map(r => r.key), ['scout', 'analyst', 'reviewer']);
  assert.equal(resumed.manifestEvidenceRef, 'manifest-evidence');
});

test('invalid recovered receipt stops before any new claim', async () => {
  const f = fixture();
  f.dependencies.loadCompleted = async (_runKey, task) => task.key === 'scout'
    ? { key: 'scout', taskId: task.taskId, evidenceRef: 'fake', predecessors: [], fencingEpoch: 1 }
    : null;
  await assert.rejects(runParallelCollaboration(f.dependencies, tasks, 'agcol002', 2), { code: 'recovery_mismatch' });
  assert.deepEqual(f.started, []);
});
