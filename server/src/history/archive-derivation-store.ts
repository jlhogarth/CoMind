import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  deriveConversation,
  type ConversationDerivationInput,
  type ConversationRole,
} from '../analytics/conversation-derivation.js';
import {
  archiveDerivationPool,
  assertArchiveDerivationSessionPrepared,
} from './archive-derivation-db.js';
import { extractArchiveContentText, resolveActiveArchiveBranch } from './archive-evidence.js';

export const CHIST_ARCHIVE_DERIVATION_VERSION = 'chist_archive_derivation_v1';
const DERIVER_ROLE = 'comind_conversation_history_deriver';
const SUPPORTED_ROLES = new Set<ConversationRole>(['user', 'assistant', 'system', 'tool']);

interface ArchiveConversationRow {
  title: string | null;
  created_at: string | null;
  normalized_hash: string;
  topology_hash: string;
  node_count: number;
  message_count: number;
  raw_conversation: Record<string, unknown>;
}

interface ArchiveNodeRow {
  source_node_id: string;
  parent_source_node_id: string | null;
  child_source_node_ids: string[];
  source_message_id: string | null;
  role: string | null;
  created_at: string | null;
  raw_node: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function loadCertifiedArchiveInput(
  client: PoolClient,
  importId: string,
  sourceConversationId: string,
) {
  const conversation = (await client.query<ArchiveConversationRow>(
    `SELECT o.title, o.created_at::text, o.normalized_hash::text, o.topology_hash::text,
            o.node_count, o.message_count, o.raw_conversation
       FROM comind.cm_archive_conversation_observation o
       JOIN comind.cm_conversation_history_baseline b ON b.import_id=o.import_id
      WHERE o.import_id=$1::uuid AND o.source_conversation_id=$2`,
    [importId, sourceConversationId],
  )).rows[0];
  if (!conversation) throw new Error('Certified archive conversation does not exist or is not visible to the history deriver');

  const nodes = (await client.query<ArchiveNodeRow>(
    `SELECT source_node_id, parent_source_node_id,
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(child_source_node_ids)), ARRAY[]::text[]) AS child_source_node_ids,
            source_message_id, role, created_at::text, raw_node
       FROM comind.cm_archive_node_observation
      WHERE import_id=$1::uuid AND source_conversation_id=$2
      ORDER BY source_node_id`,
    [importId, sourceConversationId],
  )).rows;

  const currentNode = typeof conversation.raw_conversation.current_node === 'string'
    ? conversation.raw_conversation.current_node
    : null;
  const branch = resolveActiveArchiveBranch(nodes.map((node) => ({
    sourceNodeId: node.source_node_id,
    parentSourceNodeId: node.parent_source_node_id,
    childSourceNodeIds: node.child_source_node_ids,
  })), currentNode);

  const excluded: Array<{ sourceNodeId: string; reason: string }> = [];
  const inputMessages: ConversationDerivationInput['messages'] = [];
  const nodeById = new Map(nodes.map((node) => [node.source_node_id, node]));

  if (!branch.ambiguous) {
    for (const sourceNodeId of branch.nodeIds) {
      const node = nodeById.get(sourceNodeId);
      if (!node) continue;
      if (!node.role || !SUPPORTED_ROLES.has(node.role as ConversationRole)) {
        if (node.source_message_id) excluded.push({ sourceNodeId, reason: 'unsupported_or_missing_role' });
        continue;
      }
      if (!node.created_at) {
        excluded.push({ sourceNodeId, reason: 'missing_source_timestamp' });
        continue;
      }
      const content = extractArchiveContentText(node.raw_node);
      if (!content.trim()) {
        excluded.push({ sourceNodeId, reason: 'empty_or_nontext_content' });
        continue;
      }
      inputMessages.push({
        msgId: sourceNodeId,
        role: node.role as ConversationRole,
        content,
        createdAt: node.created_at,
      });
    }
  }

  return { conversation, nodes, nodeById, branch, excluded, inputMessages };
}

export interface PersistedArchiveDerivationResult {
  archiveDerivationRunId: string;
  reusedExistingRun: boolean;
  resultState: 'completed' | 'partial' | 'ambiguous_topology';
  sourceSnapshotSha256: string;
  runIdentitySha256: string;
  derivationCount: number;
  promotionCandidateCount: number;
  activeBranchNodeCount: number;
  excludedNodeCount: number;
  ambiguityReason: string | null;
}

export async function deriveAndPersistArchiveConversation(
  importId: string,
  sourceConversationId: string,
): Promise<PersistedArchiveDerivationResult> {
  assertArchiveDerivationSessionPrepared();
  const client = await archiveDerivationPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SET LOCAL ROLE ${DERIVER_ROLE}`);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))`,
      [`${importId}:${sourceConversationId}`],
    );

