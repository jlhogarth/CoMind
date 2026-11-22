import type { Pool, PoolClient } from 'pg';
import type { LifecycleEvaluation, LifecycleLedger, LifecycleReceipt, LifecycleSlot } from './lifecycle.js';

const projectKey = 'COMIND';
const source = 'supabase';
const scopes = {
  isolated: { prefix: 'drb-003:test:', actor: 'DRB-003', summary: 'Test RunBook lifecycle evaluation' },
  scheduled: { prefix: 'drb-004:scheduled:', actor: 'DRB-004', summary: 'Scheduled Test RunBook lifecycle evaluation' },
} as const;

async function find(queryable: Pool | PoolClient, ref: string): Promise<LifecycleReceipt | null> {
  const result = await queryable.query<{ id: string; details: LifecycleEvaluation }>(
    `SELECT e.id, e.details
       FROM comind_pm.pm_events e
       JOIN comind_pm.pm_projects p ON p.id = e.project_id
      WHERE p.project_key = $1 AND e.source_system = $2 AND e.source_ref = $3
      LIMIT 2`,
    [projectKey, source, ref],
  );
  if (result.rows.length > 1) throw new Error('Conflicting RunBook lifecycle receipts');
  const row = result.rows[0];
  return row ? { eventId: row.id, evaluation: row.details } : null;
}

export function createLifecycleLedger(pool: Pool, scope: keyof typeof scopes): LifecycleLedger {
  const { prefix, actor, summary } = scopes[scope];
  const sourceRef = (slot: LifecycleSlot) => `${prefix}${slot.volumeId}:${slot.scheduledFor}`;
  return {
    find: (slot) => find(pool, sourceRef(slot)),
    async record(evaluation) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `${projectKey}:${source}:${sourceRef(evaluation)}`,
        ]);
        let receipt = await find(client, sourceRef(evaluation));
        if (!receipt) {
          const result = await client.query<{ id: string }>(
            `SELECT comind_pm.record_runbook_event(
               $1, 'verification', $8, $9,
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
              actor,
              summary,
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

export function createTestLifecycleLedger(pool: Pool): LifecycleLedger {
  return createLifecycleLedger(pool, 'isolated');
}
