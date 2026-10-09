import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { saveCheckpoint, restoreLatestCheckpoint } from '../dist/continuity/repository.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const query = async (sql, params) => ({ rows: (await pool.query(sql, params)).rows });
const time = new Date().toISOString();
const authority = { subjectId: 'agent-1', capabilityIds: ['read'], policyVersion: 'p1' };
const state = () => ({
  conversationId: 'acp-integration-' + process.pid,
  executionId: 'execution-1',
  parentCheckpointId: null, authority,
  context: { objective: 'Recover safely', decisions: ['bounded'], references: [] },
  pending: [{ operationId: 'op-1', idempotencyKey: 'idem-1', status: 'uncertain' }]
});
test('isolated PostgreSQL checkpoint repository', async () => {
  try {
    const s = state();
    const first = await saveCheckpoint(query, s, time);
    assert.equal(await saveCheckpoint(query, s, time), first, 'identical write must be idempotent');
    assert.deepEqual(await restoreLatestCheckpoint(query, s.conversationId, authority, time), s);
    assert.equal(await restoreLatestCheckpoint(query, 'nonexistent-' + process.pid, authority, time), null);
    await assert.rejects(
      () => restoreLatestCheckpoint(query, s.conversationId, { ...authority, capabilityIds: [] }, time),
      /Authority/
    );
    await assert.rejects(
      () => query('UPDATE continuity_checkpoints SET digest = digest WHERE checkpoint_id = $1', [first]),
      /immutable/
    );
    await assert.rejects(
      () => query('DELETE FROM continuity_checkpoints WHERE checkpoint_id = $1', [first]),
      /immutable/
    );
    await assert.rejects(
      () => query(
        `INSERT INTO continuity_checkpoints (conversation_id, execution_id, created_at, digest, checkpoint)
         VALUES ($1, $2, now(), $3, $4::jsonb)`,
        [s.conversationId, 'wrong-execution', '0'.repeat(64), JSON.stringify({
          version: 1, digest: '0'.repeat(64), state: s
        })]
      ),
      /continuity_checkpoint_execution/
    );
  } finally {
    await pool.end();
  }
});
