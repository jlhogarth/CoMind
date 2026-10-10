import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const enabled = process.env.ACP_ISOLATED_DB_TEST === '1';

test('ACP reads canonical work-lease fencing and never writes during recovery', { skip: !enabled }, async () => {
  const { query, closePool } = await import('../dist/db.js');
  const { saveCheckpoint } = await import('../dist/continuity/repository.js');
  const { coordinateRecovery } = await import('../dist/continuity/recovery.js');
  const authority = { subjectId: 'agent-lease-test', capabilityIds: ['read'], policyVersion: 'p1' };
  try {
    const task = await query(
      `INSERT INTO comind.cm_task(project_id,title,status,priority)
       VALUES ($1::uuid,$2,'todo',1) RETURNING task_id::text`,
      ['33333333-3333-4333-8333-333333333333', 'ACP lease reconciliation ' + randomUUID()]
    );
    const taskId = task.rows[0].task_id;
    await query('INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts) VALUES($1::uuid,3)', [taskId]);
    const claimed = await query("SELECT * FROM comind.cm_foundry_claim_work('acp-worker-a',30)");
    assert.equal(claimed.rows[0].task_id, taskId);
    const firstEpoch = Number(claimed.rows[0].fencing_epoch);

    const conversationId = 'acp-foundry-' + randomUUID();
    const now = new Date().toISOString();
    const state = {
      conversationId, workflowId: 'foundry.recovery', executionId: 'exec-1', parentCheckpointId: null,
      executionCursor: 'operation-uncertain', authority,
      context: { objective: 'Recover without replay', decisions: [], references: [] },
      provenance: { sourceRefs: ['foundry-work-lease'], evidenceRefs: [] },
      pending: [{
        operationId: 'op-1', idempotencyKey: 'acp-idem-' + randomUUID(), status: 'uncertain',
        taskId, fencingEpoch: firstEpoch, adapterOperationId: null,
      }],
    };
    await saveCheckpoint(query, state, now);

    let writesDuringRecovery = 0;
    const readOnlyQuery = async (sql, params) => {
      if (!/^\s*SELECT\b/i.test(sql)) writesDuringRecovery++;
      return query(sql, params);
    };
    const active = await coordinateRecovery(readOnlyQuery, conversationId, authority, now, true);
    assert.equal(active.status, 'DEGRADED');
    assert.deepEqual(active.reasons, ['work_lease_active']);
    assert.equal(writesDuringRecovery, 0);

    await query(
      'UPDATE comind.cm_foundry_work_lease SET lease_expires_at=clock_timestamp()-interval \'1 second\' WHERE task_id=$1::uuid',
      [taskId]
    );
    const reclaimed = await query("SELECT * FROM comind.cm_foundry_claim_work('acp-worker-b',30)");
    assert.equal(reclaimed.rows[0].task_id, taskId);
    assert.ok(Number(reclaimed.rows[0].fencing_epoch) > firstEpoch);

    const superseded = await coordinateRecovery(readOnlyQuery, conversationId, authority, new Date().toISOString(), true);
    assert.equal(superseded.status, 'DEGRADED');
    assert.deepEqual(superseded.reasons, ['work_lease_superseded']);
    assert.equal(writesDuringRecovery, 0);
  } finally {
    await closePool();
  }
});
