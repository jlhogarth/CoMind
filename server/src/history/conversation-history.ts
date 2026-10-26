import { assertHistoryDatabaseSessionPrepared, historyPool } from './history-db.js';

const HISTORY_ROLE = 'comind_conversation_history_reader';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type BaselineState = 'accepted' | 'review_required' | 'failed' | 'pending' | 'absent';

export interface ConversationHistoryStatus {
  baselineState: BaselineState;
  sourceArchiveCount: number;
  importCounts: Record<'PENDING' | 'PASS' | 'WARN' | 'FAIL', number>;
  latestImport: null | {
    importId: string;
    status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL';
    archiveName: string;
    archiveSha256: string;
    archiveBytes: number;
    parserVersion: string;
    schemaVersion: string;
    startedAt: string;
    completedAt: string | null;
    sourceConversationCount: number | null;
    importedConversationCount: number | null;
    parserWarningCount: number;
    parserErrorCount: number;
    receiptSha256: string | null;
  };
  acceptedImportId: string | null;
  note: string;
}

export interface HistoryConversationSummary {
  importId: string;
  sourceConversationId: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  nodeCount: number;
  messageCount: number;
  attachmentReferenceCount: number;
  rawSourceHash: string;
  normalizedHash: string;
  topologyHash: string;
  reconciliation: null | {
    result: string;
    matchMethod: string;
    selectedConvId: string | null;
    createdAt: string;
  };
}

export interface HistoryMessageNode {
  sourceNodeId: string;
  parentSourceNodeId: string | null;
  childSourceNodeIds: string[];
  sourceMessageId: string | null;
  role: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contentType: string | null;
  contentText: string;
  onActiveBranch: boolean;
  rawNodeHash: string;
  normalizedMessageHash: string | null;
}

function boundedLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}

function extractContentText(rawNode: unknown): string {
  if (!rawNode || typeof rawNode !== 'object') return '';
  const node = rawNode as Record<string, unknown>;
  const message = node.message;
  if (!message || typeof message !== 'object') return '';
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return typeof msg.text === 'string' ? msg.text : '';
  const contentObject = content as Record<string, unknown>;
  const parts = contentObject.parts;
  const texts: string[] = [];
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (typeof part === 'string') texts.push(part);
      else if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        texts.push((part as Record<string, unknown>).text as string);
      }
    }
  }
  if (texts.length === 0 && typeof contentObject.text === 'string') texts.push(contentObject.text);
  return texts.join('\n');
}

async function withHistoryClient<T>(work: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  assertHistoryDatabaseSessionPrepared();
  const client = await historyPool.connect();
  try {
    await client.query(`SET ROLE ${HISTORY_ROLE}`);
    const identity = await client.query<{ current_user: string }>('SELECT current_user::text AS current_user');
    if (identity.rows[0]?.current_user !== HISTORY_ROLE) {
      throw new Error('Conversation History query did not assume the governed reader role');
    }
    return await work(client);
  } finally {
    client.release();
  }
}

async function resolveImportId(client: import('pg').PoolClient, requested?: string): Promise<string> {
  if (requested) {
    const explicit = await client.query<{ import_id: string; status: string }>(
      `SELECT import_id::text, status
       FROM comind.cm_archive_import
       WHERE import_id = $1`,
      [requested]
    );
    if (!explicit.rows[0]) throw new Error('Requested Conversation History import does not exist');
    if (explicit.rows[0].status !== 'PASS') {
      throw new Error(`Requested Conversation History import is ${explicit.rows[0].status}, not accepted PASS evidence`);
    }
    return explicit.rows[0].import_id;
  }

  const latest = await client.query<{ import_id: string }>(
    `SELECT import_id::text
     FROM comind.cm_archive_import
     WHERE status = 'PASS'
     ORDER BY completed_at DESC NULLS LAST, started_at DESC
     LIMIT 1`
  );
  if (!latest.rows[0]) {
    throw new Error('No accepted PASS ChatGPT archive baseline exists yet');
  }
  return latest.rows[0].import_id;
}