    const loaded = await loadCertifiedArchiveInput(client, importId, sourceConversationId);
    const { conversation, nodes, nodeById, branch, excluded, inputMessages } = loaded;

    let sourceSnapshotSha256: string;
    let classifierRunIdentity: string;
    let derived: ReturnType<typeof deriveConversation> | null = null;
    let resultState: PersistedArchiveDerivationResult['resultState'];

    if (branch.ambiguous) {
      sourceSnapshotSha256 = sha256(JSON.stringify({
        importId,
        sourceConversationId,
        normalizedHash: conversation.normalized_hash,
        topologyHash: conversation.topology_hash,
        ambiguityReason: branch.reason,
      }));
      classifierRunIdentity = sha256(`ambiguous|${sourceSnapshotSha256}`);
      resultState = 'ambiguous_topology';
    } else {
      derived = deriveConversation({
        convId: `archive:${importId}:${sourceConversationId}`,
        title: conversation.title,
        source: 'native_chatgpt_archive',
        messages: inputMessages,
        interruptedPartials: [],
        captureEventCount: 0,
        checkpointCount: 0,
        maxCaptureSequence: 0,
      });
      sourceSnapshotSha256 = derived.sourceSnapshotSha256;
      classifierRunIdentity = derived.runIdentitySha256;
      resultState = excluded.length > 0 ? 'partial' : 'completed';
    }

    const runIdentitySha256 = sha256([
      CHIST_ARCHIVE_DERIVATION_VERSION,
      classifierRunIdentity,
      conversation.normalized_hash,
      conversation.topology_hash,
      branch.terminalNodeId ?? 'none',
      [...branch.nodeIds].sort().join(','),
      excluded.map((item) => `${item.sourceNodeId}:${item.reason}`).sort().join(','),
    ].join('|'));

    const existing = await client.query<{ archive_derivation_run_id: string }>(
      `SELECT archive_derivation_run_id::text
         FROM comind.cm_archive_derivation_run
        WHERE run_identity_sha256=$1::char(64)`,
      [runIdentitySha256],
    );
    let archiveDerivationRunId = existing.rows[0]?.archive_derivation_run_id ?? null;
    const reusedExistingRun = archiveDerivationRunId !== null;

