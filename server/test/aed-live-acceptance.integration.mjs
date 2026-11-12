import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Connection, Client } from '@temporalio/client';
import { Pool } from 'pg';
import { summarizeDurations } from '../lib/aed-adaptive-liveness.js';
import { startAedTemporalWorker } from '../dist/aed-temporal/worker.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL required');
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci')
  throw new Error('refusing non-isolated database');
const sourceRef = `AED-007-${randomUUID()}`;
const taskQueue = `aed-live-${randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const address = process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233';
const connection = await Connection.connect({ address });
const client = new Client({ connection, namespace: 'default' });
const worker = await startAedTemporalWorker({ address, taskQueue });
let workload;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(25);
  }
  throw new Error('live acceptance observation timeout');
}
async function one(sql, values) {
  const result = await pool.query(sql, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

try {
  const org = await one(`INSERT INTO comind.cm_org (name,slug) VALUES ($1,$2) RETURNING org_id`,
    [sourceRef, sourceRef.toLowerCase()]);
  const actor = await one(`INSERT INTO comind.cm_actor (org_id,kind,handle,display_name)
    VALUES ($1,'person',$2,'AED-007 test verifier') RETURNING actor_id`, [org.org_id, sourceRef]);
  const project = await one(`INSERT INTO comind.cm_project (org_id,title,slug,created_by)
    VALUES ($1,'AED-007 live test',$2,$3) RETURNING project_id`,
    [org.org_id, sourceRef.toLowerCase(), actor.actor_id]);
  const task = await one(`INSERT INTO comind.cm_task (project_id,title,status,priority)
    VALUES ($1,'AED-007 interrupted workload','todo',1) RETURNING task_id`, [project.project_id]);
  await pool.query(`INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts,not_before)
    VALUES ($1,3,clock_timestamp())`, [task.task_id]);
  const pmProject = await one(`INSERT INTO comind_pm.pm_projects (project_key,name,source_system,source_ref)
    VALUES ($1,'AED-007 isolated Test','github',$2) RETURNING id`, [sourceRef, sourceRef]);

  workload = spawn(process.execPath, ['test/aed-live-workload.mjs'], {
    cwd: process.cwd(), env: { ...process.env, AED_TEST_SOURCE_REF: sourceRef,
      AED_PM_PROJECT_ID: pmProject.id }, stdio: 'ignore',
  });
  const progress = await until(async () => {
    const result = await pool.query(`SELECT created_at FROM comind_pm.pm_events
      WHERE source_ref=$1 AND summary='AED-007 workload progress' ORDER BY created_at DESC LIMIT 6`, [sourceRef]);
    return result.rows.length >= 6 ? result.rows.reverse().map((r) => r.created_at) : null;
  });
  const durations = progress.slice(1).map((at, i) => at - progress[i]);
  const timing = summarizeDurations(durations);
  const observationIntervalMs = Math.max(10, Math.floor(timing.p50 * 0.4));
  const stallThresholdMs = Math.max(200, Math.ceil(timing.p95 * 3));
  const safety = { l4aAuthorized: true, oneIssueOneBranchOnePr: true, noPlaceholder: true,
    collisionClear: true, freshnessClear: true, dependencyValid: true, costGuardrailClear: true,
    productionChange: false, productionAuthorized: false, secretsPresent: false };
  const handle = await client.workflow.start('aedLiveAcceptanceWorkflow', {
    taskQueue, workflowId: `aed-live-${randomUUID()}`,
    args: [{ sourceRef, taskId: task.task_id, projectId: pmProject.id,
      controller: `aed-live-${sourceRef}`,
      observationIntervalMs, stallThresholdMs, safety }],
  });
  const healthy = await until(async () => {
    try {
      const status = await handle.query('liveAcceptanceStatus');
      return status.healthyObservations >= 2 ? status : null;
    } catch { return null; }
  });
  assert.equal(healthy.recoveryTriggered, false);
  assert.ok(healthy.lastProgressAt);
  const stopped = new Promise((resolve) => workload.once('exit', (code, signal) => resolve({ code, signal })));
  workload.kill('SIGKILL');
  const interrupted = await stopped;
  assert.equal(interrupted.signal, 'SIGKILL');
  const result = await handle.result();
  assert.equal(result.outcome, 'RECOVERED');
  assert.ok(result.healthyObservations >= 2);
  assert.ok(Date.parse(result.continuedAt) >= Date.parse(result.lastProgressAt));
  const state = await one(`SELECT t.status,l.state AS lease_state,l.fencing_epoch FROM comind.cm_task t
    JOIN comind.cm_foundry_work_lease l USING(task_id) WHERE t.task_id=$1`, [task.task_id]);
  assert.equal(state.status, 'in_progress');
  assert.equal(state.lease_state, 'completed');
  assert.equal(Number(state.fencing_epoch), 1);
  const continuation = await one(`SELECT count(*)::int AS count FROM comind_pm.pm_events
    WHERE source_ref=$1 AND summary='AED-007 continuation action'`, [sourceRef]);
  assert.equal(continuation.count, 1);
  console.log(`AED_EVENT ${JSON.stringify({ case: 'live_interruption', state: 'completed',
    outcome: result.outcome, workflow_id: handle.workflowId, fencing_epoch: 1,
    progress_at: result.continuedAt })}`);
  console.log(JSON.stringify({ sourceRef, workflowId: handle.workflowId, workloadPid: workload.pid,
    interruptionSignal: interrupted.signal, timing, observationIntervalMs, stallThresholdMs,
    healthyObservations: result.healthyObservations, recovered: true,
    continuationCount: continuation.count, fencingEpoch: 1 }));
} finally {
  if (workload && workload.exitCode === null) workload.kill('SIGKILL');
  await worker.shutdown().catch(() => undefined);
  await connection.close();
  await pool.end();
}