export async function getConversationHistoryStatus(): Promise<ConversationHistoryStatus> {
  return withHistoryClient(async client => {
    const result = await client.query<{
      source_archive_count: number;
      pending_count: number;
      pass_count: number;
      warn_count: number;
      fail_count: number;
      import_id: string | null;
      status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL' | null;
      source_archive_name: string | null;
      source_archive_sha256: string | null;
      source_archive_bytes: string | null;
      parser_version: string | null;
      schema_version: string | null;
      started_at: string | null;
      completed_at: string | null;
      source_conversation_count: string | null;
      imported_conversation_count: string | null;
      parser_warning_count: string | null;
      parser_error_count: string | null;
      receipt_sha256: string | null;
      accepted_import_id: string | null;
    }>(
      `WITH counts AS (
         SELECT
           (SELECT count(*)::int FROM comind.cm_archive_source) AS source_archive_count,
           count(*) FILTER (WHERE status='PENDING')::int AS pending_count,
           count(*) FILTER (WHERE status='PASS')::int AS pass_count,
           count(*) FILTER (WHERE status='WARN')::int AS warn_count,
           count(*) FILTER (WHERE status='FAIL')::int AS fail_count
         FROM comind.cm_archive_import
       ), latest AS (
         SELECT i.*, s.source_archive_name, s.source_archive_sha256, s.source_archive_bytes
         FROM comind.cm_archive_import i
         JOIN comind.cm_archive_source s USING (source_archive_id)
         ORDER BY i.started_at DESC
         LIMIT 1
       ), accepted AS (
         SELECT import_id
         FROM comind.cm_archive_import
         WHERE status='PASS'
         ORDER BY completed_at DESC NULLS LAST, started_at DESC
         LIMIT 1
       )
       SELECT counts.*,
              latest.import_id::text,
              latest.status,
              latest.source_archive_name,
              latest.source_archive_sha256::text,
              latest.source_archive_bytes::text,
              latest.parser_version,
              latest.schema_version,
              latest.started_at::text,
              latest.completed_at::text,
              latest.source_conversation_count::text,
              latest.imported_conversation_count::text,
              latest.parser_warning_count::text,
              latest.parser_error_count::text,
              latest.receipt_sha256::text,
              accepted.import_id::text AS accepted_import_id
       FROM counts
       LEFT JOIN latest ON true
       LEFT JOIN accepted ON true`
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation History status query returned no row');

    const baselineState: BaselineState = row.accepted_import_id
      ? 'accepted'
      : row.status === 'WARN'
        ? 'review_required'
        : row.status === 'FAIL'
          ? 'failed'
          : row.status === 'PENDING'
            ? 'pending'
            : 'absent';

    return {
      baselineState,
      sourceArchiveCount: row.source_archive_count,
      importCounts: {
        PENDING: row.pending_count,
        PASS: row.pass_count,
        WARN: row.warn_count,
        FAIL: row.fail_count,
      },
      latestImport: row.import_id && row.status && row.source_archive_name && row.source_archive_sha256
        && row.source_archive_bytes !== null && row.parser_version && row.schema_version && row.started_at
        ? {
            importId: row.import_id,
            status: row.status,
            archiveName: row.source_archive_name,
            archiveSha256: row.source_archive_sha256,
            archiveBytes: Number(row.source_archive_bytes),
            parserVersion: row.parser_version,
            schemaVersion: row.schema_version,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            sourceConversationCount: row.source_conversation_count === null ? null : Number(row.source_conversation_count),
            importedConversationCount: row.imported_conversation_count === null ? null : Number(row.imported_conversation_count),
            parserWarningCount: Number(row.parser_warning_count ?? 0),
            parserErrorCount: Number(row.parser_error_count ?? 0),
            receiptSha256: row.receipt_sha256,
          }
        : null,
      acceptedImportId: row.accepted_import_id,
      note: row.accepted_import_id
        ? 'PASS baseline available for governed retrieval.'
        : row.status === 'WARN'
          ? 'Latest archive is WARN and remains review-required; it is not silently accepted.'
          : 'No accepted real ChatGPT archive baseline is available yet.',
    };
  });
}

export async function listHistoryConversations(options: {
  importId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<HistoryConversationSummary[]> {
  const limit = boundedLimit(options.limit);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer');

  return withHistoryClient(async client => {
    const importId = await resolveImportId(client, options.importId);
    const result = await client.query<{
      import_id: string;
      source_conversation_id: string;
      title: string | null;
      created_at: string | null;
      updated_at: string | null;
      node_count: string;
      message_count: string;
      attachment_reference_count: string;
      raw_source_hash: string;
      normalized_hash: string;
      topology_hash: string;
      reconciliation_result: string | null;
      reconciliation_match_method: string | null;
      selected_conv_id: string | null;
      reconciliation_created_at: string | null;
    }>(
      `SELECT o.import_id::text,
              o.source_conversation_id,
              o.title,
              o.created_at::text,
              o.updated_at::text,
              o.node_count::text,
              o.message_count::text,
              o.attachment_reference_count::text,
              o.raw_source_hash::text,
              o.normalized_hash::text,
              o.topology_hash::text,
              r.result AS reconciliation_result,
              r.match_method AS reconciliation_match_method,
              r.selected_conv_id::text,
              r.created_at::text AS reconciliation_created_at
       FROM comind.cm_archive_conversation_observation o
       LEFT JOIN LATERAL (
         SELECT result, match_method, selected_conv_id, created_at
         FROM comind.cm_conversation_reconciliation_receipt rr
         WHERE rr.import_id=o.import_id AND rr.source_conversation_id=o.source_conversation_id
         ORDER BY rr.created_at DESC
         LIMIT 1
       ) r ON true
       WHERE o.import_id=$1
       ORDER BY COALESCE(o.updated_at, o.created_at) DESC NULLS LAST, o.source_conversation_id
       LIMIT $2 OFFSET $3`,
      [importId, limit, offset]
    );

    return result.rows.map(row => ({
      importId: row.import_id,
      sourceConversationId: row.source_conversation_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nodeCount: Number(row.node_count),
      messageCount: Number(row.message_count),
      attachmentReferenceCount: Number(row.attachment_reference_count),
      rawSourceHash: row.raw_source_hash,
      normalizedHash: row.normalized_hash,
      topologyHash: row.topology_hash,
      reconciliation: row.reconciliation_result && row.reconciliation_match_method && row.reconciliation_created_at
        ? {
            result: row.reconciliation_result,
            matchMethod: row.reconciliation_match_method,
            selectedConvId: row.selected_conv_id,
            createdAt: row.reconciliation_created_at,
          }
        : null,
    }));
  });
}

export async function searchHistoryConversations(options: {
  query: string;
  importId?: string;
  limit?: number;
}): Promise<HistoryConversationSummary[]> {
  const search = options.query.trim();
  if (!search) throw new Error('search query must not be empty');
  if (search.length > 200) throw new Error('search query must be 200 characters or fewer');
  const limit = boundedLimit(options.limit);

  return withHistoryClient(async client => {
    const importId = await resolveImportId(client, options.importId);
    const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const result = await client.query<{ source_conversation_id: string }>(
      `SELECT o.source_conversation_id
       FROM comind.cm_archive_conversation_observation o
       WHERE o.import_id=$1
         AND (
           COALESCE(o.title, '') ILIKE $2 ESCAPE '\\'
           OR EXISTS (
             SELECT 1
             FROM comind.cm_archive_node_observation n
             WHERE n.import_id=o.import_id
               AND n.source_conversation_id=o.source_conversation_id
               AND n.raw_node::text ILIKE $2 ESCAPE '\\'
           )
         )
       ORDER BY COALESCE(o.updated_at, o.created_at) DESC NULLS LAST, o.source_conversation_id
       LIMIT $3`,
      [importId, pattern, limit]
    );
    if (result.rows.length === 0) return [];

    const ids = result.rows.map(row => row.source_conversation_id);
    const summaries = await client.query<{
      import_id: string;
      source_conversation_id: string;
      title: string | null;
      created_at: string | null;
      updated_at: string | null;
      node_count: string;
      message_count: string;
      attachment_reference_count: string;
      raw_source_hash: string;
      normalized_hash: string;
      topology_hash: string;
      reconciliation_result: string | null;
      reconciliation_match_method: string | null;
      selected_conv_id: string | null;
      reconciliation_created_at: string | null;
    }>(
      `SELECT o.import_id::text, o.source_conversation_id, o.title, o.created_at::text, o.updated_at::text,
              o.node_count::text, o.message_count::text, o.attachment_reference_count::text,
              o.raw_source_hash::text, o.normalized_hash::text, o.topology_hash::text,
              r.result AS reconciliation_result, r.match_method AS reconciliation_match_method,
              r.selected_conv_id::text, r.created_at::text AS reconciliation_created_at
       FROM comind.cm_archive_conversation_observation o
       LEFT JOIN LATERAL (
         SELECT result, match_method, selected_conv_id, created_at
         FROM comind.cm_conversation_reconciliation_receipt rr
         WHERE rr.import_id=o.import_id AND rr.source_conversation_id=o.source_conversation_id
         ORDER BY rr.created_at DESC LIMIT 1
       ) r ON true
       WHERE o.import_id=$1 AND o.source_conversation_id=ANY($2::text[])
       ORDER BY array_position($2::text[], o.source_conversation_id)`,
      [importId, ids]
    );

    return summaries.rows.map(row => ({
      importId: row.import_id,
      sourceConversationId: row.source_conversation_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nodeCount: Number(row.node_count),
      messageCount: Number(row.message_count),
      attachmentReferenceCount: Number(row.attachment_reference_count),
      rawSourceHash: row.raw_source_hash,
      normalizedHash: row.normalized_hash,
      topologyHash: row.topology_hash,
      reconciliation: row.reconciliation_result && row.reconciliation_match_method && row.reconciliation_created_at
        ? {
            result: row.reconciliation_result,
            matchMethod: row.reconciliation_match_method,
            selectedConvId: row.selected_conv_id,
            createdAt: row.reconciliation_created_at,
          }
        : null,
    }));
  });
}

export async function getHistoryConversation(options: {
  sourceConversationId: string;
  importId?: string;
}) {
  const sourceConversationId = options.sourceConversationId.trim();
  if (!sourceConversationId) throw new Error('sourceConversationId is required');

  return withHistoryClient(async client => {
    const importId = await resolveImportId(client, options.importId);
    const conversationResult = await client.query<{
      title: string | null;
      created_at: string | null;
      updated_at: string | null;
      raw_source_hash: string;
      normalized_hash: string;
      topology_hash: string;
      raw_conversation: Record<string, unknown>;
    }>(
      `SELECT title, created_at::text, updated_at::text,
              raw_source_hash::text, normalized_hash::text, topology_hash::text, raw_conversation
       FROM comind.cm_archive_conversation_observation
       WHERE import_id=$1 AND source_conversation_id=$2`,
      [importId, sourceConversationId]
    );
    const conversation = conversationResult.rows[0];
    if (!conversation) throw new Error('Conversation History conversation not found');

    const nodeResult = await client.query<{
      source_node_id: string;
      parent_source_node_id: string | null;
      child_source_node_ids: string[];
      source_message_id: string | null;
      role: string | null;
      created_at: string | null;
      updated_at: string | null;
      content_type: string | null;
      raw_node_hash: string;
      normalized_message_hash: string | null;
      raw_node: Record<string, unknown>;
    }>(
      `SELECT source_node_id, parent_source_node_id,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(child_source_node_ids)), ARRAY[]::text[]) AS child_source_node_ids,
              source_message_id, role, created_at::text, updated_at::text, content_type,
              raw_node_hash::text, normalized_message_hash::text, raw_node
       FROM comind.cm_archive_node_observation
       WHERE import_id=$1 AND source_conversation_id=$2
       ORDER BY created_at NULLS FIRST, source_node_id`,
      [importId, sourceConversationId]
    );

    const parentByNode = new Map(nodeResult.rows.map(row => [row.source_node_id, row.parent_source_node_id]));
    const activeNodes = new Set<string>();
    const currentNode = typeof conversation.raw_conversation.current_node === 'string'
      ? conversation.raw_conversation.current_node
      : null;
    let cursor = currentNode;
    while (cursor && !activeNodes.has(cursor)) {
      activeNodes.add(cursor);
      cursor = parentByNode.get(cursor) ?? null;
    }

    const attachments = await client.query<{
      source_node_id: string;
      source_message_id: string | null;
      reference_kind: string;
      source_reference: string;
      source_metadata: Record<string, unknown>;
    }>(
      `SELECT source_node_id, source_message_id, reference_kind, source_reference, source_metadata
       FROM comind.cm_archive_attachment_reference
       WHERE import_id=$1 AND source_conversation_id=$2
       ORDER BY source_node_id, reference_hash`,
      [importId, sourceConversationId]
    );

    const reconciliation = await client.query<{
      reconciliation_id: string;
      result: string;
      match_method: string;
      selected_conv_id: string | null;
      classification_counts: Record<string, unknown>;
      conflicts: unknown[];
      unresolved: unknown[];
      created_at: string;
    }>(
      `SELECT reconciliation_id::text, result, match_method, selected_conv_id::text,
              classification_counts, conflicts, unresolved, created_at::text
       FROM comind.cm_conversation_reconciliation_receipt
       WHERE import_id=$1 AND source_conversation_id=$2
       ORDER BY created_at DESC LIMIT 1`,
      [importId, sourceConversationId]
    );

    const selectedConvId = reconciliation.rows[0]?.selected_conv_id ?? null;
    let analytics: unknown[] = [];
    let promotionCandidates: unknown[] = [];
    if (selectedConvId) {
      const derivations = await client.query(
        `SELECT d.derivation_id::text, d.derivation_kind, d.source_kind, d.source_role,
                d.value_text, d.confidence::text, d.salience::text, d.uncertainty,
                d.conflict_state, d.evidence, d.metadata, d.created_at::text
         FROM comind.cm_conversation_derivation d
         JOIN comind.cm_conversation_derivation_run r USING (derivation_run_id)
         WHERE d.conv_id=$1
           AND r.derivation_run_id=(
             SELECT derivation_run_id FROM comind.cm_conversation_derivation_run
             WHERE conv_id=$1 ORDER BY created_at DESC LIMIT 1
           )
         ORDER BY d.created_at, d.derivation_id`,
        [selectedConvId]
      );
      analytics = derivations.rows;

      const candidates = await client.query(
        `SELECT candidate_id::text, target_type, proposed_title, proposed_content,
                rationale, confidence::text, salience::text, uncertainty, conflict_state,
                evidence, created_at::text
         FROM comind.cm_conversation_promotion_candidate
         WHERE conv_id=$1
         ORDER BY created_at DESC, candidate_id`,
        [selectedConvId]
      );
      promotionCandidates = candidates.rows;
    }

    const nodes: HistoryMessageNode[] = nodeResult.rows.map(row => ({
      sourceNodeId: row.source_node_id,
      parentSourceNodeId: row.parent_source_node_id,
      childSourceNodeIds: row.child_source_node_ids,
      sourceMessageId: row.source_message_id,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contentType: row.content_type,
      contentText: extractContentText(row.raw_node),
      onActiveBranch: activeNodes.has(row.source_node_id),
      rawNodeHash: row.raw_node_hash,
      normalizedMessageHash: row.normalized_message_hash,
    }));

    return {
      provenanceLayer: 'source_evidence' as const,
      importId,
      sourceConversationId,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      rawSourceHash: conversation.raw_source_hash,
      normalizedHash: conversation.normalized_hash,
      topologyHash: conversation.topology_hash,
      currentNode,
      nodes,
      attachments: attachments.rows,
      reconciliation: reconciliation.rows[0] ?? null,
      derived: {
        provenanceLayer: 'derived_evidence' as const,
        analytics,
        promotionCandidates,
        note: selectedConvId
          ? 'Derived observations are not source truth and are not canonical promotion.'
          : 'No selected live reconciliation exists, so CFR-001G live-derived analytics are not attached to this archive conversation.',
      },
    };
  });
}
