import { assertArchiveDatabaseSessionPrepared, pool } from '../db.js';
import { canonicalJson, sha256Text } from './chatgpt-export.js';

export const CHIST_PIT_DIFF_VERSION = 'chist-pit-diff-v1';

type Classification = 'unchanged' | 'content_changed' | 'structurally_changed' | 'new_in_comparison' | 'absent_in_comparison';

interface ImportRow {
  import_id: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'PENDING';
  parser_version: string;
  schema_version: string;
  imported_conversation_count: string | null;
  receipt_sha256: string | null;
  source_archive_id: string;
  source_archive_sha256: string;
  source_archive_name: string;
}

interface ConversationRow {
  source_conversation_id: string;
  title: string | null;
  normalized_hash: string;
  topology_hash: string;
  node_count: number;
  message_count: number;
  attachment_reference_count: number;
  updated_at: string | null;
}

interface DiffObservation {
  sourceConversationId: string;
  classification: Classification;
  baselineNormalizedHash: string | null;
  baselineTopologyHash: string | null;
  comparisonNormalizedHash: string | null;
  comparisonTopologyHash: string | null;
  baselineMessageCount: number | null;
  comparisonMessageCount: number | null;
  baselineNodeCount: number | null;
  comparisonNodeCount: number | null;
  evidence: Record<string, unknown>;
  observationSha256: string;
}

async function loadImport(client: import('pg').PoolClient, importId: string): Promise<ImportRow> {
  const row = (await client.query<ImportRow>(
    `SELECT i.import_id::text,i.status,i.parser_version,i.schema_version,
            i.imported_conversation_count::text,i.receipt_sha256::text,
            s.source_archive_id::text,s.source_archive_sha256::text,s.source_archive_name
     FROM comind.cm_archive_import i
     JOIN comind.cm_archive_source s USING(source_archive_id)
     WHERE i.import_id=$1::uuid`,
    [importId],
  )).rows[0];
  if (!row) throw new Error(`Archive import ${importId} does not exist`);
  return row;
}

async function loadConversations(client: import('pg').PoolClient, importId: string): Promise<Map<string, ConversationRow>> {
  const rows = (await client.query<ConversationRow>(
    `SELECT source_conversation_id,title,normalized_hash::text,topology_hash::text,
            node_count,message_count,attachment_reference_count,updated_at::text
     FROM comind.cm_archive_conversation_observation
     WHERE import_id=$1::uuid
     ORDER BY source_conversation_id`,
    [importId],
  )).rows;
  return new Map(rows.map((row) => [row.source_conversation_id, row]));
}

function classify(id: string, baseline: ConversationRow | undefined, comparison: ConversationRow | undefined): DiffObservation {
  let classification: Classification;
  if (!baseline && comparison) classification = 'new_in_comparison';
  else if (baseline && !comparison) classification = 'absent_in_comparison';
  else if (!baseline || !comparison) throw new Error(`Invalid comparison state for ${id}`);
  else if (baseline.topology_hash !== comparison.topology_hash) classification = 'structurally_changed';
  else if (baseline.normalized_hash !== comparison.normalized_hash) classification = 'content_changed';
  else classification = 'unchanged';

  const evidence = {
    title_changed: Boolean(baseline && comparison && baseline.title !== comparison.title),
    normalized_hash_changed: Boolean(baseline && comparison && baseline.normalized_hash !== comparison.normalized_hash),
    topology_hash_changed: Boolean(baseline && comparison && baseline.topology_hash !== comparison.topology_hash),
    baseline_updated_at: baseline?.updated_at ?? null,
    comparison_updated_at: comparison?.updated_at ?? null,
    baseline_attachment_reference_count: baseline?.attachment_reference_count ?? null,
    comparison_attachment_reference_count: comparison?.attachment_reference_count ?? null,
    epistemic_semantics: classification === 'absent_in_comparison'
      ? 'Conversation was not observed in the comparison export. This does not establish deletion from ChatGPT or any other source.'
      : 'Classification compares preserved observations only.',
  };
  const withoutHash = {
    source_conversation_id: id,
    classification,
    baseline_normalized_hash: baseline?.normalized_hash ?? null,
    baseline_topology_hash: baseline?.topology_hash ?? null,
    comparison_normalized_hash: comparison?.normalized_hash ?? null,
    comparison_topology_hash: comparison?.topology_hash ?? null,
    baseline_message_count: baseline?.message_count ?? null,
    comparison_message_count: comparison?.message_count ?? null,
    baseline_node_count: baseline?.node_count ?? null,
    comparison_node_count: comparison?.node_count ?? null,
    evidence,
  };
  return {
    sourceConversationId: id,
    classification,
    baselineNormalizedHash: baseline?.normalized_hash ?? null,
    baselineTopologyHash: baseline?.topology_hash ?? null,
    comparisonNormalizedHash: comparison?.normalized_hash ?? null,
    comparisonTopologyHash: comparison?.topology_hash ?? null,
    baselineMessageCount: baseline?.message_count ?? null,
    comparisonMessageCount: comparison?.message_count ?? null,
    baselineNodeCount: baseline?.node_count ?? null,
    comparisonNodeCount: comparison?.node_count ?? null,
    evidence,
    observationSha256: sha256Text(canonicalJson(withoutHash)),
  };
}

