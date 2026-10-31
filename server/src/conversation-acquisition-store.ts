import type { AssistantProviderEvent } from './assistant.js';
import {
  normalizeAcquisitionEnvelope,
  sha256Hex,
  stableJsonStringify,
  type RawAcquisitionEnvelope,
} from './conversation-acquisition.js';
import { pool, type QueryFunction } from './db.js';

const ACQUISITION_WRITER_ROLE = 'comind_conversation_acquisition_writer';
export const CFR_002A_OPENAI_NORMALIZER_VERSION = 'cfr-002a-openai-v1';

export interface ProviderAcquisitionWriteInput {
  conversationId: string;
  generationId: string;
  localSequence: number;
  event: AssistantProviderEvent;
}

export interface ProviderAcquisitionWriteResult {
  acquisitionObservationId: string;
  normalizationId: string;
  normalizationStatus: string;
  normalizationClass: string | null;
}

export type ProviderAcquisitionWriter = (input: ProviderAcquisitionWriteInput) => Promise<ProviderAcquisitionWriteResult>;

function assertLocalSequence(localSequence: number): void {
  if (!Number.isInteger(localSequence) || localSequence < 1) {
    throw new Error('CFR-002A local acquisition sequence must be a positive integer');
  }
}

function sourceEventRef(input: ProviderAcquisitionWriteInput): string {
  const responseIdentity = input.event.providerResponseId ?? input.generationId;
  const sequenceIdentity = input.event.providerSequenceNumber ?? `local-${input.localSequence}`;
  return `provider:${responseIdentity}:${input.event.stage}:${input.event.providerEventType}:${sequenceIdentity}`;
}

function buildEnvelope(input: ProviderAcquisitionWriteInput): RawAcquisitionEnvelope {
  if (input.event.provider !== 'openai') {
    throw new Error(`CFR-002A does not recognize provider acquisition source: ${input.event.provider}`);
  }
  return {
    sourceFamily: 'openai_api',
    sourceStreamRef: input.event.providerResponseId ?? input.generationId,
    sourceEventFamily: input.event.providerEventType,
    sourceEventRef: sourceEventRef(input),
    ...(input.event.providerSequenceNumber !== undefined ? { sourceSequenceNumber: input.event.providerSequenceNumber } : {}),
    sourceEndpointFamily: input.event.providerEndpoint ?? 'responses.create',
    sourceObservedAt: input.event.observedAt,
    payload: input.event.payload,
  };
}

async function assumeAcquisitionWriter(query: QueryFunction): Promise<void> {
  const capability = await query<{ can_set_role: boolean }>(
    `SELECT pg_has_role(session_user, '${ACQUISITION_WRITER_ROLE}', 'SET') AS can_set_role`
  );
  if (!capability.rows[0]?.can_set_role) {
    throw new Error(`Database session cannot SET ROLE ${ACQUISITION_WRITER_ROLE}`);
  }
  await query(`SET LOCAL ROLE ${ACQUISITION_WRITER_ROLE}`);
  const privilege = await query<{
    current_user: string; schema_usage: boolean;
    observation_select: boolean; observation_insert: boolean; observation_update: boolean; observation_delete: boolean;
    normalization_select: boolean; normalization_insert: boolean; normalization_update: boolean; normalization_delete: boolean;
    reconciliation_select: boolean; reconciliation_insert: boolean; reconciliation_update: boolean; reconciliation_delete: boolean;
    sequence_usage: boolean;
  }>(
    `SELECT current_user::text AS current_user,
            has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_observation', 'SELECT') AS observation_select,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_observation', 'INSERT') AS observation_insert,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_observation', 'UPDATE') AS observation_update,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_observation', 'DELETE') AS observation_delete,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_normalization', 'SELECT') AS normalization_select,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_normalization', 'INSERT') AS normalization_insert,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_normalization', 'UPDATE') AS normalization_update,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_normalization', 'DELETE') AS normalization_delete,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_reconciliation', 'SELECT') AS reconciliation_select,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_reconciliation', 'INSERT') AS reconciliation_insert,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_reconciliation', 'UPDATE') AS reconciliation_update,
            has_table_privilege(current_user, 'comind.cm_conversation_acquisition_reconciliation', 'DELETE') AS reconciliation_delete,
            has_sequence_privilege(current_user, 'comind.cm_conv_acq_seq', 'USAGE') AS sequence_usage`
  );
  const row = privilege.rows[0];
  if (!row || row.current_user !== ACQUISITION_WRITER_ROLE || !row.schema_usage
      || !row.observation_select || !row.observation_insert
      || !row.normalization_select || !row.normalization_insert
      || !row.reconciliation_select || !row.reconciliation_insert || !row.sequence_usage
      || row.observation_update || row.observation_delete
      || row.normalization_update || row.normalization_delete
      || row.reconciliation_update || row.reconciliation_delete) {
    throw new Error('CFR-002A acquisition writer has an unexpected privilege shape');
  }
}

