import type { Pool, PoolClient } from 'pg';
import type { LifecycleEvaluation, LifecycleLedger, LifecycleReceipt, LifecycleSlot } from './lifecycle.js';

const projectKey = 'COMIND';
const source = 'runbook_lifecycle_test';
const sourceRef = (slot: LifecycleSlot) => `${slot.volumeId}:${slot.scheduledFor}`;

async function find(queryable: Pool | PoolClient, slot: LifecycleSlot): Promise<LifecycleReceipt | null> {
  const result = await queryable.query<{ id: string; details: LifecycleEvaluation }>(
    `SELECT e.id, e.details
       FROM comind_pm.pm_events e
       JOIN comind_pm.pm_projects p ON p.id = e.project_id
      WHERE p.project_key = $1 AND e.source_system = $2 AND e.source_ref = $3
      LIMIT 2`,
    [projectKey, source, sourceRef(slot)],
  );
  if (result.rows.length > 1) throw new Error('Conflicting RunBook lifecycle receipts');
  const row = result.rows[0];
  return row ? { eventId: row.id, evaluation: row.details } : null;
}

export function createTestLifecycleLedger(pool: Pool): LifecycleLedger {
  return {
    find: (slot) => find(pool, slot),
    async record(evaluation) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `${projectKey}:${source}:${sourceRef(evaluation)}`,
        ]);
        let receipt = await find(client, evaluation);
        if (!receipt) {
          const result = await client.query<{ id: string }>(
            `SELECT comind_pm.record_runbook_event(
               $1, 'verification', 'DRB-003', 'Test RunBook lifecycle evaluation',
               NULL, 'system', $2, $3, NULL, NULL, NULL, $4, $5, $6::jsonb,
               '[]'::jsonb, $7::timestamptz, false
             )::text AS id`,
            [
              projectKey,
              `Size=${evaluation.size}; rollover=${evaluation.rollover}`,
              evaluation.size === 'unavailable' || evaluation.size === 'invalid' ? 'fail'
                : evaluation.rollover === 'blocked' ? 'blocked' : 'pass',
              source,
              sourceRef(evaluation),
              JSON.stringify(evaluation),
              evaluation.checkedAt,
            ],
          );
          const id = result.rows[0]?.id;
          if (!id) throw new Error('RunBook lifecycle receipt was not created');
          receipt = { eventId: id, evaluation };
        }
        await client.query('COMMIT');
        return receipt;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
          throw error;
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
  };
}
