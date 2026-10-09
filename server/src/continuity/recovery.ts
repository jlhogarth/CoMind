import type { QueryFunction } from '../db.js';
import type { ContinuityState } from './checkpoint.js';
import { evaluateRecovery, type RecoveryConfidence } from './confidence.js';
import type { StoredCheckpoint } from './repository.js';

export type RecoveryDecision =
  | { status: 'ABSENT'; reasons: string[] }
  | RecoveryConfidence;

export async function coordinateRecovery(
  query: QueryFunction,
  conversationId: string,
  authority: ContinuityState['authority'],
  now: string,
  dependenciesAvailable: boolean
): Promise<RecoveryDecision> {
  const result = await query<StoredCheckpoint>(
    `SELECT checkpoint_id::text, checkpoint FROM continuity_checkpoints
     WHERE conversation_id=$1 ORDER BY checkpoint_id DESC LIMIT 1`, [conversationId]
  );
  if (!result.rows[0]) return { status: 'ABSENT', reasons: ['no_checkpoint'] };
  const checkpoint = result.rows[0].checkpoint;
  if (checkpoint.state?.conversationId !== conversationId)
    return { status: 'BLOCKED', reasons: ['conversation_identity_mismatch'] };
  // An untrusted checkpoint is never used as a source of execution authority.
  return evaluateRecovery(checkpoint, authority, now, dependenciesAvailable);
}
