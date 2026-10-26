import { createHash } from 'node:crypto';

import {
  assertBaselineCertificationSessionPrepared,
  baselineCertificationPool,
} from './baseline-certification-db.js';

export const CHIST_BASELINE_CERTIFICATION_VERSION = 'chist_baseline_cert_v1';
const CERTIFIER_ROLE = 'comind_conversation_history_certifier';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface BaselineCertificationResult {
  baselineId: string;
  importId: string;
  sourceArchiveId: string;
  sourceArchiveSha256: string;
  certificationSha256: string;
  reusedExistingCertification: boolean;
}

export async function certifyConversationHistoryBaseline(options: {
  importId: string;
  certifiedBy: string;
  reason: string;
}): Promise<BaselineCertificationResult> {
  assertBaselineCertificationSessionPrepared();
  const certifiedBy = options.certifiedBy.trim();
  const reason = options.reason.trim();
  if (!certifiedBy) throw new Error('certifiedBy is required');
  if (!reason) throw new Error('certification reason is required');
  if (certifiedBy.length > 200) throw new Error('certifiedBy must be 200 characters or fewer');
  if (reason.length > 2000) throw new Error('certification reason must be 2000 characters or fewer');

  const client = await baselineCertificationPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SET LOCAL ROLE ${CERTIFIER_ROLE}`);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', [options.importId]);

    const source = (await client.query<{
      import_id: string;
      status: string;
      parser_version: string;
      schema_version: string;
      source_archive_id: string;
      source_system: string;
      source_archive_name: string;
      source_archive_sha256: string;
      source_archive_bytes: string;
      source_metadata: Record<string, unknown>;
      source_conversation_count: string | null;
      imported_conversation_count: string | null;
      source_message_count: string | null;
      imported_message_count: string | null;
      source_node_count: string | null;
      imported_node_count: string | null;
      parser_warning_count: string;
      parser_error_count: string;
      receipt_sha256: string | null;
      completed_at: string | null;
    }>(
      `SELECT i.import_id::text,i.status,i.parser_version,i.schema_version,
              s.source_archive_id::text,s.source_system,s.source_archive_name,
              s.source_archive_sha256::text,s.source_archive_bytes::text,s.source_metadata,
              i.source_conversation_count::text,i.imported_conversation_count::text,
              i.source_message_count::text,i.imported_message_count::text,
              i.source_node_count::text,i.imported_node_count::text,
              i.parser_warning_count::text,i.parser_error_count::text,
              i.receipt_sha256::text,i.completed_at::text
       FROM comind.cm_archive_import i
       JOIN comind.cm_archive_source s USING(source_archive_id)
       WHERE i.import_id=$1::uuid`,
      [options.importId],
    )).rows[0];
    if (!source) throw new Error('Archive import does not exist or is not visible to the certifier');
    if (source.status !== 'PASS') throw new Error(`Only PASS archive imports may be certified, found ${source.status}`);
    if (source.source_system !== 'chatgpt') throw new Error('Only ChatGPT archive imports may be certified');
    if (!source.completed_at || !source.receipt_sha256) throw new Error('Archive import lacks a finalized integrity receipt');
    if (Number(source.parser_warning_count) !== 0 || Number(source.parser_error_count) !== 0) {
      throw new Error('PASS baseline certification requires zero parser warnings and errors');
    }
    const sourceConversations = Number(source.source_conversation_count ?? -1);
    const importedConversations = Number(source.imported_conversation_count ?? -2);
    const sourceMessages = Number(source.source_message_count ?? -1);
    const importedMessages = Number(source.imported_message_count ?? -2);
    const sourceNodes = Number(source.source_node_count ?? -1);
    const importedNodes = Number(source.imported_node_count ?? -2);
    if (sourceConversations <= 0 || sourceConversations !== importedConversations
      || sourceMessages <= 0 || sourceMessages !== importedMessages
      || sourceNodes <= 0 || sourceNodes !== importedNodes) {
      throw new Error('Archive import counts are not a non-empty lossless baseline');
    }

    const syntheticFlag = source.source_metadata?.synthetic === true;
    const suspiciousFixture = /(?:fixture|synthetic|test[-_ ]?archive)/i.test(
      `${source.source_archive_name}|${source.parser_version}|${source.schema_version}`,
    );
    if (syntheticFlag || suspiciousFixture) {
      throw new Error('Synthetic or fixture archive evidence cannot be certified by the governed CHIST baseline certifier');
    }
    if (Number(source.source_archive_bytes) <= 0) throw new Error('Archive source has no bytes');

    const certificationEvidence = {
      certification_version: CHIST_BASELINE_CERTIFICATION_VERSION,
      import_id: source.import_id,
      source_archive_id: source.source_archive_id,
      source_archive_sha256: source.source_archive_sha256,
      source_archive_bytes: Number(source.source_archive_bytes),
      receipt_sha256: source.receipt_sha256,
      parser_version: source.parser_version,
      schema_version: source.schema_version,
      completed_at: source.completed_at,
      counts: {
        conversations: importedConversations,
        messages: importedMessages,
        nodes: importedNodes,
      },
      certified_by: certifiedBy,
      certification_reason: reason,
    };
    const certificationSha256 = sha256(JSON.stringify(certificationEvidence));

    const existing = (await client.query<{
      baseline_id: string;
      source_archive_id: string;
      source_archive_sha256: string;
      certification_sha256: string;
    }>(
      `SELECT baseline_id::text,source_archive_id::text,source_archive_sha256::text,certification_sha256::text
       FROM comind.cm_conversation_history_baseline
       WHERE import_id=$1::uuid`,
      [source.import_id],
    )).rows[0];
    if (existing) {
      if (existing.certification_sha256 !== certificationSha256
        || existing.source_archive_id !== source.source_archive_id
        || existing.source_archive_sha256 !== source.source_archive_sha256) {
        throw new Error('Archive import is already certified with different immutable certification evidence');
      }
      await client.query('COMMIT');
      return {
        baselineId: existing.baseline_id,
        importId: source.import_id,
        sourceArchiveId: source.source_archive_id,
        sourceArchiveSha256: source.source_archive_sha256,
        certificationSha256,
        reusedExistingCertification: true,
      };
    }

    const inserted = (await client.query<{ baseline_id: string }>(
      `INSERT INTO comind.cm_conversation_history_baseline (
         import_id,source_archive_id,source_archive_sha256,certification_version,source_kind,
         certified_by,certification_reason,evidence,certification_sha256
       ) VALUES ($1::uuid,$2::uuid,$3::char(64),$4,'native_openai_export',$5,$6,$7::jsonb,$8::char(64))
       RETURNING baseline_id::text`,
      [
        source.import_id,source.source_archive_id,source.source_archive_sha256,
        CHIST_BASELINE_CERTIFICATION_VERSION,certifiedBy,reason,
        JSON.stringify(certificationEvidence),certificationSha256,
      ],
    )).rows[0];
    if (!inserted) throw new Error('Baseline certification insert did not return an id');

    await client.query('COMMIT');
    return {
      baselineId: inserted.baseline_id,
      importId: source.import_id,
      sourceArchiveId: source.source_archive_id,
      sourceArchiveSha256: source.source_archive_sha256,
      certificationSha256,
      reusedExistingCertification: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
