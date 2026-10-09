import { Checkpoint, ContinuityState, restoreCheckpoint } from './checkpoint.js';

export type RecoveryConfidence =
  | { status: 'READY'; state: ContinuityState; reasons: string[] }
  | { status: 'DEGRADED'; state: ContinuityState; reasons: string[] }
  | { status: 'BLOCKED'; reasons: string[] };

export function evaluateRecovery(
  checkpoint: Checkpoint,
  authority: ContinuityState['authority'],
  now: string,
  dependenciesAvailable: boolean,
  maxAgeMs = 86400000
): RecoveryConfidence {
  let state: ContinuityState;
  try {
    state = restoreCheckpoint(checkpoint, authority, now, maxAgeMs);
  } catch {
    // Do not expose checkpoint data or credentials through errors.
    return { status: 'BLOCKED', reasons: ['checkpoint_integrity_freshness_or_authority_invalid'] };
  }
  const reasons: string[] = [];
  if (!dependenciesAvailable) reasons.push('dependency_unavailable');
  if (state.pending.some(operation => operation.status !== 'completed'))
    reasons.push('unreconciled_operation');
  if (reasons.length) return { status: 'DEGRADED', state, reasons };
  return { status: 'READY', state, reasons };
}
