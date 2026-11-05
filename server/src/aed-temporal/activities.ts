import { heartbeat } from '@temporalio/activity';
import { Pool, type PoolClient } from 'pg';
import type { AedHeartbeatProbeInput, AedHeartbeatProbeResult } from './contracts.js';
import type {
  AedClearInput,
  AedFencedRecoveryResult,
  AedProgressVerification,
  AedRecoveryAssessment,
  AedRecoveryEvent,
  AedRecoveryLane,
  AedRecoveryMode,
} from './recovery-contracts.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function heartbeatProbe(input: AedHeartbeatProbeInput): Promise<AedHeartbeatProbeResult> {
  const iterations = Math.max(1, Math.min(20, Math.trunc(input.iterations)));
  const intervalMs = Math.max(0, Math.min(5_000, Math.trunc(input.intervalMs)));
  let lastObservedAt = new Date().toISOString();

  for (let sequence = 1; sequence <= iterations; sequence += 1) {
    lastObservedAt = new Date().toISOString();
    heartbeat({
      laneId: input.laneId,
      sequence,
      lastObservedAt,
      semanticLastProgressAt: input.semanticLastProgressAt,
    });
    if (sequence < iterations && intervalMs > 0) await sleep(intervalMs);
  }

  return {
    heartbeatCount: iterations,
    semanticLastProgressAt: input.semanticLastProgressAt,
    lastObservedAt,
    semanticProgressMutated: false,
  };
}

type SemanticRecoveryModule = {
  planRecovery: (
    item: AedRecoveryLane,
    safety: AedClearInput,
    controller: string,
    now: Date
  ) => Record<string, unknown>;
  verifySemanticProgress: (
    before: { events: AedRecoveryEvent[] },
    after: { events: AedRecoveryEvent[] }
  ) => AedProgressVerification;
};

async function semanticRecoveryModule(): Promise<SemanticRecoveryModule> {
  const moduleUrl = new URL('../../lib/l4a-semantic-progress.js', import.meta.url).href;
  return await import(moduleUrl) as SemanticRecoveryModule;
}

export async function assessRecovery(input: {
  lane: AedRecoveryLane;
  safety: AedClearInput;
  controller: string;
  now: string;
}): Promise<AedRecoveryAssessment> {
  const semantics = await semanticRecoveryModule();
  const raw = semantics.planRecovery(input.lane, input.safety, input.controller, new Date(input.now)) as {
    action?: AedRecoveryAssessment['action'];
    reason?: string;
    failedSafety?: string[];
    nextAction?: string | null;
    projection?: {
      liveness?: string | null;
      aedLevel?: string;
      reason?: string;
      lastProgressAt?: string | null;
    };
  };
  return {
    action: raw.action ?? 'NO_DISPATCH',
    reason: raw.reason ?? null,
    failedSafety: raw.failedSafety ?? [],
    liveness: raw.projection?.liveness ?? null,
    aedLevel: raw.projection?.aedLevel ?? 'AED-0',
    diagnosis: raw.projection?.reason ?? raw.reason ?? 'recovery assessment unavailable',
    lastProgressAt: raw.projection?.lastProgressAt ?? null,
    nextAction: raw.nextAction ?? input.lane.nextAction ?? null,
  };
}

function isolatedDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required for AED recovery activity');
  const parsed = new URL(value);
  const allowedHosts = new Set(['localhost', '127.0.0.1', 'db']);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !allowedHosts.has(parsed.hostname)
      || parsed.pathname !== '/comind_ci') {
    throw new Error('Refusing AED recovery activity outside isolated comind_ci');
  }
  return value;
}

export async function observeLiveTestProgress(input: { sourceRef: string }): Promise<string | null> {
  const pool = new Pool({ connectionString: isolatedDatabaseUrl(), max: 1 });
  try {
    const result = await pool.query<{ progress_at: Date | null }>(
      `SELECT max(occurred_at) AS progress_at FROM comind_pm.pm_events
       WHERE source_ref=$1 AND event_type='action' AND summary='AED-007 workload progress'`,
      [input.sourceRef]
    );
    return result.rows[0]?.progress_at?.toISOString() ?? null;
  } finally {
    await pool.end();
  }
}

