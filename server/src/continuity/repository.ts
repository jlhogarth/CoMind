import type { QueryFunction } from '../db.js';
import { Checkpoint, ContinuityState, createCheckpoint, restoreCheckpoint } from './checkpoint.js';

export interface StoredCheckpoint { checkpoint_id: string; checkpoint: Checkpoint }
export async function saveCheckpoint(
  query: QueryFunction, state: ContinuityState, createdAt: string
): Promise<string> {
  const checkpoint = createCheckpoint(state, createdAt);
  const result = await query<{ checkpoint_id: string }>(
    `INSERT INTO continuity_checkpoints (conversation_id, execution_id, created_at, digest, checkpoint)
     VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb)
     ON CONFLICT (conversation_id, execution_id, digest) DO NOTHING
     RETURNING checkpoint_id::text`,
    [state.conversationId, state.executionId, createdAt, checkpoint.digest, JSON.stringify(checkpoint)]
  );
  if (result.rows[0]) return result.rows[0].checkpoint_id;
  const existing = await query<{ checkpoint_id: string }>(
    `SELECT checkpoint_id::text FROM continuity_checkpoints
     WHERE conversation_id = $1 AND execution_id = $2 AND digest = $3`,
    [state.conversationId, state.executionId, checkpoint.digest]
  );
  if (!existing.rows[0]) throw new Error('Checkpoint persistence outcome uncertain');
  return existing.rows[0].checkpoint_id;
}

export async function restoreLatestCheckpoint(
  query: QueryFunction, conversationId: string,
  authority: ContinuityState['authority'], now: string
): Promise<ContinuityState | null> {
  const result = await query<StoredCheckpoint>(
    `SELECT checkpoint_id::text, checkpoint FROM continuity_checkpoints
     WHERE conversation_id = $1 ORDER BY checkpoint_id DESC LIMIT 1`, [conversationId]
  );
  if (!result.rows[0]) return null;
  if (result.rows[0].checkpoint.state.conversationId !== conversationId)
    throw new Error('Checkpoint conversation identity mismatch');
  return restoreCheckpoint(result.rows[0].checkpoint, authority, now);
}
