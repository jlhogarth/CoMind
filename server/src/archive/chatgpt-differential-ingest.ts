import path from 'node:path';
import type { PoolClient } from 'pg';

import { assertArchiveDatabaseSessionPrepared, pool } from '../db.js';
import {
  CHATGPT_ARCHIVE_PARSER_VERSION,
  CHATGPT_ARCHIVE_SCHEMA_VERSION,
  analyzeChatGptConversation,
  canonicalJson,
  sha256Canonical,
  sha256Text,
  type AttachmentReference,
  type ConversationAnalysis,
  type NodeObservation,
  type ParserEvent,
} from './chatgpt-export.js';
import {
  prepareChatGptExport,
  readChatGptConversationValues,
  type ChatGptSourceFileManifest,
  type PreparedChatGptExport,
} from './chatgpt-export-scan.js';

export const CHATGPT_ARCHIVE_HASH_VERSION = 'chatgpt-source-hashes-v1';

type ConversationClassification = 'baseline' | 'unchanged' | 'new' | 'content_changed' | 'structurally_changed' | 'raw_changed' | 'attachment_changed' | 'absent';
type NodeClassification = 'baseline' | 'unchanged' | 'new' | 'changed' | 'attachment_changed' | 'absent';

interface PreviousCheckpoint {
  checkpointId: string;
  importId: string;
  baselineId: string;
  sequenceNo: number;
  parserVersion: string;
  schemaVersion: string;
  hashVersion: string;
}

interface PreviousConversation {
  observationImportId: string;
  rawSourceHash: string;
  normalizedHash: string;
  topologyHash: string;
  attachmentSetHash: string | null;
}

interface PreviousNode {
  sourceNodeId: string;
  observationImportId: string;
  rawNodeHash: string;
  normalizedMessageHash: string | null;
  attachmentSetHash: string | null;
}

interface DifferentialAttempt {
  archiveStreamId: string;
  importId: string;
  sourceArchiveId: string;
  previous: PreviousCheckpoint;
  reusedCheckpointId: string | null;
  existingStatus: string | null;
}

export interface BaselineCheckpointResult {
  archiveStreamId: string;
  checkpointId: string;
  importId: string;
  baselineId: string;
  sequenceNo: 1;
  reused: boolean;
}

export interface DifferentialIngestResult {
  archiveStreamId: string;
  checkpointId: string | null;
  importId: string;
  sourceArchiveId: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  sequenceNo: number | null;
  reused: boolean;
  receiptSha256: string;
  deltaCounts: Record<string, number>;
  contentWrites: { conversations: number; nodes: number; attachments: number };
}

function branchTopologyHash(analysis: ConversationAnalysis): string {
  return sha256Canonical({ graphTopologyHash: analysis.topologyHash, currentNodeId: analysis.currentNodeId });
}

function attachmentTokens(attachment: AttachmentReference): string[] {
  const metadata = attachment.sourceMetadata;
  const candidates: unknown[] = [
    attachment.sourceReference,
    metadata.file_id,
    metadata.asset_pointer,
    metadata.attachment_id,
    metadata.id,
    metadata.name,
    metadata.filename,
    metadata.file_name,
  ];
  return [...new Set(candidates.filter((value): value is string => typeof value === 'string' && value.trim() !== '').flatMap((value) => {
    const normalized = value.trim().toLowerCase();
    const withoutScheme = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    return [normalized, withoutScheme, path.basename(withoutScheme)];
  }))];
}

function reconcileAttachmentAssets(analysis: ConversationAnalysis, files: ChatGptSourceFileManifest[]): void {
  const assets = files.filter((file) => file.fileRole === 'asset');
  for (const attachment of analysis.attachments) {
    const tokens = attachmentTokens(attachment);
    const matches = assets.filter((asset) => {
      const sourcePath = asset.sourcePath.toLowerCase();
      const base = path.basename(sourcePath);
      const stem = base.replace(/\.[^.]+$/, '');
      return tokens.some((token) => token === sourcePath || token === base || token === stem || sourcePath.endsWith(`/${token}`) || base.startsWith(`${token}.`));
    });
    if (matches.length === 1) {
      attachment.sourceMetadata = { ...attachment.sourceMetadata, asset_resolution: 'resolved', resolved_source_path: matches[0]!.sourcePath, resolved_sha256: matches[0]!.sha256 };
    } else if (matches.length === 0) {
      attachment.sourceMetadata = { ...attachment.sourceMetadata, asset_resolution: 'missing_in_export', candidate_tokens: tokens };
    } else {
      attachment.sourceMetadata = { ...attachment.sourceMetadata, asset_resolution: 'ambiguous', candidate_paths: matches.map((match) => match.sourcePath) };
    }
  }
}

function attachmentSetHash(attachments: AttachmentReference[]): string {
  return sha256Canonical(attachments
    .map((item) => ({
      sourceNodeId: item.sourceNodeId,
      sourceMessageId: item.sourceMessageId,
      referenceKind: item.referenceKind,
      sourceReference: item.sourceReference,
      referenceHash: item.referenceHash,
      sourceMetadata: item.sourceMetadata,
    }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))));
}

function nodeAttachmentSetHash(analysis: ConversationAnalysis, sourceNodeId: string): string {
  return attachmentSetHash(analysis.attachments.filter((item) => item.sourceNodeId === sourceNodeId));
}