export async function continueLiveTestWorkload(input: { sourceRef: string; taskId: string }): Promise<string> {
  const pool = new Pool({ connectionString: isolatedDatabaseUrl(), max: 1 });
  try {
    const task = await pool.query<{ status: string }>(
      `SELECT status FROM comind.cm_task WHERE task_id=$1::uuid`, [input.taskId]
    );
    if (task.rows[0]?.status !== 'in_progress') throw new Error('recovery task state not verified');
    const result = await pool.query<{ occurred_at: Date }>(
      `INSERT INTO comind_pm.pm_events (event_type,actor,actor_type,source_system,source_ref,summary,consequential)
       VALUES ('action','aed-007-controller','system','github',$1,'AED-007 continuation action',false)
       RETURNING occurred_at`, [input.sourceRef]
    );
    return result.rows[0].occurred_at.toISOString();
  } finally {
    await pool.end();
  }
}

type LeaseClaim = {
  task_id: string;
  lease_token: string;
  fencing_epoch: number | string;
  lease_expires_at: string | Date;
};

async function claimWork(pool: Pool, workerInstanceId: string): Promise<LeaseClaim | null> {
  const result = await pool.query<LeaseClaim>(
    `SELECT task_id::text, lease_token::text, fencing_epoch, lease_expires_at
     FROM comind.cm_foundry_claim_work($1::text, 60)`,
    [workerInstanceId]
  );
  return result.rows[0] ?? null;
}

