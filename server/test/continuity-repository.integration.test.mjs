import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createSuccessorState } from '../dist/continuity/checkpoint.js';
import { saveCheckpoint, restoreLatestCheckpoint } from '../dist/continuity/repository.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const query = async (sql, params) => ({ rows: (await pool.query(sql, params)).rows });
const authority = { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' };
const state = (conversationId) => ({
  conversationId, workflowId: 'acp.integration', executionId: 'execution-1', parentCheckpointId: null,
  executionCursor: 'saved', authority,
  context: { objective: 'Recover safely', decisions: ['bounded'], references: [] },
  provenance: { sourceRefs: ['integration'], evidenceRefs: [] },
  pending: [{ operationId: 'op-1', idempotencyKey: 'idem-1', status: 'uncertain', taskId: null, fencingEpoch: null, adapterOperationId: null }],
});

test('isolated PostgreSQL checkpoint repository preserves immutability, deterministic persistence order, lineage, and idempotency', { skip: process.env.ACP_ISOLATED_DB_TEST !== '1' }, async () => {
  try {
    const conversationId = 'acp-repository-' + process.pid;
    const createdAt = new Date().toISOString();
    const initial = state(conversationId);
    const first = await saveCheckpoint(query, initial, createdAt);
    assert.equal((await saveCheckpoint(query, initial, createdAt)).checkpointId, first.checkpointId);

    const restored = await restoreLatestCheckpoint(query, conversationId, authority, createdAt);
    assert.ok(restored);
    assert.equal(restored.checkpointId, first.checkpointId);
    assert.deepEqual(restored.state, initial);

    const changed = structuredClone(initial);
    changed.context.objective = 'different state under reused execution id';
    await assert.rejects(() => saveCheckpoint(query, changed, createdAt), /different state/);

    const successor = createSuccessorState(restored.state, first.checkpointId, 'execution-2', 'successor-ready');
    const second = await saveCheckpoint(query, successor, createdAt);
    assert.notEqual(second.checkpointId, first.checkpointId);
    const latest = await restoreLatestCheckpoint(query, conversationId, authority, new Date(Date.parse(createdAt) + 2).toISOString());
    assert.equal(latest.state.executionId, 'execution-2');
    assert.equal(latest.state.parentCheckpointId, first.checkpointId);

    const persistenceOrder = await query(
      `SELECT execution_id, persistence_seq::text
       FROM comind.cm_continuity_checkpoint
       WHERE conversation_id=$1
       ORDER BY persistence_seq ASC`,
      [conversationId]
    );
    assert.deepEqual(persistenceOrder.rows.map(row => row.execution_id), ['execution-1', 'execution-2']);
    assert.ok(BigInt(persistenceOrder.rows[1].persistence_seq) > BigInt(persistenceOrder.rows[0].persistence_seq));

    await assert.rejects(
      () => query('UPDATE comind.cm_continuity_checkpoint SET digest=digest WHERE checkpoint_id=$1::uuid', [first.checkpointId]),
      /immutable/
    );
    await assert.rejects(
      () => query('DELETE FROM comind.cm_continuity_checkpoint WHERE checkpoint_id=$1::uuid', [first.checkpointId]),
      /immutable/
    );
  } finally {
    await pool.end();
  }
});