    if (!archiveDerivationRunId) {
      const sourceStats = {
        archive_node_count: conversation.node_count,
        archive_message_count: conversation.message_count,
        active_branch_node_count: branch.nodeIds.size,
        analyzed_message_count: inputMessages.length,
        excluded_nodes: excluded,
        terminal_node_id: branch.terminalNodeId,
        ambiguity_reason: branch.reason,
        classifier_source_stats: derived?.sourceStats ?? null,
      };
      const engineMetadata = {
        adapter_version: CHIST_ARCHIVE_DERIVATION_VERSION,
        reused_classifier_policy_version: derived?.policyVersion ?? null,
        paid_provider_call: false,
        classifier_run_identity_sha256: derived?.runIdentitySha256 ?? null,
        conversation_summary: derived?.conversationAnalytics.summary ?? null,
        conversation_topics: derived?.conversationAnalytics.topics ?? [],
      };

      archiveDerivationRunId = (await client.query<{ archive_derivation_run_id: string }>(
        `INSERT INTO comind.cm_archive_derivation_run (
           import_id,source_conversation_id,policy_version,engine_kind,
           archive_normalized_hash,archive_topology_hash,source_snapshot_sha256,run_identity_sha256,
           source_node_count,source_message_count,active_branch_node_count,result_state,source_stats,engine_metadata
         ) VALUES (
           $1::uuid,$2,$3,'deterministic',$4::char(64),$5::char(64),$6::char(64),$7::char(64),
           $8,$9,$10,$11,$12::jsonb,$13::jsonb
         ) RETURNING archive_derivation_run_id::text`,
        [
          importId, sourceConversationId,
          `${CHIST_ARCHIVE_DERIVATION_VERSION}+${derived?.policyVersion ?? 'topology_only'}`,
          conversation.normalized_hash, conversation.topology_hash, sourceSnapshotSha256, runIdentitySha256,
          conversation.node_count, conversation.message_count, branch.nodeIds.size, resultState,
          JSON.stringify(sourceStats), JSON.stringify(engineMetadata),
        ],
      )).rows[0]?.archive_derivation_run_id ?? null;
      if (!archiveDerivationRunId) throw new Error('Archive derivation run insert did not return an id');

      if (derived) {
        const derivationIds = new Map<string,string>();
        for (const item of derived.derivations) {
          const sourceNodeId = item.sourceKind === 'canonical_message' ? item.msgId : null;
          const sourceNode = sourceNodeId ? nodeById.get(sourceNodeId) : null;
          const inserted = await client.query<{ archive_derivation_id: string }>(
            `INSERT INTO comind.cm_archive_derivation (
               archive_derivation_run_id,import_id,source_conversation_id,source_node_id,source_message_id,
               derivation_kind,source_kind,source_role,evidence_start_char,evidence_end_char,value_text,
               normalized_key,confidence,salience,uncertainty,conflict_state,evidence,metadata,derivation_sha256
             ) VALUES (
               $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::char(64)
             ) RETURNING archive_derivation_id::text`,
            [
              archiveDerivationRunId, importId, sourceConversationId,
              sourceNodeId, sourceNode?.source_message_id ?? null,
              item.derivationKind,
              item.sourceKind === 'canonical_message' ? 'archive_message' : 'conversation_aggregate',
              item.sourceRole, item.evidenceStartChar, item.evidenceEndChar, item.valueText,
              item.normalizedKey, item.confidence, item.salience, item.uncertainty, item.conflictState,
              JSON.stringify({ ...item.evidence, archive_import_id: importId, source_conversation_id: sourceConversationId, source_node_id: sourceNodeId }),
              JSON.stringify({ ...item.metadata, classifier_policy_version: derived.policyVersion, source_provenance: 'certified_native_openai_export' }),
              item.derivationSha256,
            ],
          );
          const id = inserted.rows[0]?.archive_derivation_id;
          if (!id) throw new Error('Archive typed derivation insert did not return an id');
          derivationIds.set(item.derivationSha256,id);
        }

        for (const candidate of derived.promotionCandidates) {
          const archiveDerivationId = derivationIds.get(candidate.derivationSha256);
          if (!archiveDerivationId) throw new Error('Archive promotion candidate references an unknown derivation hash');
          await client.query(
            `INSERT INTO comind.cm_archive_promotion_candidate (
               archive_derivation_run_id,import_id,source_conversation_id,archive_derivation_id,target_type,
               proposed_title,proposed_content,rationale,confidence,salience,uncertainty,conflict_state,evidence,candidate_sha256
             ) VALUES (
               $1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::char(64)
             )`,
            [
              archiveDerivationRunId, importId, sourceConversationId, archiveDerivationId, candidate.targetType,
              candidate.proposedTitle, candidate.proposedContent,
              candidate.rationale.replace('CFR-001G', 'CHIST-001 archive adapter reusing CFR-001G'),
              candidate.confidence, candidate.salience, candidate.uncertainty, candidate.conflictState,
              JSON.stringify({ ...candidate.evidence, archive_import_id: importId, source_conversation_id: sourceConversationId }),
              candidate.candidateSha256,
            ],
          );
        }
      }
    }

    const counts = (await client.query<{ derivation_count: string; candidate_count: string }>(
      `SELECT
         (SELECT count(*) FROM comind.cm_archive_derivation WHERE archive_derivation_run_id=$1::uuid)::text AS derivation_count,
         (SELECT count(*) FROM comind.cm_archive_promotion_candidate WHERE archive_derivation_run_id=$1::uuid)::text AS candidate_count`,
      [archiveDerivationRunId],
    )).rows[0];

    await client.query('COMMIT');
    return {
      archiveDerivationRunId,
      reusedExistingRun,
      resultState,
      sourceSnapshotSha256,
      runIdentitySha256,
      derivationCount: Number(counts?.derivation_count ?? 0),
      promotionCandidateCount: Number(counts?.candidate_count ?? 0),
      activeBranchNodeCount: branch.nodeIds.size,
      excludedNodeCount: excluded.length,
      ambiguityReason: branch.reason,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