async function withAcquisitionWriterTransaction<T>(work: (query: QueryFunction) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discardConnection = false;
  const query: QueryFunction = async <Row>(text: string, params?: any[]) => {
    const result = await client.query(text, params);
    return { rows: result.rows as Row[] };
  };
  try {
    await client.query('BEGIN');
    await assumeAcquisitionWriter(query);
    const result = await work(query);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discardConnection = true; }
    throw error;
  } finally {
    client.release(discardConnection ? new Error('Discarding PostgreSQL connection after CFR-002A acquisition transaction failure') : undefined);
  }
}

export const persistOpenAIProviderAcquisitionEvent: ProviderAcquisitionWriter = async input => {
  assertLocalSequence(input.localSequence);
  const envelope = buildEnvelope(input);
  const normalized = normalizeAcquisitionEnvelope(envelope);
  const rawEnvelope = stableJsonStringify(envelope);
  const acquisitionMetadata = {
    provider: input.event.provider, quality_stage: input.event.stage,
    provider_response_id: input.event.providerResponseId ?? null,
    provider_sequence_number: input.event.providerSequenceNumber ?? null,
    provider_metadata: input.event.metadata ?? {},
  };
  const evidence = { normalizer_version: CFR_002A_OPENAI_NORMALIZER_VERSION, normalized_event: normalized };
  return withAcquisitionWriterTransaction(async query => {
    const persisted = await query<{ acquisition_observation_id: string; normalization_id: string; status: string; normalization_class: string | null }>(
      `WITH observed AS (
         INSERT INTO comind.cm_conversation_acquisition_observation (
           conv_id, generation_id, source_family, source_stream_ref, source_event_family, source_event_ref,
           source_sequence_no, source_endpoint_family, source_observed_at, raw_envelope_sha256, raw_envelope_bytes,
           raw_object_ref, acquisition_metadata
         ) VALUES ($1::uuid, $2::uuid, 'openai_api', $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, NULL, $11::jsonb)
         RETURNING acquisition_observation_id
       ), normalized AS (
         INSERT INTO comind.cm_conversation_acquisition_normalization (
           acquisition_observation_id, normalizer_version, status, normalization_class, normalized_capture_event_id,
           related_observation_id, detail, evidence, normalized_sha256
         )
         SELECT acquisition_observation_id, $12, $13, $14, NULL, NULL, $15, $16::jsonb, $17 FROM observed
         RETURNING normalization_id, acquisition_observation_id, status, normalization_class
       )
       SELECT acquisition_observation_id, normalization_id, status, normalization_class FROM normalized`,
      [input.conversationId, input.generationId, envelope.sourceStreamRef, envelope.sourceEventFamily, envelope.sourceEventRef,
       envelope.sourceSequenceNumber ?? null, envelope.sourceEndpointFamily ?? null, envelope.sourceObservedAt ?? null,
       sha256Hex(envelope), Buffer.byteLength(rawEnvelope, 'utf8'), JSON.stringify(acquisitionMetadata),
       CFR_002A_OPENAI_NORMALIZER_VERSION, normalized.status, normalized.normalizationClass ?? null,
       normalized.driftReason ?? null, JSON.stringify(evidence), sha256Hex(normalized)]
    );
    const row = persisted.rows[0];
    if (!row) throw new Error('CFR-002A acquisition persistence returned no receipt');
    return { acquisitionObservationId: row.acquisition_observation_id, normalizationId: row.normalization_id,
      normalizationStatus: row.status, normalizationClass: row.normalization_class };
  });
};
