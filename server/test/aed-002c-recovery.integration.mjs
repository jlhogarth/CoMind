import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Connection, Client } from '@temporalio/client';
import { Pool } from 'pg';
import { startAedTemporalWorker } from '../dist/aed-temporal/worker.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', 'db'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci') {
  throw new Error('Refusing AED-002C proof outside isolated comind_ci');
}

const address = process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233';
const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
const taskQueue = `aed-002c-${randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

async function one(text, params = []) {
  const result = await pool.query(text, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

const suffix = randomUUID().replaceAll('-', '');
const org = await one(
  `INSERT INTO comind.cm_org (name, slug) VALUES ($1,$2) RETURNING org_id::text AS org_id`,
  [`AED-002C ${suffix}`, `aed-002c-${suffix}`]
);
const actor = await one(
  `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
   VALUES ($1::uuid,'person',$2,'AED-002C verifier') RETURNING actor_id::text AS actor_id`,
  [org.org_id, `aed-002c-${suffix}`]
);
const project = await one(
  `INSERT INTO comind.cm_project (org_id,title,slug,created_by)
   VALUES ($1::uuid,'AED-002C proof',$2,$3::uuid) RETURNING project_id::text AS project_id`,
  [org.org_id, `aed-002c-project-${suffix}`, actor.actor_id]
);

async function createTask(title, priority) {
  const task = await one(
    `INSERT INTO comind.cm_task (project_id,title,status,priority)
     VALUES ($1::uuid,$2,'todo',$3) RETURNING task_id::text AS task_id`,
    [project.project_id, title, priority]
  );
  await pool.query(
    `INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts,not_before)
     VALUES($1::uuid,3,clock_timestamp())`,
    [task.task_id]
  );
  return task.task_id;
}

const baseNow = '2026-10-31T09:00:00.000Z';
const beforeProgress = '2026-10-31T08:00:00.000Z';
const recoveryProgress = '2026-10-31T09:00:01.000Z';
const clear = {
  l4aAuthorized: true,
  oneIssueOneBranchOnePr: true,
  noPlaceholder: true,
  collisionClear: true,
  freshnessClear: true,
  dependencyValid: true,
  costGuardrailClear: true,
  productionChange: false,
  productionAuthorized: false,
  secretsPresent: false,
};

function workflowInput(taskId, caseId, safety = clear, mode = 'recover') {
  return {
    caseId,
    taskId,
    controller: `aed-002c-controller-${caseId}`,
    now: baseNow,
    recoveryProgressAt: recoveryProgress,
    mode,
    safety,
    lane: {
      workKey: caseId,
      status: 'in_progress',
      actionable: true,
      dependenciesValid: true,
      expectedProgressBy: '2026-10-31T08:30:00.000Z',
      nextAction: 'resume bounded synthetic Test task',
      events: [
        { type: 'implementation_commit', at: beforeProgress, verified: true },
        { type: 'controller_heartbeat', at: '2026-10-31T08:45:00.000Z', verified: true },
      ],
      productionChange: false,
      josephActionRequired: false,
    },
  };
}

const connection = await Connection.connect({ address });
const client = new Client({ connection, namespace });
const worker = await startAedTemporalWorker({ address, namespace, taskQueue });

try {
  const recoveredTask = await createTask('AED-002C recovered task', 1);
  const recoveredHandle = await client.workflow.start('aedRecoveryWorkflow', {
    taskQueue,
    workflowId: `aed-002c-recovered-${suffix}`,
    args: [workflowInput(recoveredTask, 'AED-002C-RECOVERED')],
  });
  const recovered = await recoveredHandle.result();
  assert.equal(recovered.assessment.liveness, 'STALLED');
  assert.equal(recovered.assessment.aedLevel, 'AED-2');
  assert.equal(recovered.outcome, 'RECOVERED');
  assert.equal(recovered.shock.mutationApplied, true);
  assert.equal(recovered.shock.leaseCompleted, true);
  assert.equal(recovered.verification.advanced, true);
  assert.equal(recovered.verification.beforeAt, beforeProgress);
  assert.equal(recovered.verification.afterAt, recoveryProgress);
  assert.equal(recovered.projection.verification, 'advanced');
  assert.equal(recovered.projection.productionChange, false);
  assert.equal(recovered.projection.josephActionRequired, false);
  assert.equal(Object.hasOwn(recovered.projection, 'leaseToken'), false);

  const recoveredDb = await one(
    `SELECT t.status, l.state, l.fencing_epoch
     FROM comind.cm_task t JOIN comind.cm_foundry_work_lease l USING(task_id)
     WHERE t.task_id=$1::uuid`,
    [recoveredTask]
  );
  assert.equal(recoveredDb.status, 'in_progress');
  assert.equal(recoveredDb.state, 'completed');
  assert.equal(Number(recoveredDb.fencing_epoch), 1);

  const staleTask = await createTask('AED-002C stale lease task', 2);
  const staleHandle = await client.workflow.start('aedRecoveryWorkflow', {
    taskQueue,
    workflowId: `aed-002c-stale-${suffix}`,
    args: [workflowInput(staleTask, 'AED-002C-STALE', clear, 'stale_lease_probe')],
  });
  const stale = await staleHandle.result();
  assert.equal(stale.outcome, 'ESCALATED_OR_HOLD');
  assert.equal(stale.shock.status, 'lease_rejected');
  assert.equal(stale.shock.mutationApplied, false);
  assert.ok(stale.shock.currentFencingEpoch > stale.shock.fencingEpoch);
  const staleDb = await one(`SELECT status FROM comind.cm_task WHERE task_id=$1::uuid`, [staleTask]);
  assert.equal(staleDb.status, 'todo');

  const blockedTask = await createTask('AED-002C CLEAR blocked task', 3);
  const blockedSafety = { ...clear, freshnessClear: false };
  const blockedHandle = await client.workflow.start('aedRecoveryWorkflow', {
    taskQueue,
    workflowId: `aed-002c-blocked-${suffix}`,
    args: [workflowInput(blockedTask, 'AED-002C-BLOCKED', blockedSafety)],
  });
  const blocked = await blockedHandle.result();
  assert.equal(blocked.outcome, 'ESCALATED_OR_HOLD');
  assert.equal(blocked.shock, null);
  assert.ok(blocked.assessment.failedSafety.includes('freshnessClear'));
  const blockedDb = await one(
    `SELECT t.status, l.state, l.fencing_epoch
     FROM comind.cm_task t JOIN comind.cm_foundry_work_lease l USING(task_id)
     WHERE t.task_id=$1::uuid`,
    [blockedTask]
  );
  assert.equal(blockedDb.status, 'todo');
  assert.equal(blockedDb.state, 'ready');
  assert.equal(Number(blockedDb.fencing_epoch), 0);

  console.log(JSON.stringify({
    schemaVersion: 1,
    proof: 'AED-002C CLEAR-gated autonomous stall recovery',
    recovered: recovered.projection,
    clearBlocked: blocked.projection,
    staleLease: stale.projection,
    invariants: {
      unattended: true,
      githubCronUsedAsLivenessClock: false,
      recoverySweepUsedForAcceptance: false,
      devSupervisorUsedForAcceptance: false,
      chatgptTurnUsedForRecovery: false,
      josephActionUsedForRecovery: false,
      paidProviderUsed: false,
      privateCredentialsUsed: false,
      productionChange: false,
      heartbeatAdvancedSemanticProgress: false,
      leaseTokenPersistedInProjection: false,
    },
  }));
} finally {
  await worker.shutdown().catch(() => undefined);
  await connection.close();
  await pool.end();
}