async function applyFencedTaskMutation(
  client: PoolClient,
  taskId: string,
  workerInstanceId: string,
  leaseToken: string,
  fencingEpoch: number
): Promise<boolean> {
  await client.query('BEGIN');
  try {
    const lease = await client.query<{
      state: string;
      worker_instance_id: string | null;
      lease_token: string | null;
      fencing_epoch: number | string;
      unexpired: boolean;
    }>(
      `SELECT state, worker_instance_id, lease_token::text, fencing_epoch,
              lease_expires_at > clock_timestamp() AS unexpired
       FROM comind.cm_foundry_work_lease
       WHERE task_id=$1::uuid
       FOR UPDATE`,
      [taskId]
    );
    const row = lease.rows[0];
    const valid = row?.state === 'leased'
      && row.worker_instance_id === workerInstanceId
      && row.lease_token === leaseToken
      && Number(row.fencing_epoch) === fencingEpoch
      && row.unexpired === true;
    if (!valid) {
      await client.query('ROLLBACK');
      return false;
    }
    const mutation = await client.query(
      `UPDATE comind.cm_task
       SET status='in_progress', updated_at=clock_timestamp()
       WHERE task_id=$1::uuid AND status='todo'`,
      [taskId]
    );
    if (mutation.rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function finishWork(
  pool: Pool,
  taskId: string,
  workerInstanceId: string,
  leaseToken: string,
  fencingEpoch: number,
  complete: boolean
): Promise<boolean> {
  const result = await pool.query<{ accepted: boolean }>(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, $2::text, $3::uuid, $4::bigint, $5::boolean
     ) AS accepted`,
    [taskId, workerInstanceId, leaseToken, fencingEpoch, complete]
  );
  return result.rows[0]?.accepted === true;
}

export async function executeFencedRecovery(input: {
  taskId: string;
  workerInstanceId: string;
  progressAt: string;
  mode: AedRecoveryMode;
}): Promise<AedFencedRecoveryResult> {
  const pool = new Pool({ connectionString: isolatedDatabaseUrl(), max: 2 });
  try {
    const first = await claimWork(pool, input.workerInstanceId);
    if (!first) {
      return {
        status: 'claim_unavailable',
        reason: 'canonical Foundry claim returned no eligible work',
        taskId: input.taskId,
        workerInstanceId: input.workerInstanceId,
        fencingEpoch: null,
        currentFencingEpoch: null,
        mutationApplied: false,
        leaseCompleted: false,
        progressEvent: null,
      };
    }
    const firstEpoch = Number(first.fencing_epoch);
    if (first.task_id !== input.taskId) {
      await finishWork(pool, first.task_id, input.workerInstanceId, first.lease_token, firstEpoch, false);
      return {
        status: 'task_mismatch',
        reason: 'canonical Foundry claim selected a different task',
        taskId: input.taskId,
        workerInstanceId: input.workerInstanceId,
        fencingEpoch: firstEpoch,
        currentFencingEpoch: firstEpoch,
        mutationApplied: false,
        leaseCompleted: false,
        progressEvent: null,
      };
    }

    if (input.mode === 'stale_lease_probe') {
      await pool.query(
        `UPDATE comind.cm_foundry_work_lease
         SET lease_expires_at=clock_timestamp() - interval '1 second'
         WHERE task_id=$1::uuid`,
        [input.taskId]
      );
      const replacementWorker = `${input.workerInstanceId}-replacement`;
      const replacement = await claimWork(pool, replacementWorker);
      if (!replacement || replacement.task_id !== input.taskId) {
        throw new Error('stale lease probe could not reclaim expected task');
      }
      const replacementEpoch = Number(replacement.fencing_epoch);
      const client = await pool.connect();
      let mutationApplied = false;
      try {
        mutationApplied = await applyFencedTaskMutation(
          client,
          input.taskId,
          input.workerInstanceId,
          first.lease_token,
          firstEpoch
        );
      } finally {
        client.release();
      }
      await finishWork(
        pool,
        input.taskId,
        replacementWorker,
        replacement.lease_token,
        replacementEpoch,
        false
      );
      return {
        status: 'lease_rejected',
        reason: 'stale worker lease failed canonical fencing verification',
        taskId: input.taskId,
        workerInstanceId: input.workerInstanceId,
        fencingEpoch: firstEpoch,
        currentFencingEpoch: replacementEpoch,
        mutationApplied,
        leaseCompleted: false,
        progressEvent: null,
      };
    }

    const client = await pool.connect();
    let mutationApplied = false;
    try {
      mutationApplied = await applyFencedTaskMutation(
        client,
        input.taskId,
        input.workerInstanceId,
        first.lease_token,
        firstEpoch
      );
    } finally {
      client.release();
    }
    if (!mutationApplied) {
      await finishWork(pool, input.taskId, input.workerInstanceId, first.lease_token, firstEpoch, false);
      return {
        status: 'mutation_rejected',
        reason: 'canonical lease verification or task-state mutation rejected',
        taskId: input.taskId,
        workerInstanceId: input.workerInstanceId,
        fencingEpoch: firstEpoch,
        currentFencingEpoch: firstEpoch,
        mutationApplied: false,
        leaseCompleted: false,
        progressEvent: null,
      };
    }

    const leaseCompleted = await finishWork(
      pool,
      input.taskId,
      input.workerInstanceId,
      first.lease_token,
      firstEpoch,
      true
    );
    const progressEvent: AedRecoveryEvent = {
      type: 'authorized_mutation_verified',
      at: input.progressAt,
      verified: true,
    };
    return {
      status: leaseCompleted ? 'recovered' : 'mutation_rejected',
      reason: leaseCompleted
        ? 'canonical fenced recovery mutation completed'
        : 'mutation succeeded but canonical lease completion was rejected',
      taskId: input.taskId,
      workerInstanceId: input.workerInstanceId,
      fencingEpoch: firstEpoch,
      currentFencingEpoch: firstEpoch,
      mutationApplied: true,
      leaseCompleted,
      progressEvent,
    };
  } finally {
    await pool.end();
  }
}

export async function verifyRecoveryProgress(input: {
  before: AedRecoveryLane;
  progressEvent: AedRecoveryEvent;
}): Promise<AedProgressVerification> {
  const semantics = await semanticRecoveryModule();
  return semantics.verifySemanticProgress(
    { events: input.before.events },
    { events: [...input.before.events, input.progressEvent] }
  );
}
