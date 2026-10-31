import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, Connection } from '@temporalio/client';
import {
  LIFECYCLE,
  adaptiveWakePlan,
} from '../lib/aed-adaptive-liveness.js';
import { projectLaneResult } from '../dist/aed/temporal/contracts.js';

const temporalAddress = process.env.TEMPORAL_ADDRESS?.trim() || '127.0.0.1:7233';
const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || 'default';
const taskQueue = process.env.AED003_TASK_QUEUE?.trim() || `comind-aed-003-${randomUUID()}`;
const artifactDir = path.resolve(process.env.AED003_ARTIFACT_DIR?.trim() || '../artifacts/aed-003-temporal');
const evidencePath = path.join(artifactDir, 'canonical-evidence.jsonl');
const proofPath = path.join(artifactDir, 'unattended-proof.json');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function timingPlan(samples, eventExpected) {
  const now = new Date().toISOString();
  const plan = adaptiveWakePlan({
    state: LIFECYCLE.RUNNING,
    now,
    stateEnteredAt: now,
    eventExpected,
    history: { job: samples },
  });
  assert.ok(plan.model, 'adaptive plan must include a measured timing model');
  return {
    source: plan.model.source,
    samples: plan.model.samples,
    p50: plan.model.p50,
    p90: plan.model.p90,
    p95: plan.model.p95,
    delayMs: plan.delayMs,
    band: plan.band,
  };
}

function laneInput(laneId, timingModel, clearAuthorized) {
  const nowMs = Date.now();
  return {
    laneId,
    lastProgressAt: new Date(nowMs - 60_000).toISOString(),
    lastObservedAt: new Date(nowMs - 250).toISOString(),
    stallThresholdMs: 1_000,
    wakeDelayMs: timingModel.delayMs,
    clearAuthorized,
    timingModel,
  };
}

async function readEvidence() {
  try {
    const text = await readFile(evidencePath, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function waitForEvidence(predicate, label, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const records = await readEvidence();
    if (records.some(predicate)) return records;
    await delay(50);
  }
  throw new Error(`did not observe ${label} within ${timeoutMs}ms`);
}

async function startWorker(workerInstanceId) {
  const child = spawn(process.execPath, ['dist/aed/temporal/worker.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TEMPORAL_ADDRESS: temporalAddress,
      TEMPORAL_NAMESPACE: namespace,
      AED003_TASK_QUEUE: taskQueue,
      AED003_WORKER_ID: workerInstanceId,
      AED003_EVIDENCE_PATH: evidencePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });

  await withTimeout(new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (String(chunk).includes('AED003_WORKER_READY')) {
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code, signal) => {
      reject(new Error(`worker ${workerInstanceId} exited before ready: code=${code} signal=${signal} stderr=${stderr}`));
    });
  }), 15_000, `worker ${workerInstanceId} startup`);

  return { child, workerInstanceId, stdout: () => stdout, stderr: () => stderr };
}

async function stopWorker(worker, signal = 'SIGTERM') {
  if (!worker || worker.child.exitCode !== null || worker.child.signalCode !== null) return;
  const exited = new Promise((resolve) => worker.child.once('exit', resolve));
  worker.child.kill(signal);
  await withTimeout(exited, 10_000, `worker ${worker.workerInstanceId} shutdown`);
}

