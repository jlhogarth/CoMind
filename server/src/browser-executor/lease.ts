import type { QueryFunction } from '../db.js';
import type { BrowserLeaseRef } from './policy.js';

export type BrowserLeaseDecision =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'lease_missing'
        | 'lease_not_active'
        | 'lease_worker_mismatch'
        | 'lease_token_mismatch'
        | 'lease_epoch_invalid'
        | 'lease_epoch_mismatch'
        | 'lease_expired';
    };

export type BrowserLeaseVerifier = (
  lease: BrowserLeaseRef,
  now: string
) => Promise<BrowserLeaseDecision>;

interface FoundryLeaseRow {
  state: string;
  worker_instance_id: string | null;
  lease_token: string | null;
  fencing_epoch: number | string;
  lease_expires_at: string | Date | null;
}

export function createFoundryBrowserLeaseVerifier(query: QueryFunction): BrowserLeaseVerifier {
  return async (lease, now) => {
    const result = await query<FoundryLeaseRow>(
      `SELECT state, worker_instance_id, lease_token::text, fencing_epoch, lease_expires_at
       FROM comind.cm_foundry_work_lease
       WHERE task_id=$1::uuid`,
      [lease.taskId]
    );
    const row = result.rows[0];
    if (!row) return { valid: false, reason: 'lease_missing' };
    if (row.state !== 'leased') return { valid: false, reason: 'lease_not_active' };
    if (row.worker_instance_id !== lease.workerInstanceId) {
      return { valid: false, reason: 'lease_worker_mismatch' };
    }
    if (row.lease_token !== lease.leaseToken) {
      return { valid: false, reason: 'lease_token_mismatch' };
    }
    const epoch = Number(row.fencing_epoch);
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      return { valid: false, reason: 'lease_epoch_invalid' };
    }
    if (epoch !== lease.fencingEpoch) {
      return { valid: false, reason: 'lease_epoch_mismatch' };
    }
    const expiry = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : Number.NaN;
    if (!Number.isFinite(expiry) || expiry <= Date.parse(now)) {
      return { valid: false, reason: 'lease_expired' };
    }
    return { valid: true };
  };
}