function makeParserEvent(severity: ParserEvent['severity'], eventCode: string, detail: string, evidence: Record<string, unknown>, sourceConversationId: string | null = null): ParserEvent {
  return {
    severity,
    eventCode,
    sourceConversationId,
    sourceNodeId: null,
    sourceMessageId: null,
    detail,
    evidence,
    evidenceSha256: sha256Canonical({ severity, eventCode, detail, evidence, sourceConversationId }),
  };
}

async function insertParserEvent(client: PoolClient, importId: string, sourcePath: string, event: ParserEvent): Promise<void> {
  await client.query(
    `INSERT INTO comind.cm_archive_parser_event
       (import_id,severity,event_code,source_path,source_conversation_id,source_node_id,source_message_id,detail,evidence,evidence_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [importId,event.severity,event.eventCode,sourcePath,event.sourceConversationId,event.sourceNodeId,event.sourceMessageId,event.detail,JSON.stringify(event.evidence),event.evidenceSha256],
  );
}

async function quarantine(client: PoolClient, importId: string, sourcePath: string, raw: unknown, reasonCode: string, detail: string, sourceConversationId: string | null = null): Promise<void> {
  const fragment = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : { value: raw };
  await client.query(
    `INSERT INTO comind.cm_archive_quarantine
       (import_id,fragment_kind,source_path,source_conversation_id,raw_fragment,raw_fragment_sha256,reason_code,detail)
     VALUES ($1,'conversation',$2,$3,$4::jsonb,$5,$6,$7)
     ON CONFLICT (import_id,fragment_kind,raw_fragment_sha256,reason_code) DO NOTHING`,
    [importId,sourcePath,sourceConversationId,JSON.stringify(fragment),sha256Canonical(fragment),reasonCode,detail],
  );
}

async function ensureStream(client: PoolClient, sourceIdentityKey: string): Promise<string> {
  const key = sourceIdentityKey.trim();
  if (!key) throw new Error('sourceIdentityKey is required');
  await client.query(
    `INSERT INTO comind.cm_archive_stream(source_system,source_identity_key,metadata)
     VALUES ('chatgpt',$1,'{"scope":"governed_user_export_series"}'::jsonb)
     ON CONFLICT (source_system,source_identity_key) DO NOTHING`, [key],
  );
  const id = (await client.query<{ archive_stream_id: string }>(
    `SELECT archive_stream_id::text FROM comind.cm_archive_stream WHERE source_system='chatgpt' AND source_identity_key=$1`, [key],
  )).rows[0]?.archive_stream_id;
  if (!id) throw new Error('Archive stream identity could not be established');
  return id;
}

async function latestCheckpoint(client: PoolClient, streamId: string): Promise<PreviousCheckpoint | null> {
  const row = (await client.query<{
    checkpoint_id: string; import_id: string; baseline_id: string; sequence_no: string; parser_version: string; schema_version: string; hash_version: string;
  }>(
    `SELECT checkpoint_id::text,import_id::text,baseline_id::text,sequence_no::text,parser_version,schema_version,hash_version
       FROM comind.cm_archive_checkpoint WHERE archive_stream_id=$1::uuid ORDER BY sequence_no DESC LIMIT 1`, [streamId],
  )).rows[0];
  return row ? {
    checkpointId: row.checkpoint_id,
    importId: row.import_id,
    baselineId: row.baseline_id,
    sequenceNo: Number(row.sequence_no),
    parserVersion: row.parser_version,
    schemaVersion: row.schema_version,
    hashVersion: row.hash_version,
  } : null;
}

async function loadPreviousConversation(client: PoolClient, previousImportId: string, conversationId: string): Promise<PreviousConversation | null> {
  const row = (await client.query<{
    observation_import_id: string; raw_source_hash: string; normalized_hash: string; topology_hash: string; attachment_set_hash: string | null;
  }>(
    `SELECT observation_import_id::text,raw_source_hash::text,normalized_hash::text,topology_hash::text,attachment_set_hash::text
       FROM comind.cm_archive_snapshot_conversation
      WHERE import_id=$1::uuid AND source_conversation_id=$2 AND present`, [previousImportId,conversationId],
  )).rows[0];
  return row ? {
    observationImportId: row.observation_import_id,
    rawSourceHash: row.raw_source_hash,
    normalizedHash: row.normalized_hash,
    topologyHash: row.topology_hash,
    attachmentSetHash: row.attachment_set_hash,
  } : null;
}

async function loadPreviousNodes(client: PoolClient, previousImportId: string, conversationId: string): Promise<Map<string, PreviousNode>> {
  const rows = (await client.query<{
    source_node_id: string; observation_import_id: string; raw_node_hash: string; normalized_message_hash: string | null; attachment_set_hash: string | null;
  }>(
    `SELECT source_node_id,observation_import_id::text,raw_node_hash::text,normalized_message_hash::text,attachment_set_hash::text
       FROM comind.cm_archive_snapshot_node
      WHERE import_id=$1::uuid AND source_conversation_id=$2 AND present`, [previousImportId,conversationId],
  )).rows;
  return new Map(rows.map((row) => [row.source_node_id, {
    sourceNodeId: row.source_node_id,
    observationImportId: row.observation_import_id,
    rawNodeHash: row.raw_node_hash,
    normalizedMessageHash: row.normalized_message_hash,
    attachmentSetHash: row.attachment_set_hash,
  }]));
}

function classifyConversation(previous: PreviousConversation | null, analysis: ConversationAnalysis, topologyHash: string, attachmentsHash: string): ConversationClassification {
  if (!previous) return 'new';
  if (previous.topologyHash !== topologyHash) return 'structurally_changed';
  if (previous.normalizedHash !== analysis.normalizedHash) return 'content_changed';
  if (previous.rawSourceHash !== analysis.rawSourceHash) return 'raw_changed';
  if (previous.attachmentSetHash !== attachmentsHash) return 'attachment_changed';
  return 'unchanged';
}

function classifyNode(previous: PreviousNode | undefined, node: NodeObservation, attachmentsHash: string): NodeClassification {
  if (!previous) return 'new';
  if (previous.rawNodeHash !== node.rawNodeHash || previous.normalizedMessageHash !== node.normalizedMessageHash) return 'changed';
  if (previous.attachmentSetHash !== attachmentsHash) return 'attachment_changed';
  return 'unchanged';
}

async function persistConversationObservation(client: PoolClient, importId: string, analysis: ConversationAnalysis, topologyHash: string): Promise<void> {
  if (!analysis.sourceConversationId) throw new Error('Cannot persist conversation without source ID');
  await client.query(
    `INSERT INTO comind.cm_archive_conversation_observation
       (import_id,source_conversation_id,title,source_created_at,source_updated_at,created_at,updated_at,
        raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
    [importId,analysis.sourceConversationId,analysis.title,JSON.stringify(analysis.sourceCreatedAt),JSON.stringify(analysis.sourceUpdatedAt),analysis.createdAt,analysis.updatedAt,analysis.rawSourceHash,analysis.normalizedHash,topologyHash,analysis.nodeCount,analysis.messageCount,analysis.attachmentReferenceCount,JSON.stringify(analysis.rawConversation)],
  );
}

async function persistNodeObservation(client: PoolClient, importId: string, conversationId: string, node: NodeObservation, attachments: AttachmentReference[]): Promise<void> {
  await client.query(
    `INSERT INTO comind.cm_archive_node_observation
       (import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
        source_created_at,source_updated_at,created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb)`,
    [importId,conversationId,node.sourceNodeId,node.parentSourceNodeId,JSON.stringify(node.childSourceNodeIds),node.sourceMessageId,node.role,JSON.stringify(node.sourceCreatedAt),JSON.stringify(node.sourceUpdatedAt),node.createdAt,node.updatedAt,node.contentType,node.rawNodeHash,node.normalizedMessageHash,JSON.stringify(node.rawNode)],
  );
  for (const attachment of attachments) {
    await client.query(
      `INSERT INTO comind.cm_archive_attachment_reference
         (import_id,source_conversation_id,source_node_id,source_message_id,reference_kind,source_reference,source_metadata,reference_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [importId,conversationId,attachment.sourceNodeId,attachment.sourceMessageId,attachment.referenceKind,attachment.sourceReference,JSON.stringify(attachment.sourceMetadata),attachment.referenceHash],
    );
  }
}

async function createDifferentialAttempt(client: PoolClient, sourceIdentityKey: string, prepared: PreparedChatGptExport): Promise<DifferentialAttempt> {
  await client.query('BEGIN');
  try {
    const streamId = await ensureStream(client, sourceIdentityKey);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`stream:${streamId}`]);
    const previous = await latestCheckpoint(client, streamId);
    if (!previous) throw new Error('Differential ingestion requires an accepted certified baseline checkpoint first');
    if (previous.parserVersion !== CHATGPT_ARCHIVE_PARSER_VERSION || previous.schemaVersion !== CHATGPT_ARCHIVE_SCHEMA_VERSION || previous.hashVersion !== CHATGPT_ARCHIVE_HASH_VERSION) {
      throw new Error('Latest checkpoint parser/schema/hash version is incompatible; reviewed reprocessing is required');
    }

    await client.query(
      `INSERT INTO comind.cm_archive_source(source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_uri,source_metadata)
       VALUES ('chatgpt',$1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (source_system,source_archive_sha256) DO NOTHING`,
      [prepared.sourceArchiveName,prepared.sourceArchiveSha256,prepared.sourceArchiveBytes,prepared.sourceUri,JSON.stringify({ inventoryVersion: 2, differential: true })],
    );
    const sourceArchiveId = (await client.query<{ source_archive_id: string }>(
      `SELECT source_archive_id::text FROM comind.cm_archive_source WHERE source_system='chatgpt' AND source_archive_sha256=$1`, [prepared.sourceArchiveSha256],
    )).rows[0]?.source_archive_id;
    if (!sourceArchiveId) throw new Error('Archive source identity could not be established');

    for (const file of prepared.files) {
      await client.query(
        `INSERT INTO comind.cm_archive_source_file(source_archive_id,source_path,file_role,byte_length,sha256,media_type,source_metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'{}'::jsonb) ON CONFLICT (source_archive_id,source_path) DO NOTHING`,
        [sourceArchiveId,file.sourcePath,file.fileRole,file.byteLength,file.sha256,file.mediaType],
      );
    }

    let row = (await client.query<{ import_id: string; status: string; import_mode: string }>(
      `SELECT import_id::text,status,import_mode FROM comind.cm_archive_import
       WHERE source_archive_id=$1::uuid AND parser_version=$2 AND schema_version=$3 ORDER BY attempt_number DESC LIMIT 1`,
      [sourceArchiveId,CHATGPT_ARCHIVE_PARSER_VERSION,CHATGPT_ARCHIVE_SCHEMA_VERSION],
    )).rows[0];
    if (!row) {
      row = (await client.query<{ import_id: string; status: string; import_mode: string }>(
        `INSERT INTO comind.cm_archive_import(source_archive_id,parser_version,schema_version,attempt_number,import_mode)
         VALUES ($1,$2,$3,1,'differential') RETURNING import_id::text,status,import_mode`,
        [sourceArchiveId,CHATGPT_ARCHIVE_PARSER_VERSION,CHATGPT_ARCHIVE_SCHEMA_VERSION],
      )).rows[0];
    }
    if (!row) throw new Error('Differential import attempt could not be established');
    if (row.import_mode !== 'differential') throw new Error('Archive source already has a non-differential parser attempt; reviewed reprocessing is required');

    const existingCheckpoint = (await client.query<{ checkpoint_id: string }>(
      `SELECT checkpoint_id::text FROM comind.cm_archive_checkpoint WHERE import_id=$1::uuid`, [row.import_id],
    )).rows[0]?.checkpoint_id ?? null;

    await client.query('COMMIT');
    return { archiveStreamId: streamId, importId: row.import_id, sourceArchiveId, previous, reusedCheckpointId: existingCheckpoint, existingStatus: row.status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function persistSnapshotForConversation(client: PoolClient, attempt: DifferentialAttempt, sourcePath: string, analysis: ConversationAnalysis): Promise<{ classification: ConversationClassification; contentConversationWrite: number; contentNodeWrites: number; attachmentWrites: number }> {
  const conversationId = analysis.sourceConversationId;
  if (!conversationId) throw new Error('Conversation source ID is required');
  const duplicate = await client.query(`SELECT 1 FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid AND source_conversation_id=$2`, [attempt.importId,conversationId]);
  if ((duplicate.rowCount ?? 0) > 0) throw new Error(`DUPLICATE_CONVERSATION_ID:${conversationId}`);

  const previous = await loadPreviousConversation(client, attempt.previous.importId, conversationId);
  const topologyHash = branchTopologyHash(analysis);
  const attachmentsHash = attachmentSetHash(analysis.attachments);
  const classification = classifyConversation(previous,analysis,topologyHash,attachmentsHash);

  if (classification === 'unchanged' && previous) {
    await client.query(
      `INSERT INTO comind.cm_archive_snapshot_conversation
         (import_id,source_conversation_id,classification,present,prior_observation_import_id,observation_import_id,
          raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,source_path,evidence)
       VALUES ($1,$2,'unchanged',true,$3,$3,$4,$5,$6,$7,$8,'{"content_reused":true}'::jsonb)`,
      [attempt.importId,conversationId,previous.observationImportId,analysis.rawSourceHash,analysis.normalizedHash,topologyHash,attachmentsHash,sourcePath],
    );
    await client.query(
      `INSERT INTO comind.cm_archive_snapshot_node
         (import_id,source_conversation_id,source_node_id,classification,present,prior_observation_import_id,observation_import_id,
          raw_node_hash,normalized_message_hash,attachment_set_hash,evidence)
       SELECT $1,source_conversation_id,source_node_id,'unchanged',true,observation_import_id,observation_import_id,
              raw_node_hash,normalized_message_hash,attachment_set_hash,'{"content_reused":true}'::jsonb
         FROM comind.cm_archive_snapshot_node
        WHERE import_id=$2::uuid AND source_conversation_id=$3 AND present`,
      [attempt.importId,attempt.previous.importId,conversationId],
    );
    return { classification, contentConversationWrite: 0, contentNodeWrites: 0, attachmentWrites: 0 };
  }

  await persistConversationObservation(client,attempt.importId,analysis,topologyHash);
  await client.query(
    `INSERT INTO comind.cm_archive_snapshot_conversation
       (import_id,source_conversation_id,classification,present,prior_observation_import_id,observation_import_id,
        raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,source_path,evidence)
     VALUES ($1,$2,$3,true,$4,$1,$5,$6,$7,$8,$9,$10::jsonb)`,
    [attempt.importId,conversationId,classification,previous?.observationImportId ?? null,analysis.rawSourceHash,analysis.normalizedHash,topologyHash,attachmentsHash,sourcePath,JSON.stringify({ content_reused: false })],
  );

  const previousNodes = await loadPreviousNodes(client,attempt.previous.importId,conversationId);
  const currentNodeIds = new Set<string>();
  let nodeWrites = 0;
  let attachmentWrites = 0;
  for (const node of analysis.nodes) {
    currentNodeIds.add(node.sourceNodeId);
    const nodeAttachments = analysis.attachments.filter((item) => item.sourceNodeId === node.sourceNodeId);
    const nodeAttachmentsHash = nodeAttachmentSetHash(analysis,node.sourceNodeId);
    const prior = previousNodes.get(node.sourceNodeId);
    const nodeClassification = classifyNode(prior,node,nodeAttachmentsHash);
    let originImportId: string;
    if (nodeClassification === 'unchanged' && prior) originImportId = prior.observationImportId;
    else {
      await persistNodeObservation(client,attempt.importId,conversationId,node,nodeAttachments);
      originImportId = attempt.importId;
      nodeWrites += 1;
      attachmentWrites += nodeAttachments.length;
    }
    await client.query(
      `INSERT INTO comind.cm_archive_snapshot_node
         (import_id,source_conversation_id,source_node_id,classification,present,prior_observation_import_id,observation_import_id,
          raw_node_hash,normalized_message_hash,attachment_set_hash,evidence)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10::jsonb)`,
      [attempt.importId,conversationId,node.sourceNodeId,nodeClassification,prior?.observationImportId ?? null,originImportId,node.rawNodeHash,node.normalizedMessageHash,nodeAttachmentsHash,JSON.stringify({ content_reused: originImportId !== attempt.importId })],
    );
  }

  for (const [nodeId, prior] of previousNodes) {
    if (currentNodeIds.has(nodeId)) continue;
    await client.query(
      `INSERT INTO comind.cm_archive_snapshot_node
         (import_id,source_conversation_id,source_node_id,classification,present,prior_observation_import_id,observation_import_id,
          raw_node_hash,normalized_message_hash,attachment_set_hash,evidence)
       VALUES ($1,$2,$3,'absent',false,$4,NULL,NULL,NULL,NULL,'{"absence_is_not_deletion":true}'::jsonb)`,
      [attempt.importId,conversationId,nodeId,prior.observationImportId],
    );
  }

  for (const event of analysis.events) await insertParserEvent(client,attempt.importId,sourcePath,event);
  return { classification, contentConversationWrite: 1, contentNodeWrites: nodeWrites, attachmentWrites };
}

async function finalizeDifferential(client: PoolClient, attempt: DifferentialAttempt, sourceCounts: { conversations: number; messages: number; nodes: number; assets: number }, contentWrites: { conversations: number; nodes: number; attachments: number }): Promise<DifferentialIngestResult> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`stream:${attempt.archiveStreamId}`]);
    const currentLatest = await latestCheckpoint(client,attempt.archiveStreamId);
    if (!currentLatest || currentLatest.checkpointId !== attempt.previous.checkpointId) throw new Error('Accepted checkpoint advanced during differential import; retry against the new head');

    await client.query(
      `INSERT INTO comind.cm_archive_snapshot_conversation
         (import_id,source_conversation_id,classification,present,prior_observation_import_id,observation_import_id,
          raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,source_path,evidence)
       SELECT $1,prev.source_conversation_id,'absent',false,prev.observation_import_id,NULL,NULL,NULL,NULL,NULL,NULL,
              '{"absence_is_not_deletion":true}'::jsonb
         FROM comind.cm_archive_snapshot_conversation prev
        WHERE prev.import_id=$2::uuid AND prev.present
          AND NOT EXISTS (
            SELECT 1 FROM comind.cm_archive_snapshot_conversation cur
             WHERE cur.import_id=$1::uuid AND cur.source_conversation_id=prev.source_conversation_id
          )`,
      [attempt.importId,attempt.previous.importId],
    );

    const measured = (await client.query<{
      present_conversations: string; present_nodes: string; present_messages: string; parser_errors: string; parser_warnings: string; quarantined: string;
    }>(
      `SELECT
         (SELECT count(*) FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid AND present)::text AS present_conversations,
         (SELECT count(*) FROM comind.cm_archive_snapshot_node WHERE import_id=$1::uuid AND present)::text AS present_nodes,
         (SELECT count(*) FROM comind.cm_archive_snapshot_node sn JOIN comind.cm_archive_node_observation n
            ON n.import_id=sn.observation_import_id AND n.source_conversation_id=sn.source_conversation_id AND n.source_node_id=sn.source_node_id
           WHERE sn.import_id=$1::uuid AND sn.present AND n.source_message_id IS NOT NULL)::text AS present_messages,
         (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1::uuid AND severity='ERROR')::text AS parser_errors,
         (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1::uuid AND severity='WARNING')::text AS parser_warnings,
         (SELECT count(*) FROM comind.cm_archive_quarantine WHERE import_id=$1::uuid)::text AS quarantined`, [attempt.importId],
    )).rows[0];
    if (!measured) throw new Error('Differential reconciliation could not be measured');

    const snapshotCounts = { conversations: Number(measured.present_conversations), nodes: Number(measured.present_nodes), messages: Number(measured.present_messages) };
    const parserErrors = Number(measured.parser_errors);
    const parserWarnings = Number(measured.parser_warnings);
    const quarantined = Number(measured.quarantined);
    const countsMatch = snapshotCounts.conversations + quarantined === sourceCounts.conversations
      && snapshotCounts.nodes === sourceCounts.nodes
      && snapshotCounts.messages === sourceCounts.messages;
    const status: 'PASS' | 'WARN' | 'FAIL' = !countsMatch || parserErrors > 0 ? 'FAIL' : parserWarnings > 0 ? 'WARN' : 'PASS';

    const deltaRows = (await client.query<{ classification: string; count: string }>(
      `SELECT classification,count(*)::text AS count FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid GROUP BY classification ORDER BY classification`, [attempt.importId],
    )).rows;
    const deltaCounts: Record<string, number> = {};
    for (const row of deltaRows) deltaCounts[row.classification] = Number(row.count);

    const completedAt = new Date().toISOString();
    const sequenceNo = attempt.previous.sequenceNo + 1;
    const receipt = {
      version: 1,
      mode: 'differential',
      importId: attempt.importId,
      sourceArchiveId: attempt.sourceArchiveId,
      archiveStreamId: attempt.archiveStreamId,
      predecessorCheckpointId: attempt.previous.checkpointId,
      baselineId: attempt.previous.baselineId,
      sequenceNo,
      parserVersion: CHATGPT_ARCHIVE_PARSER_VERSION,
      schemaVersion: CHATGPT_ARCHIVE_SCHEMA_VERSION,
      hashVersion: CHATGPT_ARCHIVE_HASH_VERSION,
      completedAt,
      status,
      sourceCounts,
      snapshotCounts,
      deltaCounts,
      contentWrites,
      parserErrors,
      parserWarnings,
      quarantined,
      semantics: { absence_is_not_deletion: true, unchanged_content_reused: true, checkpoint_advances_only_on_pass_or_warn: true },
    };
    const receiptSha256 = sha256Text(canonicalJson(receipt));
    const reconciliation = { countsMatch, snapshotCounts, deltaCounts, contentWrites, parserErrors, parserWarnings, quarantined };

    await client.query(
      `UPDATE comind.cm_archive_import
          SET status=$2,completed_at=$3,source_conversation_count=$4,source_message_count=$5,source_node_count=$6,source_attachment_count=$7,
              imported_conversation_count=$8,imported_message_count=$9,imported_node_count=$10,imported_attachment_count=$11,
              parser_error_count=$12,parser_warning_count=$13,reconciliation=$14::jsonb,receipt=$15::jsonb,receipt_sha256=$16
        WHERE import_id=$1::uuid`,
      [attempt.importId,status,completedAt,sourceCounts.conversations,sourceCounts.messages,sourceCounts.nodes,sourceCounts.assets,
        contentWrites.conversations,null,contentWrites.nodes,contentWrites.attachments,parserErrors,parserWarnings,JSON.stringify(reconciliation),JSON.stringify(receipt),receiptSha256],
    );

    if (status === 'FAIL') {
      await client.query('COMMIT');
      return { archiveStreamId: attempt.archiveStreamId, checkpointId: null, importId: attempt.importId, sourceArchiveId: attempt.sourceArchiveId, status, sequenceNo: null, reused: false, receiptSha256, deltaCounts, contentWrites };
    }

    const checkpointId = (await client.query<{ checkpoint_id: string }>(
      `INSERT INTO comind.cm_archive_checkpoint
         (archive_stream_id,import_id,baseline_id,checkpoint_kind,sequence_no,predecessor_checkpoint_id,
          parser_version,schema_version,hash_version,receipt,receipt_sha256)
       VALUES ($1,$2,$3,'differential',$4,$5,$6,$7,$8,$9::jsonb,$10)
       RETURNING checkpoint_id::text`,
      [attempt.archiveStreamId,attempt.importId,attempt.previous.baselineId,sequenceNo,attempt.previous.checkpointId,CHATGPT_ARCHIVE_PARSER_VERSION,CHATGPT_ARCHIVE_SCHEMA_VERSION,CHATGPT_ARCHIVE_HASH_VERSION,JSON.stringify(receipt),receiptSha256],
    )).rows[0]?.checkpoint_id;
    if (!checkpointId) throw new Error('Accepted differential checkpoint was not created');
    await client.query('COMMIT');
    return { archiveStreamId: attempt.archiveStreamId, checkpointId, importId: attempt.importId, sourceArchiveId: attempt.sourceArchiveId, status, sequenceNo, reused: false, receiptSha256, deltaCounts, contentWrites };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function establishChatGptBaselineCheckpoint(options: { sourceIdentityKey: string; importId: string }): Promise<BaselineCheckpointResult> {
  assertArchiveDatabaseSessionPrepared();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const streamId = await ensureStream(client,options.sourceIdentityKey);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`stream:${streamId}`]);
    const existing = (await client.query<{ checkpoint_id: string; baseline_id: string }>(
      `SELECT checkpoint_id::text,baseline_id::text FROM comind.cm_archive_checkpoint WHERE archive_stream_id=$1::uuid ORDER BY sequence_no LIMIT 1`, [streamId],
    )).rows[0];
    if (existing) {
      const current = await client.query(`SELECT 1 FROM comind.cm_archive_checkpoint WHERE checkpoint_id=$1::uuid AND import_id=$2::uuid AND sequence_no=1`, [existing.checkpoint_id,options.importId]);
      if ((current.rowCount ?? 0) !== 1) throw new Error('Archive stream already has a different certified baseline');
      await client.query('COMMIT');
      return { archiveStreamId: streamId, checkpointId: existing.checkpoint_id, importId: options.importId, baselineId: existing.baseline_id, sequenceNo: 1, reused: true };
    }

    const source = (await client.query<{ status: string; import_mode: string; parser_version: string; schema_version: string; baseline_id: string }>(
      `SELECT i.status,i.import_mode,i.parser_version,i.schema_version,b.baseline_id::text
         FROM comind.cm_archive_import i
         JOIN comind.cm_conversation_history_baseline b ON b.import_id=i.import_id
        WHERE i.import_id=$1::uuid`, [options.importId],
    )).rows[0];
    if (!source) throw new Error('Initial baseline import must be explicitly certified before checkpoint establishment');
    if (source.status !== 'PASS' || source.import_mode !== 'full_snapshot') throw new Error('Initial checkpoint requires a certified PASS full_snapshot import');
    if (source.parser_version !== CHATGPT_ARCHIVE_PARSER_VERSION || source.schema_version !== CHATGPT_ARCHIVE_SCHEMA_VERSION) throw new Error('Certified baseline parser/schema version is incompatible with current differential ingestion');

    const attachments = (await client.query<{ source_conversation_id: string; source_node_id: string; reference_kind: string; source_reference: string; reference_hash: string; source_metadata: Record<string, unknown>; source_message_id: string | null }>(
      `SELECT source_conversation_id,source_node_id,reference_kind,source_reference,reference_hash::text,source_metadata,source_message_id
         FROM comind.cm_archive_attachment_reference WHERE import_id=$1::uuid ORDER BY source_conversation_id,source_node_id,reference_hash`, [options.importId],
    )).rows;
    const byConversation = new Map<string, AttachmentReference[]>();
    const byNode = new Map<string, AttachmentReference[]>();
    for (const row of attachments) {
      const item: AttachmentReference = { sourceNodeId: row.source_node_id, sourceMessageId: row.source_message_id, referenceKind: row.reference_kind, sourceReference: row.source_reference, sourceMetadata: row.source_metadata, referenceHash: row.reference_hash };
      const conversationItems = byConversation.get(row.source_conversation_id) ?? [];
      conversationItems.push(item); byConversation.set(row.source_conversation_id,conversationItems);
      const nodeKey = `${row.source_conversation_id}\u0000${row.source_node_id}`;
      const nodeItems = byNode.get(nodeKey) ?? [];
      nodeItems.push(item); byNode.set(nodeKey,nodeItems);
    }

    const conversations = (await client.query<{ source_conversation_id: string; raw_source_hash: string; normalized_hash: string; topology_hash: string }>(
      `SELECT source_conversation_id,raw_source_hash::text,normalized_hash::text,topology_hash::text
         FROM comind.cm_archive_conversation_observation WHERE import_id=$1::uuid ORDER BY source_conversation_id`, [options.importId],
    )).rows;
    for (const row of conversations) {
      await client.query(
        `INSERT INTO comind.cm_archive_snapshot_conversation
           (import_id,source_conversation_id,classification,present,observation_import_id,raw_source_hash,normalized_hash,topology_hash,attachment_set_hash,evidence)
         VALUES ($1,$2,'baseline',true,$1,$3,$4,$5,$6,'{"certified_baseline":true}'::jsonb)`,
        [options.importId,row.source_conversation_id,row.raw_source_hash,row.normalized_hash,row.topology_hash,attachmentSetHash(byConversation.get(row.source_conversation_id) ?? [])],
      );
    }

    const nodes = (await client.query<{ source_conversation_id: string; source_node_id: string; raw_node_hash: string; normalized_message_hash: string | null }>(
      `SELECT source_conversation_id,source_node_id,raw_node_hash::text,normalized_message_hash::text
         FROM comind.cm_archive_node_observation WHERE import_id=$1::uuid ORDER BY source_conversation_id,source_node_id`, [options.importId],
    )).rows;
    for (const row of nodes) {
      await client.query(
        `INSERT INTO comind.cm_archive_snapshot_node
           (import_id,source_conversation_id,source_node_id,classification,present,observation_import_id,raw_node_hash,normalized_message_hash,attachment_set_hash,evidence)
         VALUES ($1,$2,$3,'baseline',true,$1,$4,$5,$6,'{"certified_baseline":true}'::jsonb)`,
        [options.importId,row.source_conversation_id,row.source_node_id,row.raw_node_hash,row.normalized_message_hash,attachmentSetHash(byNode.get(`${row.source_conversation_id}\u0000${row.source_node_id}`) ?? [])],
      );
    }

    const receipt = {
      version: 1,
      mode: 'baseline',
      importId: options.importId,
      baselineId: source.baseline_id,
      archiveStreamId: streamId,
      sequenceNo: 1,
      parserVersion: source.parser_version,
      schemaVersion: source.schema_version,
      hashVersion: CHATGPT_ARCHIVE_HASH_VERSION,
      membership: { conversations: conversations.length, nodes: nodes.length },
      sourceContentReused: true,
    };
    const receiptSha256 = sha256Text(canonicalJson(receipt));
    const checkpointId = (await client.query<{ checkpoint_id: string }>(
      `INSERT INTO comind.cm_archive_checkpoint
         (archive_stream_id,import_id,baseline_id,checkpoint_kind,sequence_no,predecessor_checkpoint_id,parser_version,schema_version,hash_version,receipt,receipt_sha256)
       VALUES ($1,$2,$3,'baseline',1,NULL,$4,$5,$6,$7::jsonb,$8) RETURNING checkpoint_id::text`,
      [streamId,options.importId,source.baseline_id,source.parser_version,source.schema_version,CHATGPT_ARCHIVE_HASH_VERSION,JSON.stringify(receipt),receiptSha256],
    )).rows[0]?.checkpoint_id;
    if (!checkpointId) throw new Error('Baseline checkpoint insert did not return an id');
    await client.query('COMMIT');
    return { archiveStreamId: streamId, checkpointId, importId: options.importId, baselineId: source.baseline_id, sequenceNo: 1, reused: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestChatGptDifferentialExport(options: { sourceIdentityKey: string; inputPath: string }): Promise<DifferentialIngestResult> {
  assertArchiveDatabaseSessionPrepared();
  const prepared = await prepareChatGptExport(options.inputPath);
  const client = await pool.connect();
  let sourceLocked = false;
  let streamLocked = false;
  const sourceLockKey = `archive:${prepared.sourceArchiveSha256}`;
  const streamLockKey = `archive-stream:${options.sourceIdentityKey.trim()}`;
  try {
    sourceLocked = (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[sourceLockKey])).rows[0]?.locked === true;
    if (!sourceLocked) throw new Error('Archive source is busy; retry after the active operation terminates');
    streamLocked = (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[streamLockKey])).rows[0]?.locked === true;
    if (!streamLocked) throw new Error('Archive stream is busy; retry after the active operation terminates');

    const attempt = await createDifferentialAttempt(client,options.sourceIdentityKey,prepared);
    if (attempt.reusedCheckpointId && attempt.existingStatus && ['PASS','WARN'].includes(attempt.existingStatus)) {
      const priorReceipt = (await client.query<{ receipt_sha256: string; receipt: Record<string, unknown> }>(
        `SELECT receipt_sha256::text,receipt FROM comind.cm_archive_import WHERE import_id=$1::uuid`, [attempt.importId],
      )).rows[0];
      const receipt = priorReceipt?.receipt ?? {};
      return {
        archiveStreamId: attempt.archiveStreamId,
        checkpointId: attempt.reusedCheckpointId,
        importId: attempt.importId,
        sourceArchiveId: attempt.sourceArchiveId,
        status: attempt.existingStatus as 'PASS' | 'WARN',
        sequenceNo: typeof receipt.sequenceNo === 'number' ? receipt.sequenceNo : null,
        reused: true,
        receiptSha256: priorReceipt?.receipt_sha256 ?? '',
        deltaCounts: typeof receipt.deltaCounts === 'object' && receipt.deltaCounts !== null ? receipt.deltaCounts as Record<string, number> : {},
        contentWrites: typeof receipt.contentWrites === 'object' && receipt.contentWrites !== null ? receipt.contentWrites as { conversations: number; nodes: number; attachments: number } : { conversations: 0, nodes: 0, attachments: 0 },
      };
    }
    if (attempt.existingStatus !== 'PENDING') throw new Error(`Differential source has finalized non-accepted import status ${attempt.existingStatus}; reviewed reprocessing is required`);

    const committed = await client.query<{ count: string }>(
      `SELECT ((SELECT count(*) FROM comind.cm_archive_snapshot_conversation WHERE import_id=$1::uuid)
             +(SELECT count(*) FROM comind.cm_archive_snapshot_node WHERE import_id=$1::uuid)
             +(SELECT count(*) FROM comind.cm_archive_conversation_observation WHERE import_id=$1::uuid)
             +(SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1::uuid)
             +(SELECT count(*) FROM comind.cm_archive_quarantine WHERE import_id=$1::uuid))::text AS count`, [attempt.importId],
    );
    if (Number(committed.rows[0]?.count ?? 0) > 0) throw new Error('Existing PENDING differential import contains committed evidence; explicit recovery is required before retry');

    const sourceCounts = { conversations: 0, messages: 0, nodes: 0, assets: prepared.files.filter((file) => file.fileRole === 'asset').length };
    const contentWrites = { conversations: 0, nodes: 0, attachments: 0 };

    for (const conversationFile of prepared.conversationFiles) {
      try {
        for await (const value of readChatGptConversationValues(conversationFile.absolutePath)) {
          sourceCounts.conversations += 1;
          const analysis = analyzeChatGptConversation(value);
          await client.query('BEGIN');
          try {
            if (!analysis) {
              await quarantine(client,attempt.importId,conversationFile.sourcePath,value,'INVALID_CONVERSATION_SHAPE','Top-level conversation value is not an object');
              await insertParserEvent(client,attempt.importId,conversationFile.sourcePath,makeParserEvent('ERROR','INVALID_CONVERSATION_SHAPE','Top-level conversation value is not an object',{ rawFragmentSha256: sha256Canonical(value) }));
            } else {
              sourceCounts.messages += analysis.messageCount;
              sourceCounts.nodes += analysis.nodeCount;
              reconcileAttachmentAssets(analysis,prepared.files);
              try {
                const result = await persistSnapshotForConversation(client,attempt,conversationFile.sourcePath,analysis);
                contentWrites.conversations += result.contentConversationWrite;
                contentWrites.nodes += result.contentNodeWrites;
                contentWrites.attachments += result.attachmentWrites;
              } catch (error) {
                if (String(error).includes('DUPLICATE_CONVERSATION_ID:')) {
                  await quarantine(client,attempt.importId,conversationFile.sourcePath,analysis.rawConversation,'DUPLICATE_CONVERSATION_ID','Source conversation identifier appears more than once across export shards.',analysis.sourceConversationId);
                  await insertParserEvent(client,attempt.importId,conversationFile.sourcePath,makeParserEvent('ERROR','DUPLICATE_CONVERSATION_ID','Source conversation identifier appears more than once across export shards.',{ sourceConversationId: analysis.sourceConversationId },analysis.sourceConversationId));
                } else throw error;
              }
            }
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        }
      } catch (error) {
        await client.query('BEGIN');
        try {
          await insertParserEvent(client,attempt.importId,conversationFile.sourcePath,makeParserEvent('ERROR','CONVERSATION_FILE_PARSE_FAILURE',String(error),{ sourcePath: conversationFile.sourcePath, fileSha256: conversationFile.sha256 }));
          await client.query('COMMIT');
        } catch (persistError) {
          await client.query('ROLLBACK');
          throw persistError;
        }
        break;
      }
    }

    return await finalizeDifferential(client,attempt,sourceCounts,contentWrites);
  } finally {
    if (streamLocked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[streamLockKey]);
    if (sourceLocked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[sourceLockKey]);
    client.release();
    await prepared.cleanup();
  }
}
