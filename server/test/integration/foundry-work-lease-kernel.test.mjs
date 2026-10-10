import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', 'db'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci') {
  throw new Error('Refusing Foundry work lease integration outside isolated comind_ci');
}

const pool = new Pool({ connectionString: databaseUrl, max: 12 });

async function one(text, params = []) {
  const result = await pool.query(text, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

const suffix = randomUUID().replaceAll('-', '');
const org = await one(
  `INSERT INTO comind.cm_org (name, slug)
   VALUES ($1::text, $2::text)
   RETURNING org_id::text AS org_id`,
  [`Issue 85 Lease Org ${suffix}`, `issue85-lease-${suffix}`]
);
const actor = await one(
  `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
   VALUES ($1::uuid, 'person', $2::text, 'Issue 85 lease verifier')
   RETURNING actor_id::text AS actor_id`,
  [org.org_id, `issue85-verifier-${suffix}`]
);
const project = await one(
  `INSERT INTO comind.cm_project (org_id, title, slug, created_by)
   VALUES ($1::uuid, 'Issue 85 Foundry Lease', $2::text, $3::uuid)
   RETURNING project_id::text AS project_id`,
  [org.org_id, `issue85-lease-project-${suffix}`, actor.actor_id]
);

async function createTask(title, { status = 'todo', priority = 5, maxAttempts = 3, notBefore = null } = {}) {
  const task = await one(
    `INSERT INTO comind.cm_task (project_id, title, status, priority)
     VALUES ($1::uuid, $2::text, $3::text, $4::integer)
     RETURNING task_id::text AS task_id`,
    [project.project_id, title, status, priority]
  );
  await pool.query(
    `INSERT INTO comind.cm_foundry_work_lease (task_id, max_attempts, not_before)
     VALUES ($1::uuid, $2::integer, COALESCE($3::timestamptz, NOW()))`,
    [task.task_id, maxAttempts, notBefore]
  );
  return task.task_id;
}

test.after(async () => {
  await pool.end();
});

test('bounded claim selects one eligible task across independent connections', async () => {
  const taskId = await createTask('single contention target', { priority: 1 });
  const workers = Array.from({ length: 8 }, (_, index) => `issue85-worker-${index}-${suffix}`);

  const claims = await Promise.all(
    workers.map(async (worker) => {
      const client = new Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const result = await client.query(
          `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
           FROM comind.cm_foundry_claim_work($1::text, 30)`,
          [worker]
        );
        return { worker, rows: result.rows };
      } finally {
        await client.end();
      }
    })
  );

  const winners = claims.filter((claim) => claim.rows.length === 1);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].rows[0].task_id, taskId);
  assert.equal(Number(winners[0].rows[0].fencing_epoch), 1);

  const persisted = await one(
    `SELECT state, worker_instance_id, fencing_epoch, attempt_count
     FROM comind.cm_foundry_work_lease
     WHERE task_id = $1::uuid`,
    [taskId]
  );
  assert.equal(persisted.state, 'leased');
  assert.equal(persisted.worker_instance_id, winners[0].worker);
  assert.equal(Number(persisted.fencing_epoch), 1);
  assert.equal(Number(persisted.attempt_count), 1);
});

test('expired leases are reclaimed with epoch fencing and stale owners are rejected', async () => {
  const taskId = await createTask('reclaim target', { priority: 2 });
  const first = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work('issue85-owner-a', 30)`
  );
  assert.equal(first.task_id, taskId);

  await pool.query(
    `UPDATE comind.cm_foundry_work_lease
     SET lease_expires_at = clock_timestamp() - interval '1 second'
     WHERE task_id = $1::uuid`,
    [taskId]
  );

  const reclaimed = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work('issue85-owner-b', 30)`
  );
  assert.equal(reclaimed.task_id, taskId);
  assert.equal(Number(reclaimed.fencing_epoch), 2);

  const staleRenewal = await one(
    `SELECT comind.cm_foundry_renew_work(
       $1::uuid, 'issue85-owner-a', $2::uuid, $3::bigint, 30
     ) AS accepted`,
    [taskId, first.lease_token, first.fencing_epoch]
  );
  assert.equal(staleRenewal.accepted, false);

  const staleFinish = await one(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, 'issue85-owner-a', $2::uuid, $3::bigint, true
     ) AS accepted`,
    [taskId, first.lease_token, first.fencing_epoch]
  );
  assert.equal(staleFinish.accepted, false);

  const completed = await one(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, 'issue85-owner-b', $2::uuid, $3::bigint, true
     ) AS accepted`,
    [taskId, reclaimed.lease_token, reclaimed.fencing_epoch]
  );
  assert.equal(completed.accepted, true);
});

test('claim skips blocked, done, future, and exhausted work', async () => {
  await createTask('blocked target', { status: 'blocked', priority: 1 });
  await createTask('done target', { status: 'done', priority: 1 });
  await createTask('future target', {
    priority: 1,
    notBefore: new Date(Date.now() + 60_000).toISOString(),
  });
  const eligibleTask = await createTask('eligible target', { priority: 10, maxAttempts: 2 });

  const claim = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work('issue85-eligibility-worker', 30)`
  );
  assert.equal(claim.task_id, eligibleTask);

  const released = await one(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, 'issue85-eligibility-worker', $2::uuid, $3::bigint, false
     ) AS accepted`,
    [eligibleTask, claim.lease_token, claim.fencing_epoch]
  );
  assert.equal(released.accepted, true);

  const second = await one(
    `SELECT task_id::text AS task_id, lease_token::text AS lease_token, fencing_epoch
     FROM comind.cm_foundry_claim_work('issue85-exhaust-worker', 30)`
  );
  assert.equal(second.task_id, eligibleTask);

  const exhausted = await one(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, 'issue85-exhaust-worker', $2::uuid, $3::bigint, false
     ) AS accepted`,
    [eligibleTask, second.lease_token, second.fencing_epoch]
  );
  assert.equal(exhausted.accepted, true);

  const empty = await pool.query(
    `SELECT task_id::text AS task_id
     FROM comind.cm_foundry_claim_work('issue85-empty-worker', 30)`
  );
  assert.equal(empty.rows.length, 0);
});
