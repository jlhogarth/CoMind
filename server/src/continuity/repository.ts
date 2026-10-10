import type { QueryFunction } from '../db.js';
import type { Checkpoint, ContinuityState } from './checkpoint.js';
import { createCheckpoint, fingerprintState, restoreCheckpoint } from './checkpoint.js';

export interface StoredCheckpoint {
  checkpoint_id: string;
  checkpoint: Checkpoint;
}

async function resolveParentCheckpointId(
  query: QueryFunction,
  conversationId: string,
  explicitParent: string | null
): Promise<string | null> {
  if (explicitParent) {
    const parent = await query<{ checkpoint_id: string }>(
      `SELECT checkpoint_id::text
       FROM comind.cm_continuity_checkpoint
       WHERE checkpoint_id=$1::uuid AND conversation_id=$2`,
      [explicitParent, conversationId]
    );
    if (!parent.rows[0]) throw new Error('Parent checkpoint is unavailable for this conversation');
    return parent.rows[0].checkpoint_id;
  }
  const latest = await query<{ checkpoint_id: string }>(
    `SELECT checkpoint_id::text
     FROM comind.cm_continuity_checkpoint
     WHERE conversation_id=$1
     ORDER BY persistence_seq DESC
     LIMIT 1`,
    [conversationId]
  );
  return latest.rows[0]?.checkpoint_id ?? null;
}

export async function saveCheckpoint(
  query: QueryFunction,
  state: ContinuityState,
  createdAt: string
): Promise<{ checkpointId: string; checkpoint: Checkpoint }> {
  const parentCheckpointId = await resolveParentCheckpointId(
    query,
    state.conversationId,
    state.parentCheckpointId
  );
  const preparedState = structuredClone({ ...state, parentCheckpointId });
  const checkpoint = createCheckpoint(preparedState, createdAt);
  const inserted = await query<{ checkpoint_id: string }>(
    `INSERT INTO comind.cm_continuity_checkpoint (
       conversation_id, workflow_id, execution_id, parent_checkpoint_id,
       created_at, expires_at, state_digest, digest, checkpoint
     ) VALUES ($1,$2,$3,$4::uuid,$5::timestamptz,$6::timestamptz,$7,$8,$9::jsonb)
     ON CONFLICT (conversation_id, execution_id) DO NOTHING
     RETURNING checkpoint_id::text`,
    [
      preparedState.conversationId,
      preparedState.workflowId,
      preparedState.executionId,
      preparedState.parentCheckpointId,
      checkpoint.createdAt,
      checkpoint.expiresAt,
      checkpoint.stateDigest,
      checkpoint.digest,
      JSON.stringify(checkpoint),
    ]
  );
  if (inserted.rows[0]) return { checkpointId: inserted.rows[0].checkpoint_id, checkpoint };

  const existing = await query<StoredCheckpoint>(
    `SELECT checkpoint_id::text, checkpoint
     FROM comind.cm_continuity_checkpoint
     WHERE conversation_id=$1 AND execution_id=$2`,
    [preparedState.conversationId, preparedState.executionId]
  );
  if (!existing.rows[0]) throw new Error('Checkpoint persistence outcome uncertain');
  const stored = existing.rows[0];
  if (state.parentCheckpointId !== null
      && stored.checkpoint.state.parentCheckpointId !== state.parentCheckpointId) {
    throw new Error('Checkpoint execution id reused with different parent');
  }
  const comparable = structuredClone({
    ...preparedState,
    parentCheckpointId: stored.checkpoint.state.parentCheckpointId,
  });
  if (fingerprintState(comparable) !== stored.checkpoint.stateDigest) {
    throw new Error('Checkpoint execution id reused with different state');
  }
  return { checkpointId: stored.checkpoint_id, checkpoint: stored.checkpoint };
}

export async function restoreLatestCheckpoint(
  query: QueryFunction,
  conversationId: string,
  authority: ContinuityState['authority'],
  now: string
): Promise<{ checkpointId: string; state: ContinuityState } | null> {
  const result = await query<StoredCheckpoint>(
    `SELECT checkpoint_id::text, checkpoint
     FROM comind.cm_continuity_checkpoint
     WHERE conversation_id=$1
     ORDER BY persistence_seq DESC
     LIMIT 1`,
    [conversationId]
  );
  if (!result.rows[0]) return null;
  const stored = result.rows[0];
  if (stored.checkpoint.state?.conversationId !== conversationId) {
    throw new Error('Checkpoint conversation identity mismatch');
  }
  return {
    checkpointId: stored.checkpoint_id,
    state: restoreCheckpoint(stored.checkpoint, authority, now),
  };
}
