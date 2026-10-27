import { assertArchiveDatabaseSessionPrepared, pool } from '../db.js';
import { canonicalJson, sha256Text } from './chatgpt-export.js';

export interface ArchiveImportRecoveryResult {
  abandonedImportId: string;
  successorImportId: string;
  sourceArchiveId: string;
  rootImportId: string;
  abandonedAttemptNumber: number;
  successorAttemptNumber: number;
  abandonedReceiptSha256: string;
  recoveryReason: string;
  reused: boolean;
}

interface ImportAttemptRow {
  import_id: string;
  source_archive_id: string;
  parser_version: string;
  schema_version: string;
  status: string;
  attempt_number: number;
  predecessor_import_id: string | null;
  root_import_id: string | null;
  recovery_reason: string | null;
  receipt_sha256: string | null;
}

interface PartialEvidenceCounts {
  conversations: number;
  nodes: number;
  messageNodes: number;
  attachmentReferences: number;
  parserEvents: number;
  parserErrors: number;
  parserWarnings: number;
  quarantinedFragments: number;
}

function requireReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) throw new Error('Archive import recovery requires a non-empty reason');
  if (normalized.length > 2000) throw new Error('Archive import recovery reason exceeds 2000 characters');
  return normalized;
}

async function readSuccessor(client: import('pg').PoolClient, predecessorImportId: string): Promise<ImportAttemptRow | null> {
  const result = await client.query<ImportAttemptRow>(
    `SELECT import_id,source_archive_id,parser_version,schema_version,status,attempt_number,
            predecessor_import_id,root_import_id,recovery_reason,receipt_sha256
       FROM comind.cm_archive_import
      WHERE predecessor_import_id=$1`,
    [predecessorImportId]
  );
  if (result.rows.length > 1) throw new Error('Archive recovery lineage contains competing successors');
  return result.rows[0] ?? null;
}