async function main() {
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(evidencePath, '', { mode: 0o600 });

  const fastTiming = timingPlan([1_000, 1_100, 1_200, 1_300, 1_400], false);
  const slowTiming = timingPlan([5_000, 6_000, 7_000, 8_000, 9_000], true);
  assert.equal(fastTiming.source, 'job');
  assert.equal(slowTiming.source, 'job');
  assert.notEqual(fastTiming.delayMs, slowTiming.delayMs, 'adaptive timing must not collapse to a universal interval');
  assert.ok(fastTiming.delayMs < slowTiming.delayMs);

  const connection = await Connection.connect({ address: temporalAddress });
  const client = new Client({ connection, namespace });
  let workerA;
  let workerB;

  try {
    workerA = await startWorker('aed003-worker-a');

    const timerLaneId = `aed003-timer-${randomUUID()}`;
    const timerInput = laneInput(timerLaneId, fastTiming, true);
    const timerHandle = await client.workflow.start('aed003LaneController', {
      args: [timerInput],
      taskQueue,
      workflowId: timerLaneId,
    });

    await waitForEvidence(
      (record) => record.workerInstanceId === 'aed003-worker-a'
        && record.transition?.type === 'waiting'
        && record.transition?.detail?.includes(`${fastTiming.delayMs}ms`),
      'worker A waiting transition'
    );

    await stopWorker(workerA, 'SIGKILL');
    workerA = null;
    await delay(fastTiming.delayMs + 250);

    workerB = await startWorker('aed003-worker-b');
    const timerResult = await withTimeout(timerHandle.result(), 15_000, 'timer recovery workflow');
    assert.equal(timerResult.outcome, 'recovered');
    assert.equal(timerResult.wakeCause, 'durable_timer');
    assert.ok(Date.parse(timerResult.finalProgressAt) > Date.parse(timerResult.initialProgressAt));

    const timerHeartbeat = timerResult.transitions.find((entry) => entry.type === 'heartbeat_observed');
    assert.ok(timerHeartbeat);
    assert.equal(timerHeartbeat.semanticProgressAt, timerResult.initialProgressAt);
    assert.ok(timerResult.transitions.some((entry) => entry.type === 'diagnosed_stall'));
    assert.ok(timerResult.transitions.some((entry) => entry.type === 'clear_authorized'));
    assert.ok(timerResult.transitions.some((entry) => entry.type === 'recovery_mutation'));
    assert.ok(timerResult.transitions.some((entry) => entry.type === 'recovery_verified'));

    const timerEvidence = await readEvidence();
    assert.ok(timerEvidence.some((record) => record.workerInstanceId === 'aed003-worker-a'));
    assert.ok(timerEvidence.some((record) => record.workerInstanceId === 'aed003-worker-b'));

    const eventLaneId = `aed003-event-${randomUUID()}`;
    const eventInput = laneInput(eventLaneId, slowTiming, true);
    const eventHandle = await client.workflow.start('aed003LaneController', {
      args: [eventInput],
      taskQueue,
      workflowId: eventLaneId,
    });
    await waitForEvidence(
      (record) => record.transition?.type === 'waiting'
        && record.transition?.detail?.includes(`${slowTiming.delayMs}ms`),
      'event lane waiting transition'
    );
    const eventStartedAt = Date.now();
    await delay(200);
    await eventHandle.signal('aed003ExternalWake', {
      at: new Date().toISOString(),
      reason: 'synthetic external completion event',
    });
    const eventResult = await withTimeout(eventHandle.result(), 15_000, 'event wake workflow');
    const eventElapsedMs = Date.now() - eventStartedAt;
    assert.equal(eventResult.outcome, 'recovered');
    assert.equal(eventResult.wakeCause, 'event');
    assert.ok(eventElapsedMs < slowTiming.delayMs, 'event wake must beat the durable fallback timer');

    const deniedLaneId = `aed003-denied-${randomUUID()}`;
    const deniedInput = laneInput(deniedLaneId, slowTiming, false);
    const deniedHandle = await client.workflow.start('aed003LaneController', {
      args: [deniedInput],
      taskQueue,
      workflowId: deniedLaneId,
    });
    await waitForEvidence(
      (record) => record.transition?.type === 'waiting'
        && record.transition?.detail?.includes(`${slowTiming.delayMs}ms`),
      'denied lane waiting transition'
    );
    await deniedHandle.signal('aed003ExternalWake', {
      at: new Date().toISOString(),
      reason: 'synthetic unauthorized recovery probe',
    });
    const deniedResult = await withTimeout(deniedHandle.result(), 15_000, 'denied recovery workflow');
    assert.equal(deniedResult.outcome, 'escalated');
    assert.equal(deniedResult.escalation, 'CLEAR_REQUIRED');
    assert.equal(deniedResult.transitions.some((entry) => entry.type === 'recovery_mutation'), false);

    const evidence = await readEvidence();
    const deniedEvidence = evidence.filter((record) => record.transition?.detail?.includes('CLEAR_REQUIRED'));
    assert.ok(deniedEvidence.length >= 1);

    const proof = {
      schemaVersion: 1,
      proof: 'AED-003 Temporal durable unattended recovery proof',
      capturedAt: new Date().toISOString(),
      temporalAddress,
      namespace,
      taskQueue,
      productionChange: false,
      paidTemporalService: false,
      acceptanceExclusions: [
        'ChatGPT turn as liveness clock',
        'manual Recovery Sweep',
        'Dev Supervisor',
        'GitHub scheduled workflow timing',
      ],
      timingEvidence: {
        fast: fastTiming,
        slow: slowTiming,
      },
      workerRestart: {
        interruptedWorker: 'aed003-worker-a',
        resumedWorker: 'aed003-worker-b',
        interruptionSignal: 'SIGKILL',
        timerElapsedWhileWorkerAbsent: true,
      },
      timerWake: timerResult,
      eventWake: {
        elapsedMs: eventElapsedMs,
        result: eventResult,
      },
      unauthorizedRecovery: deniedResult,
      operatorProjections: {
        timer: projectLaneResult(timerResult),
        event: projectLaneResult(eventResult),
        denied: projectLaneResult(deniedResult),
      },
      canonicalEvidenceRecords: evidence.length,
    };

    await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      status: 'succeeded',
      proofPath,
      evidencePath,
      timerWake: timerResult.wakeCause,
      eventWake: eventResult.wakeCause,
      denied: deniedResult.escalation,
      evidenceRecords: evidence.length,
    })}\n`);
  } finally {
    await stopWorker(workerA).catch(() => undefined);
    await stopWorker(workerB).catch(() => undefined);
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
