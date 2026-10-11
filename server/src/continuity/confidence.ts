import type { Checkpoint, ContinuityState } from './checkpoint.js';
import { restoreCheckpoint } from './checkpoint.js';

export type RecoveryConfidence =
  | { status: 'READY'; state: ContinuityState; reasons: string[] }
  | { status: 'DEGRADED'; state: ContinuityState; reasons: string[] }
  | { status: 'BLOCKED'; reasons: string[] };

export function evaluateRecovery(
  checkpoint: Checkpoint,
  authority: ContinuityState['authority'],
  now: string,
  dependenciesAvailable: boolean
): RecoveryConfidence {
  let state: ContinuityState;
  try {
    state = restoreCheckpoint(checkpoint, authority, now);
  } catch {
    return { status: 'BLOCKED', reasons: ['checkpoint_integrity_freshness_or_authority_invalid'] };
  }
  const reasons: string[] = [];
  if (!dependenciesAvailable) reasons.push('dependency_unavailable');
  // Checkpoint operation status is observational only. Any recorded side-effect
  // obligation requires reconciliation against its authoritative system before
  // recovery can be classified READY, including an operation observed as completed.
  if (state.pending.length > 0) reasons.push('operation_reconciliation_required');
  if (reasons.length) return { status: 'DEGRADED', state, reasons };
  return { status: 'READY', state, reasons };
}
