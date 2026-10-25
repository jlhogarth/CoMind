import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import { canonicalJson } from './chatgpt-export.js';
import {
  CHATGPT_LIVE_RECONCILIATION_VERSION,
  comparableArchiveMessage,
  comparableLiveMessage,
  reconcileConversationEvidence,
  type ArchiveConversationEvidence,
  type ComparableMessage,
  type LiveConversationEvidence,
  type ReconciliationClassification,
} from './chatgpt-live-reconcile.js';
import {
  assertReconciliationDatabaseSessionPrepared,
  reconciliationPool,
} from './reconciliation-db.js';

interface ArchiveConversationRow {
  import_id: string;
  source_conversation_id: string;
  title: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  normalized_hash: string;
  topology_hash: string;
  raw_conversation: unknown;
  import_status: string;
  source_first_seen_at: Date | string;
}

interface ArchiveNodeRow {
  source_node_id: string;
  parent_source_node_id: string | null;
  child_source_node_ids: unknown;
  source_message_id: string | null;
  role: string | null;
  created_at: Date | string | null;
  raw_node: unknown;
}

interface LiveConversationRow {
  conv_id: string;
  source: string;
  title: string | null;
  external_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
}

interface LiveMessageRow {
  conv_id: string;
  role: string;
  content: string;
  created_at: Date | string;
}

interface InterruptedPartialRow {
  conv_id: string;
  generation_id: string;
  partial_assistant_content: string;
  observed_at: Date | string;
}

export interface ReconciliationReceiptResult {
  reconciliationId: string;
  result: ReconciliationClassification['result'];
  selectedConvId: string | null;
  matchMethod: ReconciliationClassification['matchMethod'];
  candidateSetSha256: string;
  receiptSha256: string;
  reused: boolean;
  liveSnapshotCutoff: string;
}

