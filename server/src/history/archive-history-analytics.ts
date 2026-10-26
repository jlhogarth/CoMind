import { assertHistoryDatabaseSessionPrepared, historyPool } from './history-db.js';

const HISTORY_ROLE = 'comind_conversation_history_reader';

async function resolveCertifiedImportId(
  client: import('pg').PoolClient,
  requested?: string,
): Promise<string> {
  if (requested) {
    const result = await client.query<{ import_id: string }>(
      `SELECT b.import_id::text
       FROM comind.cm_conversation_history_baseline b
       WHERE b.import_id=$1::uuid`,
      [requested],
    );
    if (!result.rows[0]) throw new Error('Requested Conversation History import is not a certified baseline');
    return result.rows[0].import_id;
  }
  const result = await client.query<{ import_id: string }>(
    `SELECT b.import_id::text
     FROM comind.cm_conversation_history_baseline b
     JOIN comind.cm_archive_import i USING(import_id)
     ORDER BY b.certified_at DESC, i.completed_at DESC NULLS LAST
     LIMIT 1`,
  );
  if (!result.rows[0]) throw new Error('No certified Conversation History baseline exists yet');
  return result.rows[0].import_id;
}

export async function getArchiveHistoryAnalytics(options: {
  sourceConversationId: string;
  importId?: string;
}) {
  assertHistoryDatabaseSessionPrepared();
  const client = await historyPool.connect();
  try {
    await client.query(`SET ROLE ${HISTORY_ROLE}`);
    const importId = await resolveCertifiedImportId(client, options.importId);

    const capability = (await client.query<{ available: boolean }>(
      `SELECT to_regclass('comind.cm_archive_derivation_run') IS NOT NULL
              AND to_regclass('comind.cm_archive_derivation') IS NOT NULL
              AND to_regclass('comind.cm_archive_promotion_candidate') IS NOT NULL
              AS available`,
    )).rows[0];

    if (!capability?.available) {
      return {
        provenanceLayer: 'derived_evidence' as const,
        sourceBasis: 'certified_archive' as const,
        run: null,
        analytics: [],
        promotionCandidates: [],
        note: 'Archive-native analytics capability is not deployed yet; certified source history remains available without derived analytics.',
      };
    }

    const run = (await client.query<{
      archive_derivation_run_id: string;
      policy_version: string;
      engine_kind: string;
      source_snapshot_sha256: string;
      run_identity_sha256: string;
      result_state: string;
      source_stats: Record<string, unknown>;
      engine_metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT archive_derivation_run_id::text,policy_version,engine_kind,
              source_snapshot_sha256::text,run_identity_sha256::text,result_state,
              source_stats,engine_metadata,created_at::text
       FROM comind.cm_archive_derivation_run
       WHERE import_id=$1::uuid AND source_conversation_id=$2
       ORDER BY created_at DESC,archive_derivation_run_id DESC
       LIMIT 1`,
      [importId, options.sourceConversationId],
    )).rows[0] ?? null;

    if (!run) {
      return {
        provenanceLayer: 'derived_evidence' as const,
        sourceBasis: 'certified_archive' as const,
        run: null,
        analytics: [],
        promotionCandidates: [],
        note: 'No archive-native derivation run exists for this certified historical conversation yet.',
      };
    }

    const analytics = (await client.query(
      `SELECT archive_derivation_id::text,derivation_kind,source_kind,source_role,
              source_node_id,source_message_id,evidence_start_char,evidence_end_char,
              value_text,normalized_key,confidence::text,salience::text,uncertainty,
              conflict_state,evidence,metadata,created_at::text
       FROM comind.cm_archive_derivation
       WHERE archive_derivation_run_id=$1::uuid
       ORDER BY derivation_kind,archive_derivation_id`,
      [run.archive_derivation_run_id],
    )).rows;

    const promotionCandidates = (await client.query(
      `SELECT archive_candidate_id::text,target_type,proposed_title,proposed_content,
              rationale,confidence::text,salience::text,uncertainty,conflict_state,
              evidence,created_at::text
       FROM comind.cm_archive_promotion_candidate
       WHERE archive_derivation_run_id=$1::uuid
       ORDER BY salience DESC,archive_candidate_id`,
      [run.archive_derivation_run_id],
    )).rows;

    return {
      provenanceLayer: 'derived_evidence' as const,
      sourceBasis: 'certified_archive' as const,
      run,
      analytics,
      promotionCandidates,
      note: 'Archive-native analytics are deterministic derived evidence over the certified source branch. They are not source truth and are not canonical promotion.',
    };
  } finally {
    client.release();
  }
}
