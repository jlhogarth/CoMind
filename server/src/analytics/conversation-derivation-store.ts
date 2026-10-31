import type { PoolClient } from 'pg';

import { deriveConversation, type ConversationDerivationInput, type ConversationRole } from './conversation-derivation.js';
import { assertDerivationDatabaseSessionPrepared, derivationPool } from './derivation-db.js';

interface ConversationRow {
  conv_id: string;
  title: string | null;
  source: string | null;
}

interface MessageRow {
  msg_id: string;
  role: ConversationRole;
  content: string;
  created_at: Date | string;
}

interface PartialRow {
  checkpoint_id: string;
  generation_id: string | null;
  partial_assistant_content: string;
  created_at: Date | string;
  last_capture_sequence: string | number;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function loadInput(client: PoolClient, convId: string): Promise<ConversationDerivationInput> {
  const conversationResult = await client.query<ConversationRow>(
    `SELECT conv_id::text, title, source
     FROM comind.cm_conversation
     WHERE conv_id = $1::uuid`,
    [convId],
  );
  const conversation = conversationResult.rows[0];
  if (!conversation) throw new Error(`Conversation ${convId} does not exist`);

  const messageResult = await client.query<MessageRow>(
    `SELECT msg_id::text, role, content, created_at
     FROM comind.cm_message
     WHERE conv_id = $1::uuid
     ORDER BY created_at, msg_id`,
    [convId],
  );

  const captureResult = await client.query<{ event_count: string; max_sequence: string }>(
    `SELECT count(*)::text AS event_count,
            coalesce(max(sequence_no), 0)::text AS max_sequence
     FROM comind.cm_conversation_capture_event
     WHERE conv_id = $1::uuid`,
    [convId],
  );

  const checkpointCountResult = await client.query<{ checkpoint_count: string }>(
    `SELECT count(*)::text AS checkpoint_count
     FROM comind.cm_conversation_recovery_checkpoint
     WHERE conv_id = $1::uuid`,
    [convId],
  );

  const partialResult = await client.query<PartialRow>(
    `SELECT DISTINCT ON (coalesce(generation_id::text, checkpoint_id::text))
            checkpoint_id::text,
            generation_id::text,
            partial_assistant_content,
            created_at,
            last_capture_sequence
     FROM comind.cm_conversation_recovery_checkpoint
     WHERE conv_id = $1::uuid
       AND partial_assistant_content IS NOT NULL
       AND length(partial_assistant_content) > 0
     ORDER BY coalesce(generation_id::text, checkpoint_id::text), created_at DESC, checkpoint_id DESC`,
    [convId],
  );

  return {
    convId: conversation.conv_id,
    title: conversation.title,
    source: conversation.source,
    messages: messageResult.rows.map((row) => ({
      msgId: row.msg_id,
      role: row.role,
      content: row.content,
      createdAt: iso(row.created_at),
    })),
    interruptedPartials: partialResult.rows.map((row) => ({
      checkpointId: row.checkpoint_id,
      generationId: row.generation_id,
      content: row.partial_assistant_content,
      createdAt: iso(row.created_at),
      captureSequenceStart: null,
      captureSequenceEnd: Number(row.last_capture_sequence),
    })),
    captureEventCount: Number(captureResult.rows[0]?.event_count ?? 0),
    checkpointCount: Number(checkpointCountResult.rows[0]?.checkpoint_count ?? 0),
    maxCaptureSequence: Number(captureResult.rows[0]?.max_sequence ?? 0),
  };
}

export interface PersistedDerivationResult {
  derivationRunId: string;
  reusedExistingRun: boolean;
  sourceSnapshotSha256: string;
  runIdentitySha256: string;
  derivationCount: number;
  promotionCandidateCount: number;
  messageAnalyticsCount: number;
  interruptedPartialCount: number;
}

export async function deriveAndPersistConversation(convId: string): Promise<PersistedDerivationResult> {
  assertDerivationDatabaseSessionPrepared();
  const client = await derivationPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [convId]);

    const input = await loadInput(client, convId);
    const derived = deriveConversation(input);

    const existingResult = await client.query<{ derivation_run_id: string }>(
      `SELECT derivation_run_id::text
       FROM comind.cm_conversation_derivation_run
       WHERE run_identity_sha256 = $1::char(64)`,
      [derived.runIdentitySha256],
    );

    let derivationRunId = existingResult.rows[0]?.derivation_run_id ?? null;
    let reusedExistingRun = derivationRunId !== null;