interface ActiveBranchResult {
  messages: ComparableMessage[];
  resolution: 'current_node' | 'single_leaf' | 'unresolved';
  activeNodeIds: string[];
  unresolvedReason: string | null;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function childIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function resolveActiveArchiveBranch(rawConversation: unknown, nodes: ArchiveNodeRow[]): ActiveBranchResult {
  const nodeById = new Map(nodes.map((node) => [node.source_node_id, node]));
  const raw = objectValue(rawConversation);
  let terminalNodeId = typeof raw?.current_node === 'string' ? raw.current_node : null;
  let resolution: ActiveBranchResult['resolution'] = 'current_node';

  if (!terminalNodeId || !nodeById.has(terminalNodeId)) {
    const leaves = nodes.filter((node) => childIds(node.child_source_node_ids).length === 0);
    if (leaves.length !== 1) {
      return {
        messages: [],
        resolution: 'unresolved',
        activeNodeIds: [],
        unresolvedReason: terminalNodeId
          ? 'archive_current_node_not_present_and_multiple_or_zero_leaves'
          : 'archive_current_node_missing_and_multiple_or_zero_leaves',
      };
    }
    terminalNodeId = leaves[0]!.source_node_id;
    resolution = 'single_leaf';
  }

  const ancestry: ArchiveNodeRow[] = [];
  const seen = new Set<string>();
  let current: ArchiveNodeRow | undefined = nodeById.get(terminalNodeId);
  while (current) {
    if (seen.has(current.source_node_id)) {
      return {
        messages: [],
        resolution: 'unresolved',
        activeNodeIds: ancestry.map((node) => node.source_node_id),
        unresolvedReason: 'archive_parent_cycle_detected',
      };
    }
    seen.add(current.source_node_id);
    ancestry.push(current);
    current = current.parent_source_node_id
      ? nodeById.get(current.parent_source_node_id)
      : undefined;
  }
  ancestry.reverse();

  const messages = ancestry
    .filter((node) => node.role === 'user' || node.role === 'assistant')
    .map((node) => comparableArchiveMessage({
      sourceNodeId: node.source_node_id,
      sourceMessageId: node.source_message_id,
      role: node.role,
      createdAt: iso(node.created_at),
      rawNode: node.raw_node,
    }))
    .filter((message): message is ComparableMessage => message !== null);

  return {
    messages,
    resolution,
    activeNodeIds: ancestry.map((node) => node.source_node_id),
    unresolvedReason: null,
  };
}

function messageLevelCounts(archive: ComparableMessage[], live: ComparableMessage[]): Record<string, number> {
  const minimum = Math.min(archive.length, live.length);
  let prefix = 0;
  while (prefix < minimum && archive[prefix]?.fingerprint === live[prefix]?.fingerprint) prefix += 1;

  const counts: Record<string, number> = { exact_message: prefix };
  if (prefix === minimum) {
    counts.archive_only_message = Math.max(archive.length - live.length, 0);
    counts.live_only_message = Math.max(live.length - archive.length, 0);
    counts.conflicting_message = 0;
  } else {
    counts.conflicting_message = minimum - prefix;
    counts.archive_only_message = Math.max(archive.length - minimum, 0);
    counts.live_only_message = Math.max(live.length - minimum, 0);
  }
  return counts;
}

async function loadArchiveConversation(
  client: PoolClient,
  importId: string,
  sourceConversationId: string
): Promise<{ evidence: ArchiveConversationEvidence; branch: ActiveBranchResult; sourceFirstSeenAt: string }> {
  const conversationResult = await client.query<ArchiveConversationRow>(
    `SELECT observation.import_id,
            observation.source_conversation_id,
            observation.title,
            observation.created_at,
            observation.updated_at,
            observation.normalized_hash::text,
            observation.topology_hash::text,
            observation.raw_conversation,
            import.status AS import_status,
            source.first_seen_at AS source_first_seen_at
       FROM comind.cm_archive_conversation_observation observation
       JOIN comind.cm_archive_import import ON import.import_id=observation.import_id
       JOIN comind.cm_archive_source source ON source.source_archive_id=import.source_archive_id
      WHERE observation.import_id=$1
        AND observation.source_conversation_id=$2`,
    [importId, sourceConversationId]
  );
  const row = conversationResult.rows[0];
  if (!row) throw new Error('Archive conversation observation not found');
  if (!['PASS', 'WARN'].includes(row.import_status)) {
    throw new Error(`Archive import must be finalized PASS or WARN before reconciliation; got ${row.import_status}`);
  }

  const nodesResult = await client.query<ArchiveNodeRow>(
    `SELECT source_node_id,
            parent_source_node_id,
            child_source_node_ids,
            source_message_id,
            role,
            created_at,
            raw_node
       FROM comind.cm_archive_node_observation
      WHERE import_id=$1 AND source_conversation_id=$2
      ORDER BY source_node_id`,
    [importId, sourceConversationId]
  );
  const branch = resolveActiveArchiveBranch(row.raw_conversation, nodesResult.rows);
  return {
    evidence: {
      importId: row.import_id,
      sourceConversationId: row.source_conversation_id,
      title: row.title,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      normalizedHash: row.normalized_hash,
      topologyHash: row.topology_hash,
      messages: branch.messages,
    },
    branch,
    sourceFirstSeenAt: iso(row.source_first_seen_at)!,
  };
}

async function loadLiveConversations(client: PoolClient, cutoff: string): Promise<LiveConversationEvidence[]> {
  const conversationsResult = await client.query<LiveConversationRow>(
    `SELECT conv_id, source, title, external_ref, metadata, created_at
       FROM comind.cm_conversation
      WHERE created_at <= $1::timestamptz
      ORDER BY conv_id`,
    [cutoff]
  );
  if (conversationsResult.rows.length === 0) return [];

  const messagesResult = await client.query<LiveMessageRow>(
    `WITH first_capture AS (
       SELECT msg_id, min(sequence_no) AS sequence_no
         FROM comind.cm_conversation_capture_event
        WHERE msg_id IS NOT NULL AND captured_at <= $1::timestamptz
        GROUP BY msg_id
     )
     SELECT message.conv_id, message.role, message.content, message.created_at
       FROM comind.cm_message message
       JOIN comind.cm_conversation conversation ON conversation.conv_id=message.conv_id
       LEFT JOIN first_capture capture ON capture.msg_id=message.msg_id
      WHERE conversation.created_at <= $1::timestamptz
        AND message.created_at <= $1::timestamptz
      ORDER BY message.conv_id,
               capture.sequence_no NULLS LAST,
               message.created_at,
               message.msg_id`,
    [cutoff]
  );

  const partialsResult = await client.query<InterruptedPartialRow>(
    `SELECT DISTINCT ON (generation.generation_id)
            generation.conv_id,
            generation.generation_id,
            checkpoint.partial_assistant_content,
            checkpoint.created_at AS observed_at
       FROM comind.cm_assistant_generation generation
       JOIN comind.cm_conversation_recovery_checkpoint checkpoint
         ON checkpoint.generation_id=generation.generation_id
      WHERE generation.status='interrupted'
        AND checkpoint.partial_assistant_content IS NOT NULL
        AND checkpoint.created_at <= $1::timestamptz
      ORDER BY generation.generation_id, checkpoint.created_at DESC, checkpoint.checkpoint_id DESC`,
    [cutoff]
  );

  const messages = new Map<string, ComparableMessage[]>();
  for (const row of messagesResult.rows) {
    const values = messages.get(row.conv_id) ?? [];
    values.push(comparableLiveMessage({ role: row.role, content: row.content, createdAt: iso(row.created_at) }));
    messages.set(row.conv_id, values);
  }

  const partials = new Map<string, LiveConversationEvidence['interruptedPartials']>();
  for (const row of partialsResult.rows) {
    const values = partials.get(row.conv_id) ?? [];
    values.push({
      generationId: row.generation_id,
      content: row.partial_assistant_content,
      observedAt: iso(row.observed_at),
    });
    partials.set(row.conv_id, values);
  }

  return conversationsResult.rows.map((row) => ({
    convId: row.conv_id,
    source: row.source,
    title: row.title,
    externalRef: row.external_ref,
    metadata: row.metadata,
    createdAt: iso(row.created_at)!,
    messages: messages.get(row.conv_id) ?? [],
    interruptedPartials: partials.get(row.conv_id) ?? [],
  }));
}

function failClosedArchiveAmbiguity(
  archive: ArchiveConversationEvidence,
  branch: ActiveBranchResult
): ReconciliationClassification {
  const evidence = {
    reconciliationVersion: CHATGPT_LIVE_RECONCILIATION_VERSION,
    archiveImportId: archive.importId,
    archiveSourceConversationId: archive.sourceConversationId,
    archiveNormalizedHash: archive.normalizedHash,
    archiveTopologyHash: archive.topologyHash,
    activeBranchResolution: branch.resolution,
    activeNodeIds: branch.activeNodeIds,
  };
  return {
    result: 'ambiguous_match',
    selectedConvId: null,
    matchMethod: 'none',
    candidates: [],
    classificationCounts: { archive_topology_unresolved: 1 },
    conflicts: [],
    unresolved: [{ reason: branch.unresolvedReason ?? 'archive_active_branch_unresolved' }],
    evidence,
    candidateSetSha256: sha256Canonical({ evidence, unresolvedReason: branch.unresolvedReason }),
  };
}

function enrichClassificationCounts(
  classification: ReconciliationClassification,
  archive: ArchiveConversationEvidence,
  live: LiveConversationEvidence[]
): ReconciliationClassification {
  if (!classification.selectedConvId) return classification;
  const selected = live.find((conversation) => conversation.convId === classification.selectedConvId);
  if (!selected) throw new Error('Selected reconciliation candidate is absent from live snapshot');
  return {
    ...classification,
    classificationCounts: {
      ...classification.classificationCounts,
      ...messageLevelCounts(archive.messages, selected.messages),
    },
  };
}

async function persistReceipt(
  client: PoolClient,
  archive: ArchiveConversationEvidence,
  cutoff: string,
  classification: ReconciliationClassification
): Promise<ReconciliationReceiptResult> {
  const receiptPayload = {
    reconciliationVersion: CHATGPT_LIVE_RECONCILIATION_VERSION,
    archiveImportId: archive.importId,
    archiveSourceConversationId: archive.sourceConversationId,
    archiveNormalizedHash: archive.normalizedHash,
    archiveTopologyHash: archive.topologyHash,
    liveSnapshotCutoff: cutoff,
    liveCandidateSetSha256: classification.candidateSetSha256,
    result: classification.result,
    selectedConvId: classification.selectedConvId,
    matchMethod: classification.matchMethod,
    classificationCounts: classification.classificationCounts,
    conflicts: classification.conflicts,
    unresolved: classification.unresolved,
    evidence: classification.evidence,
  };
  const receiptSha256 = sha256Canonical(receiptPayload);

  const inserted = await client.query<{ reconciliation_id: string }>(
    `INSERT INTO comind.cm_conversation_reconciliation_receipt (
       import_id,source_conversation_id,reconciliation_version,
       archive_normalized_hash,archive_topology_hash,live_snapshot_cutoff,live_candidate_set_sha256,
       result,selected_conv_id,match_method,classification_counts,conflicts,unresolved,evidence,receipt_sha256
     ) VALUES (
       $1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15
     )
     ON CONFLICT (import_id,source_conversation_id,reconciliation_version,live_candidate_set_sha256)
     DO NOTHING
     RETURNING reconciliation_id`,
    [
      archive.importId,
      archive.sourceConversationId,
      CHATGPT_LIVE_RECONCILIATION_VERSION,
      archive.normalizedHash,
      archive.topologyHash,
      cutoff,
      classification.candidateSetSha256,
      classification.result,
      classification.selectedConvId,
      classification.matchMethod,
      JSON.stringify(classification.classificationCounts),
      JSON.stringify(classification.conflicts),
      JSON.stringify(classification.unresolved),
      JSON.stringify(classification.evidence),
      receiptSha256,
    ]
  );

  const reconciliationId = inserted.rows[0]?.reconciliation_id;
  if (!reconciliationId) {
    const existing = await client.query<{
      reconciliation_id: string;
      receipt_sha256: string;
      result: ReconciliationClassification['result'];
      selected_conv_id: string | null;
      match_method: ReconciliationClassification['matchMethod'];
      live_snapshot_cutoff: Date | string;
    }>(
      `SELECT reconciliation_id,receipt_sha256::text,result,selected_conv_id,match_method,live_snapshot_cutoff
         FROM comind.cm_conversation_reconciliation_receipt
        WHERE import_id=$1 AND source_conversation_id=$2 AND reconciliation_version=$3
          AND live_candidate_set_sha256=$4`,
      [archive.importId, archive.sourceConversationId, CHATGPT_LIVE_RECONCILIATION_VERSION, classification.candidateSetSha256]
    );
    const row = existing.rows[0];
    if (!row) throw new Error('Reconciliation receipt conflict did not resolve to an existing receipt');
    if (row.receipt_sha256 !== receiptSha256) {
      throw new Error('Existing reconciliation receipt has the same immutable input identity but a different digest');
    }
    return {
      reconciliationId: row.reconciliation_id,
      result: row.result,
      selectedConvId: row.selected_conv_id,
      matchMethod: row.match_method,
      candidateSetSha256: classification.candidateSetSha256,
      receiptSha256,
      reused: true,
      liveSnapshotCutoff: iso(row.live_snapshot_cutoff)!,
    };
  }

  for (const candidate of classification.candidates) {
    await client.query(
      `INSERT INTO comind.cm_conversation_reconciliation_candidate (
         reconciliation_id,conv_id,candidate_rank,match_method,match_strength,classification,
         selected,evidence,candidate_sha256
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        reconciliationId,
        candidate.convId,
        classification.candidates.indexOf(candidate) + 1,
        candidate.matchMethod,
        candidate.matchStrength,
        candidate.classification,
        candidate.selected,
        JSON.stringify(candidate.evidence),
        candidate.candidateSha256,
      ]
    );
  }

  return {
    reconciliationId,
    result: classification.result,
    selectedConvId: classification.selectedConvId,
    matchMethod: classification.matchMethod,
    candidateSetSha256: classification.candidateSetSha256,
    receiptSha256,
    reused: false,
    liveSnapshotCutoff: cutoff,
  };
}

export async function reconcileArchiveConversation(
  importId: string,
  sourceConversationId: string,
  liveSnapshotCutoff?: string
): Promise<ReconciliationReceiptResult> {
  assertReconciliationDatabaseSessionPrepared();
  const client = await reconciliationPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const { evidence: archive, branch, sourceFirstSeenAt } = await loadArchiveConversation(
      client,
      importId,
      sourceConversationId
    );
    const cutoff = liveSnapshotCutoff ? new Date(liveSnapshotCutoff).toISOString() : sourceFirstSeenAt;
    const live = await loadLiveConversations(client, cutoff);
    const baseClassification = branch.resolution === 'unresolved'
      ? failClosedArchiveAmbiguity(archive, branch)
      : reconcileConversationEvidence(archive, live);
    const classification = enrichClassificationCounts(baseClassification, archive, live);
    const result = await persistReceipt(client, archive, cutoff, classification);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
