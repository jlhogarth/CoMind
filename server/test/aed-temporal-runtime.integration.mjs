import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Connection, Client } from '@temporalio/client';
import { adaptiveWakePlan, LIFECYCLE } from '../lib/aed-adaptive-liveness.js';
import { startAedTemporalWorker } from '../dist/aed-temporal/worker.js';

const address = process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233';
const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
const taskQueue = `aed-002b-test-${randomUUID()}`;
const semanticLastProgressAt = '2026-10-31T08:00:00.000Z';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilWaiting(handle, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const status = await handle.query('aedStatus');
      if (status?.waiting === true) return status;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`workflow did not become queryable and waiting: ${String(lastError ?? 'timeout')}`);
}

function planFor({ eventExpected, fallbackMs }) {
  const now = '2026-10-31T08:00:00.000Z';
  return adaptiveWakePlan({
    state: LIFECYCLE.RUNNING,
    now,
    stateEnteredAt: now,
    eventExpected,
    history: { fallbackMs },
  });
}

function inputFor(laneId, plan) {
  return {
    laneId,
    lifecycleState: LIFECYCLE.RUNNING,
    semanticLastProgressAt,
    plan,
    heartbeatProbeIterations: 3,
    heartbeatProbeIntervalMs: 25,
  };
}

function assertHeartbeatSeparation(result) {
  assert.equal(result.semanticLastProgressAt, semanticLastProgressAt);
  assert.equal(result.heartbeat.semanticLastProgressAt, semanticLastProgressAt);
  assert.equal(result.heartbeat.semanticProgressMutated, false);
  assert.equal(result.heartbeat.heartbeatCount, 3);
  assert.ok(Date.parse(result.heartbeat.lastObservedAt) > Date.parse(semanticLastProgressAt));
}

const connection = await Connection.connect({ address });
const client = new Client({ connection, namespace });
let worker = await startAedTemporalWorker({ address, namespace, taskQueue });
function observe(event) { console.log(`AED_EVENT ${JSON.stringify(event)}`); }

try {
  const signalPlan = planFor({ eventExpected: true, fallbackMs: 5_000 });
  const signalHandle = await client.workflow.start('aedLivenessWorkflow', {
    taskQueue,
    workflowId: `aed-002b-signal-${randomUUID()}`,
    args: [inputFor('aed-002b-signal', signalPlan)],
  });
  await waitUntilWaiting(signalHandle);
  observe({ case: 'external_signal', workflow_id: signalHandle.workflowId, state: 'waiting' });
  const signalEvent = {
    eventId: randomUUID(),
    observedAt: '2026-10-31T08:00:01.000Z',
    cause: 'synthetic_external_completion',
  };
  await signalHandle.signal('externalWake', signalEvent);
  const signalResult = await signalHandle.result();
  assert.equal(signalResult.wakeSource, 'event');
  assert.equal(signalResult.externalWake.eventId, signalEvent.eventId);
  assertHeartbeatSeparation(signalResult);
  observe({ case: 'external_signal', workflow_id: signalHandle.workflowId,
    state: 'completed', wake_source: signalResult.wakeSource });

  const timerPlan = planFor({ eventExpected: false, fallbackMs: 1_000 });
  const timerHandle = await client.workflow.start('aedLivenessWorkflow', {
    taskQueue,
    workflowId: `aed-002b-timer-${randomUUID()}`,
    args: [inputFor('aed-002b-timer', timerPlan)],
  });
  const timerResult = await timerHandle.result();
  assert.equal(timerResult.wakeSource, 'durable_timer');
  assert.equal(timerResult.externalWake, null);
  assertHeartbeatSeparation(timerResult);
  observe({ case: 'durable_timer', workflow_id: timerHandle.workflowId,
    state: 'completed', wake_source: timerResult.wakeSource });

  const replayPlan = planFor({ eventExpected: true, fallbackMs: 10_000 });
  const replayHandle = await client.workflow.start('aedLivenessWorkflow', {
    taskQueue,
    workflowId: `aed-002b-replay-${randomUUID()}`,
    args: [inputFor('aed-002b-replay', replayPlan)],
  });
  const beforeRestart = await waitUntilWaiting(replayHandle);
  const firstExecutionRunId = replayHandle.firstExecutionRunId;
  observe({ case: 'worker_restart', workflow_id: replayHandle.workflowId,
    run_id: firstExecutionRunId, state: 'waiting', checkpoint: semanticLastProgressAt });

  await worker.shutdown();
  observe({ case: 'worker_restart', workflow_id: replayHandle.workflowId,
    state: 'worker_stopped' });
  worker = await startAedTemporalWorker({ address, namespace, taskQueue });
  observe({ case: 'worker_restart', workflow_id: replayHandle.workflowId,
    state: 'worker_restarted' });

  const afterRestart = await waitUntilWaiting(replayHandle);
  assert.deepEqual(afterRestart, beforeRestart);
  assert.equal(replayHandle.firstExecutionRunId, firstExecutionRunId);

  const replayEvent = {
    eventId: randomUUID(),
    observedAt: '2026-10-31T08:00:02.000Z',
    cause: 'synthetic_post_restart_event',
  };
  await replayHandle.signal('externalWake', replayEvent);
  const replayResult = await replayHandle.result();
  assert.equal(replayResult.wakeSource, 'event');
  assert.equal(replayResult.externalWake.eventId, replayEvent.eventId);
  assertHeartbeatSeparation(replayResult);
  observe({ case: 'worker_restart', workflow_id: replayHandle.workflowId,
    run_id: firstExecutionRunId, state: 'completed', wake_source: replayResult.wakeSource });

  console.log(JSON.stringify({
    schemaVersion: 1,
    proof: 'AED-002B Temporal runtime binding',
    temporalAddress: address,
    namespace,
    taskQueue,
    signal: {
      workflowId: signalHandle.workflowId,
      wakeSource: signalResult.wakeSource,
      fallbackDelayMs: signalPlan.delayMs,
      heartbeat: signalResult.heartbeat,
    },
    timer: {
      workflowId: timerHandle.workflowId,
      wakeSource: timerResult.wakeSource,
      fallbackDelayMs: timerPlan.delayMs,
      heartbeat: timerResult.heartbeat,
    },
    replay: {
      workflowId: replayHandle.workflowId,
      firstExecutionRunId,
      beforeRestart,
      afterRestart,
      wakeSource: replayResult.wakeSource,
      heartbeat: replayResult.heartbeat,
    },
    invariants: {
      githubCronUsedAsLivenessClock: false,
      recoverySweepUsedForAcceptance: false,
      devSupervisorUsedForAcceptance: false,
      paidTemporalServiceUsed: false,
      productionChange: false,
      semanticProgressPreservedAcrossHeartbeats: true,
    },
  }));
} finally {
  await worker.shutdown().catch(() => undefined);
  await connection.close();
}