export interface ArchiveDiffResult {
  diffReceiptId: string;
  status: 'PASS' | 'WARN';
  reused: boolean;
  receiptSha256: string;
  classificationCounts: Record<Classification, number>;
  observationCount: number;
}

export async function compareChatGptArchiveImports(
  baselineImportId: string,
  comparisonImportId: string,
): Promise<ArchiveDiffResult> {
  assertArchiveDatabaseSessionPrepared();
  if (baselineImportId === comparisonImportId) throw new Error('Baseline and comparison imports must be different');

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', [
      `${baselineImportId}:${comparisonImportId}:${CHIST_PIT_DIFF_VERSION}`,
    ]);

    const certified = await client.query(
      `SELECT 1 FROM comind.cm_conversation_history_baseline WHERE import_id=$1::uuid`,
      [baselineImportId],
    );
    if (certified.rowCount !== 1) throw new Error('PIT baseline import is not an explicitly certified Conversation History baseline');

    const baselineImport = await loadImport(client, baselineImportId);
    const comparisonImport = await loadImport(client, comparisonImportId);
    if (baselineImport.status !== 'PASS') throw new Error('Certified PIT baseline must remain PASS');
    if (!['PASS', 'WARN'].includes(comparisonImport.status)) {
      throw new Error(`Comparison import must be PASS or WARN, found ${comparisonImport.status}`);
    }
    if (!baselineImport.receipt_sha256 || !comparisonImport.receipt_sha256) {
      throw new Error('Both PIT imports require finalized archive receipts');
    }

    const baseline = await loadConversations(client, baselineImportId);
    const comparison = await loadConversations(client, comparisonImportId);
    const ids = [...new Set([...baseline.keys(), ...comparison.keys()])].sort();
    const observations = ids.map((id) => classify(id, baseline.get(id), comparison.get(id)));
    const classificationCounts: Record<Classification, number> = {
      unchanged: 0,
      content_changed: 0,
      structurally_changed: 0,
      new_in_comparison: 0,
      absent_in_comparison: 0,
    };
    for (const observation of observations) classificationCounts[observation.classification] += 1;

    const observationSetSha256 = sha256Text(canonicalJson(
      observations.map((item) => ({ source_conversation_id: item.sourceConversationId, observation_sha256: item.observationSha256 })),
    ));
    const status: 'PASS' | 'WARN' = comparisonImport.status === 'WARN'
      || (baseline.size > 0 && comparison.size === 0) ? 'WARN' : 'PASS';
    const receipt = {
      diff_version: CHIST_PIT_DIFF_VERSION,
      status,
      baseline: {
        import_id: baselineImport.import_id,
        source_archive_id: baselineImport.source_archive_id,
        source_archive_sha256: baselineImport.source_archive_sha256,
        archive_name: baselineImport.source_archive_name,
        parser_version: baselineImport.parser_version,
        schema_version: baselineImport.schema_version,
        receipt_sha256: baselineImport.receipt_sha256,
        observed_conversation_count: baseline.size,
      },
      comparison: {
        import_id: comparisonImport.import_id,
        source_archive_id: comparisonImport.source_archive_id,
        source_archive_sha256: comparisonImport.source_archive_sha256,
        archive_name: comparisonImport.source_archive_name,
        parser_version: comparisonImport.parser_version,
        schema_version: comparisonImport.schema_version,
        receipt_sha256: comparisonImport.receipt_sha256,
        import_status: comparisonImport.status,
        observed_conversation_count: comparison.size,
      },
      classification_counts: classificationCounts,
      observation_count: observations.length,
      observation_set_sha256: observationSetSha256,
      semantics: {
        absence_is_not_deletion: true,
        structurally_changed: 'Topology hash differs; content may also differ.',
        content_changed: 'Normalized source hash differs while topology hash is unchanged.',
        unchanged: 'Normalized source and topology hashes are unchanged.',
      },
    };
    const receiptSha256 = sha256Text(canonicalJson(receipt));

    const existing = (await client.query<{
      diff_receipt_id: string; status: 'PASS' | 'WARN'; receipt_sha256: string;
    }>(
      `SELECT diff_receipt_id::text,status,receipt_sha256::text
       FROM comind.cm_archive_diff_receipt
       WHERE baseline_import_id=$1::uuid AND comparison_import_id=$2::uuid AND diff_version=$3`,
      [baselineImportId, comparisonImportId, CHIST_PIT_DIFF_VERSION],
    )).rows[0];
    if (existing) {
      if (existing.receipt_sha256 !== receiptSha256 || existing.status !== status) {
        throw new Error('Existing PIT diff identity has different immutable receipt evidence');
      }
      const detailCount = Number((await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM comind.cm_archive_diff_conversation_observation WHERE diff_receipt_id=$1::uuid`,
        [existing.diff_receipt_id],
      )).rows[0]?.count ?? 0);
      if (detailCount !== observations.length) throw new Error('Existing PIT diff receipt has incomplete per-conversation evidence');
      await client.query('COMMIT');
      return { diffReceiptId: existing.diff_receipt_id, status, reused: true, receiptSha256, classificationCounts, observationCount: observations.length };
    }

    const diffReceiptId = (await client.query<{ diff_receipt_id: string }>(
      `INSERT INTO comind.cm_archive_diff_receipt (
         baseline_import_id,comparison_import_id,diff_version,status,classification_counts,receipt,receipt_sha256
       ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb,$7::char(64))
       RETURNING diff_receipt_id::text`,
      [baselineImportId, comparisonImportId, CHIST_PIT_DIFF_VERSION, status, JSON.stringify(classificationCounts), JSON.stringify(receipt), receiptSha256],
    )).rows[0]?.diff_receipt_id;
    if (!diffReceiptId) throw new Error('PIT diff receipt insert did not return an id');

    for (const item of observations) {
      await client.query(
        `INSERT INTO comind.cm_archive_diff_conversation_observation (
           diff_receipt_id,source_conversation_id,classification,
           baseline_normalized_hash,baseline_topology_hash,comparison_normalized_hash,comparison_topology_hash,
           baseline_message_count,comparison_message_count,baseline_node_count,comparison_node_count,
           evidence,observation_sha256
         ) VALUES ($1::uuid,$2,$3,$4::char(64),$5::char(64),$6::char(64),$7::char(64),$8,$9,$10,$11,$12::jsonb,$13::char(64))`,
        [
          diffReceiptId,item.sourceConversationId,item.classification,
          item.baselineNormalizedHash,item.baselineTopologyHash,item.comparisonNormalizedHash,item.comparisonTopologyHash,
          item.baselineMessageCount,item.comparisonMessageCount,item.baselineNodeCount,item.comparisonNodeCount,
          JSON.stringify(item.evidence),item.observationSha256,
        ],
      );
    }

    await client.query('COMMIT');
    return { diffReceiptId, status, reused: false, receiptSha256, classificationCounts, observationCount: observations.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