    if (!derivationRunId) {
      const runResult = await client.query<{ derivation_run_id: string }>(
        `INSERT INTO comind.cm_conversation_derivation_run (
           conv_id, policy_version, engine_kind, source_snapshot_sha256, run_identity_sha256,
           source_message_count, source_capture_event_count, source_checkpoint_count,
           source_max_capture_sequence, source_started_at, source_ended_at,
           result_state, source_stats, engine_metadata
         ) VALUES (
           $1::uuid, $2, 'deterministic', $3::char(64), $4::char(64),
           $5, $6, $7, $8, $9::timestamptz, $10::timestamptz,
           'completed', $11::jsonb, $12::jsonb
         )
         RETURNING derivation_run_id::text`,
        [
          convId,
          derived.policyVersion,
          derived.sourceSnapshotSha256,
          derived.runIdentitySha256,
          derived.sourceStats.messageCount,
          derived.sourceStats.captureEventCount,
          derived.sourceStats.checkpointCount,
          derived.sourceStats.maxCaptureSequence,
          derived.sourceStats.sourceStartedAt,
          derived.sourceStats.sourceEndedAt,
          JSON.stringify({ ...derived.sourceStats, topics: derived.conversationAnalytics.topics }),
          JSON.stringify({ engine: 'typescript_deterministic', policy_version: derived.policyVersion, paid_provider_call: false }),
        ],
      );
      derivationRunId = runResult.rows[0]?.derivation_run_id ?? null;
      if (!derivationRunId) throw new Error('Derivation run insert did not return an id');

      const derivationIds = new Map<string, string>();
      for (const item of derived.derivations) {
        const inserted = await client.query<{ derivation_id: string }>(
          `INSERT INTO comind.cm_conversation_derivation (
             derivation_run_id, conv_id, msg_id, checkpoint_id, derivation_kind,
             source_kind, source_role, capture_sequence_start, capture_sequence_end,
             evidence_start_char, evidence_end_char, value_text, normalized_key,
             confidence, salience, uncertainty, conflict_state, evidence, metadata,
             derivation_sha256
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
             $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20::char(64)
           )
           RETURNING derivation_id::text`,
          [
            derivationRunId,
            convId,
            item.msgId,
            item.checkpointId,
            item.derivationKind,
            item.sourceKind,
            item.sourceRole,
            item.captureSequenceStart,
            item.captureSequenceEnd,
            item.evidenceStartChar,
            item.evidenceEndChar,
            item.valueText,
            item.normalizedKey,
            item.confidence,
            item.salience,
            item.uncertainty,
            item.conflictState,
            JSON.stringify(item.evidence),
            JSON.stringify(item.metadata),
            item.derivationSha256,
          ],
        );
        const derivationId = inserted.rows[0]?.derivation_id;
        if (!derivationId) throw new Error('Typed derivation insert did not return an id');
        derivationIds.set(item.derivationSha256, derivationId);
      }

      for (const candidate of derived.promotionCandidates) {
        const derivationId = derivationIds.get(candidate.derivationSha256);
        if (!derivationId) throw new Error('Promotion candidate references an unknown derivation hash');
        await client.query(
          `INSERT INTO comind.cm_conversation_promotion_candidate (
             derivation_run_id, conv_id, derivation_id, target_type, proposed_title,
             proposed_content, rationale, confidence, salience, uncertainty,
             conflict_state, evidence, candidate_sha256
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4, $5,
             $6, $7, $8, $9, $10, $11, $12::jsonb, $13::char(64)
           )`,
          [
            derivationRunId,
            convId,
            derivationId,
            candidate.targetType,
            candidate.proposedTitle,
            candidate.proposedContent,
            candidate.rationale,
            candidate.confidence,
            candidate.salience,
            candidate.uncertainty,
            candidate.conflictState,
            JSON.stringify(candidate.evidence),
            candidate.candidateSha256,
          ],
        );
      }
    }

    for (const projection of derived.messageAnalytics) {
      await client.query(
        `INSERT INTO comind.cm_message_analytics (
           msg_id, token_count, sentiment, topics, metrics, derivation_run_id,
           source_snapshot_sha256, char_count, word_count, sentence_count,
           question_count, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, NULL, $3::text[], $4::jsonb, $5::uuid,
           $6::char(64), $7, $8, $9, $10, now(), now()
         )
         ON CONFLICT (msg_id) DO UPDATE SET
           token_count = EXCLUDED.token_count,
           sentiment = NULL,
           topics = EXCLUDED.topics,
           metrics = EXCLUDED.metrics,
           derivation_run_id = EXCLUDED.derivation_run_id,
           source_snapshot_sha256 = EXCLUDED.source_snapshot_sha256,
           char_count = EXCLUDED.char_count,
           word_count = EXCLUDED.word_count,
           sentence_count = EXCLUDED.sentence_count,
           question_count = EXCLUDED.question_count,
           updated_at = now()`,
        [
          projection.msgId,
          projection.tokenCountApprox,
          projection.topics,
          JSON.stringify(projection.metrics),
          derivationRunId,
          derived.sourceSnapshotSha256,
          projection.charCount,
          projection.wordCount,
          projection.sentenceCount,
          projection.questionCount,
        ],
      );
    }

    await client.query(
      `INSERT INTO comind.cm_conversation_analytics (
         conv_id, summary, stats, derivation_run_id, source_snapshot_sha256, created_at, updated_at
       ) VALUES ($1::uuid, $2, $3::jsonb, $4::uuid, $5::char(64), now(), now())
       ON CONFLICT (conv_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         stats = EXCLUDED.stats,
         derivation_run_id = EXCLUDED.derivation_run_id,
         source_snapshot_sha256 = EXCLUDED.source_snapshot_sha256,
         updated_at = now()`,
      [
        convId,
        derived.conversationAnalytics.summary,
        JSON.stringify(derived.conversationAnalytics.stats),
        derivationRunId,
        derived.sourceSnapshotSha256,
      ],
    );

    const persistedCounts = await client.query<{ derivation_count: string; candidate_count: string }>(
      `SELECT
         (SELECT count(*) FROM comind.cm_conversation_derivation WHERE derivation_run_id = $1::uuid)::text AS derivation_count,
         (SELECT count(*) FROM comind.cm_conversation_promotion_candidate WHERE derivation_run_id = $1::uuid)::text AS candidate_count`,
      [derivationRunId],
    );

    await client.query('COMMIT');
    return {
      derivationRunId,
      reusedExistingRun,
      sourceSnapshotSha256: derived.sourceSnapshotSha256,
      runIdentitySha256: derived.runIdentitySha256,
      derivationCount: Number(persistedCounts.rows[0]?.derivation_count ?? 0),
      promotionCandidateCount: Number(persistedCounts.rows[0]?.candidate_count ?? 0),
      messageAnalyticsCount: derived.messageAnalytics.length,
      interruptedPartialCount: derived.sourceStats.interruptedPartialCount,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
