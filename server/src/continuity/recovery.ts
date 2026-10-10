import type { QueryFunction } from '../db.js';
import type { ContinuityOperation, ContinuityState } from './checkpoint.js';
import { restoreCheckpoint } from './checkpoint.js';
import type { RecoveryConfidence } from './confidence.js';
import type { StoredCheckpoint } from './repository.js';

export type RecoveryDecision =
  | { status: 'ABSENT'; reasons: string[] }
  | RecoveryConfidence;

interface ReconciliationTables {
  work_lease_table: string | null;
  adapter_operation_table: string | null;
  adapter_result_table: string | null;
}

interface AdapterOutcomeRow {
  adapter_operation_id: string;
  terminal_status: string | null;
}

interface WorkLeaseRow {
  state: string;
  fencing_epoch: string | number;
  lease_expires_at: string | Date | null;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function leaseReason(row: WorkLeaseRow | undefined, operation: ContinuityOperation, now: string): string | null {
  if (!row) return 'work_lease_missing';
  const currentEpoch = Number(row.fencing_epoch);
  if (!Number.isSafeInteger(currentEpoch)) return 'work_lease_epoch_invalid';
  if (operation.fencingEpoch === null) return 'work_lease_reference_invalid';
  if (currentEpoch > operation.fencingEpoch) return 'work_lease_superseded';
  if (currentEpoch < operation.fencingEpoch) return 'work_lease_epoch_mismatch';
  if (row.state === 'completed') return 'work_lease_completed_without_terminal_adapter_result';
  if (row.state === 'exhausted') return 'work_lease_exhausted';
  if (row.state === 'ready') return 'work_lease_requires_outcome_reconciliation';
  if (row.state === 'leased') {
    const expiry = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : Number.NaN;
    return Number.isFinite(expiry) && expiry > Date.parse(now)
      ? 'work_lease_active'
      : 'work_lease_requires_outcome_reconciliation';
  }
  return 'work_lease_state_unknown';
}

async function reconcileOperation(
  query: QueryFunction,
  operation: ContinuityOperation,
  now: string
): Promise<{ operation: ContinuityOperation; reason: string | null }> {
  const adapter = await query<AdapterOutcomeRow>(
    `SELECT o.adapter_operation_id::text, r.terminal_status
     FROM comind.cm_foundry_adapter_operation AS o
     LEFT JOIN comind.cm_foundry_adapter_operation_result AS r
       ON r.adapter_operation_id=o.adapter_operation_id
     WHERE o.idempotency_key=$1
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [operation.idempotencyKey]
  );
  const adapterRow = adapter.rows[0];
  if (operation.adapterOperationId && adapterRow
      && adapterRow.adapter_operation_id !== operation.adapterOperationId) {
    return { operation, reason: 'adapter_operation_identity_mismatch' };
  }
  if (adapterRow?.terminal_status
      && ['succeeded', 'failed', 'cancelled', 'blocked'].includes(adapterRow.terminal_status)) {
    return { operation: { ...operation, status: 'completed' }, reason: null };
  }

  if (operation.taskId) {
    const lease = await query<WorkLeaseRow>(
      `SELECT state, fencing_epoch, lease_expires_at
       FROM comind.cm_foundry_work_lease
       WHERE task_id=$1::uuid`,
      [operation.taskId]
    );
    return { operation, reason: leaseReason(lease.rows[0], operation, now) };
  }
  return { operation, reason: 'adapter_outcome_unresolved' };
}

export async function coordinateRecovery(
  query: QueryFunction,
  conversationId: string,
  authority: ContinuityState['authority'],
  now: string,
  dependenciesAvailable: boolean
): Promise<RecoveryDecision> {
  const result = await query<StoredCheckpoint>(
    `SELECT checkpoint_id::text, checkpoint
     FROM comind.cm_continuity_checkpoint
     WHERE conversation_id=$1
     ORDER BY created_at DESC, checkpoint_id DESC
     LIMIT 1`,
    [conversationId]
  );
  if (!result.rows[0]) return { status: 'ABSENT', reasons: ['no_checkpoint'] };
  const checkpoint = result.rows[0].checkpoint;
  if (checkpoint.state?.conversationId !== conversationId) {
    return { status: 'BLOCKED', reasons: ['conversation_identity_mismatch'] };
  }

  let state: ContinuityState;
  try {
    state = restoreCheckpoint(checkpoint, authority, now);
  } catch {
    return { status: 'BLOCKED', reasons: ['checkpoint_integrity_freshness_or_authority_invalid'] };
  }

  if (!state.pending.length) {
    return dependenciesAvailable
      ? { status: 'READY', state, reasons: [] }
      : { status: 'DEGRADED', state, reasons: ['dependency_unavailable'] };
  }
  if (!dependenciesAvailable) {
    return {
      status: 'DEGRADED',
      state,
      reasons: ['dependency_unavailable', 'operation_reconciliation_required'],
    };
  }

  try {
    const tables = await query<ReconciliationTables>(
      `SELECT
         to_regclass('comind.cm_foundry_work_lease')::text AS work_lease_table,
         to_regclass('comind.cm_foundry_adapter_operation')::text AS adapter_operation_table,
         to_regclass('comind.cm_foundry_adapter_operation_result')::text AS adapter_result_table`
    );
    const availability = tables.rows[0];
    if (!availability?.work_lease_table
        || !availability.adapter_operation_table
        || !availability.adapter_result_table) {
      return { status: 'DEGRADED', state, reasons: ['reconciliation_substrate_unavailable'] };
    }

    const reconciled = structuredClone(state);
    const reasons: string[] = [];
    for (let index = 0; index < reconciled.pending.length; index++) {
      const result = await reconcileOperation(query, reconciled.pending[index], now);
      reconciled.pending[index] = result.operation;
      if (result.reason) reasons.push(result.reason);
    }
    if (reasons.length) {
      return { status: 'DEGRADED', state: reconciled, reasons: uniqueReasons(reasons) };
    }
    return { status: 'READY', state: reconciled, reasons: [] };
  } catch {
    return { status: 'DEGRADED', state, reasons: ['reconciliation_query_failed'] };
  }
}