async function partialEvidenceCounts(client: import('pg').PoolClient, importId: string): Promise<PartialEvidenceCounts> {
  const result = await client.query<{
    conversations: string;
    nodes: string;
    message_nodes: string;
    attachments: string;
    parser_events: string;
    parser_errors: string;
    parser_warnings: string;
    quarantined: string;
  }>(
    `SELECT
       (SELECT count(*) FROM comind.cm_archive_conversation_observation WHERE import_id=$1)::text AS conversations,
       (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id=$1)::text AS nodes,
       (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id=$1 AND source_message_id IS NOT NULL)::text AS message_nodes,
       (SELECT count(*) FROM comind.cm_archive_attachment_reference WHERE import_id=$1)::text AS attachments,
       (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1)::text AS parser_events,
       (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1 AND severity='ERROR')::text AS parser_errors,
       (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1 AND severity='WARNING')::text AS parser_warnings,
       (SELECT count(*) FROM comind.cm_archive_quarantine WHERE import_id=$1)::text AS quarantined`,
    [importId]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Archive recovery could not inspect partial evidence counts');
  return {
    conversations: Number(row.conversations),
    nodes: Number(row.nodes),
    messageNodes: Number(row.message_nodes),
    attachmentReferences: Number(row.attachments),
    parserEvents: Number(row.parser_events),
    parserErrors: Number(row.parser_errors),
    parserWarnings: Number(row.parser_warnings),
    quarantinedFragments: Number(row.quarantined),
  };
}

function hasCommittedAttemptEvidence(counts: PartialEvidenceCounts): boolean {
  return Object.values(counts).some((value) => value > 0);
}

export async function recoverInterruptedArchiveImport(
  importId: string,
  reason: string
): Promise<ArchiveImportRecoveryResult> {
  assertArchiveDatabaseSessionPrepared();
  const recoveryReason = requireReason(reason);
  const client = await pool.connect();
  let sourceLock: string | null = null;
  try {
    const source = (await client.query<{ hash: string }>(
      `SELECT s.source_archive_sha256::text AS hash FROM comind.cm_archive_import i
       JOIN comind.cm_archive_source s USING(source_archive_id) WHERE i.import_id=$1`, [importId]
    )).rows[0];
    if (!source) throw new Error(`Archive import attempt ${importId} does not exist`);
    sourceLock = `archive:${source.hash}`;
    // Serialize recovery with ingestion as well as other recovery requests.
    await client.query("SET lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [sourceLock]);
    await client.query('BEGIN');
    try {
      const attemptResult = await client.query<ImportAttemptRow>(
        `SELECT import_id,source_archive_id,parser_version,schema_version,status,attempt_number,
                predecessor_import_id,root_import_id,recovery_reason,receipt_sha256
           FROM comind.cm_archive_import
          WHERE import_id=$1
          FOR UPDATE`,
        [importId]
      );
      const attempt = attemptResult.rows[0];
      if (!attempt) throw new Error(`Archive import attempt ${importId} does not exist`);

      if (attempt.status === 'ABANDONED') {
        const successor = await readSuccessor(client, attempt.import_id);
        if (!successor) throw new Error('Abandoned archive import is missing its recovery successor');
        if (successor.recovery_reason !== recoveryReason) {
          throw new Error('Archive import was already recovered with a different recovery reason');
        }
        const receiptSha256 = attempt.receipt_sha256;
        if (!receiptSha256) throw new Error('Abandoned archive import is missing its recovery receipt hash');
        await client.query('COMMIT');
        return {
          abandonedImportId: attempt.import_id,
          successorImportId: successor.import_id,
          sourceArchiveId: attempt.source_archive_id,
          rootImportId: successor.root_import_id ?? attempt.root_import_id ?? attempt.import_id,
          abandonedAttemptNumber: attempt.attempt_number,
          successorAttemptNumber: successor.attempt_number,
          abandonedReceiptSha256: receiptSha256,
          recoveryReason,
          reused: true,
        };
      }

      if (attempt.status !== 'PENDING') {
        throw new Error(`Only PENDING interrupted archive imports can be recovered; found ${attempt.status}`);
      }

      const existingSuccessor = await readSuccessor(client, attempt.import_id);
      if (existingSuccessor) {
        throw new Error('PENDING archive import unexpectedly already has a recovery successor');
      }

      const counts = await partialEvidenceCounts(client, attempt.import_id);
      if (!hasCommittedAttemptEvidence(counts)) {
        throw new Error('PENDING archive import has no committed attempt evidence; retry ingestion directly instead of abandoning it');
      }

      const completedAt = new Date().toISOString();
      const rootImportId = attempt.root_import_id ?? attempt.import_id;
      const receipt = {
        version: 1,
        disposition: 'abandoned_after_interruption',
        importId: attempt.import_id,
        sourceArchiveId: attempt.source_archive_id,
        parserVersion: attempt.parser_version,
        schemaVersion: attempt.schema_version,
        attemptNumber: attempt.attempt_number,
        predecessorImportId: attempt.predecessor_import_id,
        rootImportId,
        completedAt,
        status: 'ABANDONED',
        recoveryReason,
        partialEvidence: counts,
        sourceEvidencePreserved: true,
        deletionPerformed: false,
      };
      const receiptSha256 = sha256Text(canonicalJson(receipt));
      const reconciliation = {
        recoveryDisposition: 'abandoned_after_interruption',
        recoveryReason,
        partialEvidencePreserved: true,
        completeImportClaimed: false,
      };

      await client.query(
        `UPDATE comind.cm_archive_import
            SET status='ABANDONED',
                completed_at=$2,
                imported_conversation_count=$3,
                imported_message_count=$4,
                imported_node_count=$5,
                parser_error_count=$6,
                parser_warning_count=$7,
                reconciliation=$8::jsonb,
                receipt=$9::jsonb,
                receipt_sha256=$10
          WHERE import_id=$1`,
        [
          attempt.import_id,
          completedAt,
          counts.conversations,
          counts.messageNodes,
          counts.nodes,
          counts.parserErrors,
          counts.parserWarnings,
          JSON.stringify(reconciliation),
          JSON.stringify(receipt),
          receiptSha256,
        ]
      );

      const successorResult = await client.query<ImportAttemptRow>(
        `INSERT INTO comind.cm_archive_import
           (source_archive_id,parser_version,schema_version,attempt_number,predecessor_import_id,root_import_id,recovery_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING import_id,source_archive_id,parser_version,schema_version,status,attempt_number,
                   predecessor_import_id,root_import_id,recovery_reason,receipt_sha256`,
        [
          attempt.source_archive_id,
          attempt.parser_version,
          attempt.schema_version,
          attempt.attempt_number + 1,
          attempt.import_id,
          rootImportId,
          recoveryReason,
        ]
      );
      const successor = successorResult.rows[0];
      if (!successor) throw new Error('Archive recovery successor could not be created');

      await client.query('COMMIT');
      return {
        abandonedImportId: attempt.import_id,
        successorImportId: successor.import_id,
        sourceArchiveId: attempt.source_archive_id,
        rootImportId,
        abandonedAttemptNumber: attempt.attempt_number,
        successorAttemptNumber: successor.attempt_number,
        abandonedReceiptSha256: receiptSha256,
        recoveryReason,
        reused: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (sourceLock) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [sourceLock]);
    client.release();
  }
}
