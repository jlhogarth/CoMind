import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import type { QueryFunction } from '../db.js';
import type { EvidenceRef } from './types.js';

export type ThreadKeeperOperationKind =
  | 'continuity_cycle'
  | 'observation'
  | 'assessment'
  | 'routing'
  | 'checkpoint_proposal'
  | 'checkpoint_acceptance'
  | 'context_retrieval'
  | 'recovery';

export type ThreadKeeperOperationTerminalStatus = 'SUCCEEDED' | 'FAILED' | 'BLOCKED';

export interface StoredThreadKeeperOperationEvent {
  operation_event_id: string;
  persistence_seq: string;
  event_key: string;
  operation_id: string;
  prior_event_id: string | null;
  recovery_of_event_id: string | null;
  scope_id: string | null;
  operation_kind: ThreadKeeperOperationKind;
  event_type: 'STARTED' | ThreadKeeperOperationTerminalStatus;
  actor_ref: string;
  authority_evidence_ref: string | null;
  policy_ref: string | null;
  correlation_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  service_name: string;
  service_instance_id: string | null;
  evidence_refs: EvidenceRef[];
  result_ref: string | null;
  error_type: string | null;
  error_code: string | null;
  duration_ms: string | null;
  recorded_at: Date;
  event_digest: string;
}

export interface StartThreadKeeperOperationInput {
  eventKey: string;
  operationId: string;
  recoveryOfEventId?: string;
  scopeId?: string;
  operationKind: ThreadKeeperOperationKind;
  actorRef: string;
  authorityEvidenceRef?: string;
  policyRef?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  serviceName?: string;
  serviceInstanceId?: string;
  evidenceRefs?: EvidenceRef[];
  recordedAt: string;
}

export interface FinishThreadKeeperOperationInput {
  eventKey: string;
  operationId: string;
  startedEventId: string;
  status: ThreadKeeperOperationTerminalStatus;
  resultRef?: string;
  errorType?: string;
  errorCode?: string;
  evidenceRefs?: EvidenceRef[];
  durationMs: number;
  recordedAt: string;
}

export interface ThreadKeeperOperationalHealth {
  status: 'unknown' | 'healthy' | 'degraded' | 'failed';
  operationCount: number;
  succeeded: number;
  failed: number;
  blocked: number;
  inFlight: number;
  staleInFlight: number;
  unrecoveredFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  p95SuccessfulDurationMs: number | null;
  staleAfterMs: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set<ThreadKeeperOperationTerminalStatus>(['SUCCEEDED', 'FAILED', 'BLOCKED']);
const OPERATION_KINDS = new Set<ThreadKeeperOperationKind>([
  'continuity_cycle', 'observation', 'assessment', 'routing',
  'checkpoint_proposal', 'checkpoint_acceptance', 'context_retrieval', 'recovery',
]);

function boundedString(value: unknown, field: string, max: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function optionalBoundedString(value: string | undefined, field: string, max: number): void {
  if (value !== undefined) boundedString(value, field, max);
}

function requireUuid(value: string, field: string): void {
  boundedString(value, field, 128);
  if (!UUID_RE.test(value)) throw new Error(`Invalid ${field}`);
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizeEvidenceRefs(value: EvidenceRef[] | undefined): EvidenceRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) throw new Error('Invalid ThreadKeeper operation evidence references');
  return structuredClone(value);
}

function normalizedDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function eventProjection(row: StoredThreadKeeperOperationEvent): Record<string, unknown> {
  return {
    eventKey: row.event_key,
    operationId: row.operation_id,
    priorEventId: row.prior_event_id,
    recoveryOfEventId: row.recovery_of_event_id,
    scopeId: row.scope_id,
    operationKind: row.operation_kind,
    eventType: row.event_type,
    actorRef: row.actor_ref,
    authorityEvidenceRef: row.authority_evidence_ref,
    policyRef: row.policy_ref,
    correlationId: row.correlation_id,
    traceId: row.trace_id,
    spanId: row.span_id,
    serviceName: row.service_name,
    serviceInstanceId: row.service_instance_id,
    evidenceRefs: row.evidence_refs,
    resultRef: row.result_ref,
    errorType: row.error_type,
    errorCode: row.error_code,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    recordedAt: normalizedDate(row.recorded_at),
  };
}

async function existingEvent(query: QueryFunction, eventKey: string): Promise<StoredThreadKeeperOperationEvent | null> {
  const result = await query<StoredThreadKeeperOperationEvent>(
    `SELECT operation_event_id::text, persistence_seq::text, event_key,
            operation_id::text, prior_event_id::text, recovery_of_event_id::text,
            scope_id::text, operation_kind, event_type, actor_ref,
            authority_evidence_ref, policy_ref, correlation_id, trace_id, span_id,
            service_name, service_instance_id, evidence_refs, result_ref,
            error_type, error_code, duration_ms::text, recorded_at, event_digest
       FROM comind.cm_threadkeeper_operation_event
      WHERE event_key=$1`,
    [eventKey],
  );
  return result.rows[0] ?? null;
}

async function resolveInsertedEvent(
  query: QueryFunction,
  eventKey: string,
  expectedDigest: string,
  inserted: StoredThreadKeeperOperationEvent | undefined,
): Promise<StoredThreadKeeperOperationEvent> {
  if (inserted) return inserted;
  const existing = await existingEvent(query, eventKey);
  if (!existing) throw new Error('ThreadKeeper operation event persistence outcome uncertain');
  if (existing.event_digest !== expectedDigest) {
    throw new Error('ThreadKeeper operation event key reused with different evidence');
  }
  return existing;
}

export async function startThreadKeeperOperation(
  query: QueryFunction,
  input: StartThreadKeeperOperationInput,
): Promise<StoredThreadKeeperOperationEvent> {
  boundedString(input.eventKey, 'ThreadKeeper operation event key', 512);
  requireUuid(input.operationId, 'ThreadKeeper operation id');
  if (!OPERATION_KINDS.has(input.operationKind)) throw new Error('Invalid ThreadKeeper operation kind');
  if (input.recoveryOfEventId !== undefined) requireUuid(input.recoveryOfEventId, 'ThreadKeeper recovery event id');
  if (input.scopeId !== undefined) requireUuid(input.scopeId, 'ThreadKeeper operation scope id');
  boundedString(input.actorRef, 'ThreadKeeper operation actor reference', 512);
  optionalBoundedString(input.authorityEvidenceRef, 'ThreadKeeper operation authority evidence', 4096);
  optionalBoundedString(input.policyRef, 'ThreadKeeper operation policy reference', 512);
  optionalBoundedString(input.correlationId, 'ThreadKeeper operation correlation id', 512);
  optionalBoundedString(input.traceId, 'ThreadKeeper operation trace id', 256);
  optionalBoundedString(input.spanId, 'ThreadKeeper operation span id', 256);
  optionalBoundedString(input.serviceInstanceId, 'ThreadKeeper service instance id', 512);
  const serviceName = input.serviceName ?? 'threadkeeper';
  boundedString(serviceName, 'ThreadKeeper service name', 256);
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  const recordedAt = normalizeTimestamp(input.recordedAt, 'ThreadKeeper operation timestamp');

  const projection = {
    eventKey: input.eventKey,
    operationId: input.operationId,
    priorEventId: null,
    recoveryOfEventId: input.recoveryOfEventId ?? null,
    scopeId: input.scopeId ?? null,
    operationKind: input.operationKind,
    eventType: 'STARTED',
    actorRef: input.actorRef,
    authorityEvidenceRef: input.authorityEvidenceRef ?? null,
    policyRef: input.policyRef ?? null,
    correlationId: input.correlationId ?? null,
    traceId: input.traceId ?? null,
    spanId: input.spanId ?? null,
    serviceName,
    serviceInstanceId: input.serviceInstanceId ?? null,
    evidenceRefs,
    resultRef: null,
    errorType: null,
    errorCode: null,
    durationMs: null,
    recordedAt,
  } as const;
  const digest = fingerprintCanonicalValue(projection);

  const result = await query<StoredThreadKeeperOperationEvent>(
    `INSERT INTO comind.cm_threadkeeper_operation_event (
       event_key, operation_id, prior_event_id, recovery_of_event_id, scope_id,
       operation_kind, event_type, actor_ref, authority_evidence_ref, policy_ref,
       correlation_id, trace_id, span_id, service_name, service_instance_id,
       evidence_refs, result_ref, error_type, error_code, duration_ms,
       recorded_at, event_digest
     ) VALUES (
       $1,$2::uuid,NULL,$3::uuid,$4::uuid,$5,'STARTED',$6,$7,$8,$9,$10,$11,$12,$13,
       $14::jsonb,NULL,NULL,NULL,NULL,$15::timestamptz,$16
     )
     ON CONFLICT (event_key) DO NOTHING
     RETURNING operation_event_id::text, persistence_seq::text, event_key,
               operation_id::text, prior_event_id::text, recovery_of_event_id::text,
               scope_id::text, operation_kind, event_type, actor_ref,
               authority_evidence_ref, policy_ref, correlation_id, trace_id, span_id,
               service_name, service_instance_id, evidence_refs, result_ref,
               error_type, error_code, duration_ms::text, recorded_at, event_digest`,
    [
      input.eventKey,
      input.operationId,
      input.recoveryOfEventId ?? null,
      input.scopeId ?? null,
      input.operationKind,
      input.actorRef,
      input.authorityEvidenceRef ?? null,
      input.policyRef ?? null,
      input.correlationId ?? null,
      input.traceId ?? null,
      input.spanId ?? null,
      serviceName,
      input.serviceInstanceId ?? null,
      JSON.stringify(evidenceRefs),
      recordedAt,
      digest,
    ],
  );
  return resolveInsertedEvent(query, input.eventKey, digest, result.rows[0]);
}

export async function finishThreadKeeperOperation(
  query: QueryFunction,
  input: FinishThreadKeeperOperationInput,
): Promise<StoredThreadKeeperOperationEvent> {
  boundedString(input.eventKey, 'ThreadKeeper operation event key', 512);
  requireUuid(input.operationId, 'ThreadKeeper operation id');
  requireUuid(input.startedEventId, 'ThreadKeeper started event id');
  if (!TERMINAL_STATUSES.has(input.status)) throw new Error('Invalid ThreadKeeper terminal status');
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0) throw new Error('Invalid ThreadKeeper duration');
  optionalBoundedString(input.resultRef, 'ThreadKeeper operation result reference', 4096);
  optionalBoundedString(input.errorType, 'ThreadKeeper operation error type', 256);
  optionalBoundedString(input.errorCode, 'ThreadKeeper operation error code', 256);
  if (input.status === 'SUCCEEDED' && (input.errorType !== undefined || input.errorCode !== undefined)) {
    throw new Error('Successful ThreadKeeper operation cannot include error fields');
  }
  if (input.status !== 'SUCCEEDED' && input.errorType === undefined) {
    throw new Error('Failed or blocked ThreadKeeper operation requires errorType');
  }
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  const recordedAt = normalizeTimestamp(input.recordedAt, 'ThreadKeeper operation terminal timestamp');

  const startResult = await query<StoredThreadKeeperOperationEvent>(
    `SELECT operation_event_id::text, persistence_seq::text, event_key,
            operation_id::text, prior_event_id::text, recovery_of_event_id::text,
            scope_id::text, operation_kind, event_type, actor_ref,
            authority_evidence_ref, policy_ref, correlation_id, trace_id, span_id,
            service_name, service_instance_id, evidence_refs, result_ref,
            error_type, error_code, duration_ms::text, recorded_at, event_digest
       FROM comind.cm_threadkeeper_operation_event
      WHERE operation_event_id=$1::uuid AND operation_id=$2::uuid`,
    [input.startedEventId, input.operationId],
  );
  const started = startResult.rows[0];
  if (!started || started.event_type !== 'STARTED' || started.prior_event_id !== null) {
    throw new Error('ThreadKeeper started operation event is unavailable');
  }

  const projection = {
    eventKey: input.eventKey,
    operationId: input.operationId,
    priorEventId: input.startedEventId,
    recoveryOfEventId: null,
    scopeId: started.scope_id,
    operationKind: started.operation_kind,
    eventType: input.status,
    actorRef: started.actor_ref,
    authorityEvidenceRef: started.authority_evidence_ref,
    policyRef: started.policy_ref,
    correlationId: started.correlation_id,
    traceId: started.trace_id,
    spanId: started.span_id,
    serviceName: started.service_name,
    serviceInstanceId: started.service_instance_id,
    evidenceRefs,
    resultRef: input.resultRef ?? null,
    errorType: input.errorType ?? null,
    errorCode: input.errorCode ?? null,
    durationMs: input.durationMs,
    recordedAt,
  } as const;
  const digest = fingerprintCanonicalValue(projection);

  const result = await query<StoredThreadKeeperOperationEvent>(
    `INSERT INTO comind.cm_threadkeeper_operation_event (
       event_key, operation_id, prior_event_id, recovery_of_event_id, scope_id,
       operation_kind, event_type, actor_ref, authority_evidence_ref, policy_ref,
       correlation_id, trace_id, span_id, service_name, service_instance_id,
       evidence_refs, result_ref, error_type, error_code, duration_ms,
       recorded_at, event_digest
     ) VALUES (
       $1,$2::uuid,$3::uuid,NULL,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
       $15::jsonb,$16,$17,$18,$19,$20::timestamptz,$21
     )
     ON CONFLICT (event_key) DO NOTHING
     RETURNING operation_event_id::text, persistence_seq::text, event_key,
               operation_id::text, prior_event_id::text, recovery_of_event_id::text,
               scope_id::text, operation_kind, event_type, actor_ref,
               authority_evidence_ref, policy_ref, correlation_id, trace_id, span_id,
               service_name, service_instance_id, evidence_refs, result_ref,
               error_type, error_code, duration_ms::text, recorded_at, event_digest`,
    [
      input.eventKey,
      input.operationId,
      input.startedEventId,
      started.scope_id,
      started.operation_kind,
      input.status,
      started.actor_ref,
      started.authority_evidence_ref,
      started.policy_ref,
      started.correlation_id,
      started.trace_id,
      started.span_id,
      started.service_name,
      started.service_instance_id,
      JSON.stringify(evidenceRefs),
      input.resultRef ?? null,
      input.errorType ?? null,
      input.errorCode ?? null,
      input.durationMs,
      recordedAt,
      digest,
    ],
  );
  return resolveInsertedEvent(query, input.eventKey, digest, result.rows[0]);
}

export async function getThreadKeeperOperationalHealth(
  query: QueryFunction,
  staleAfterMs: number,
  now = new Date(),
): Promise<ThreadKeeperOperationalHealth> {
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) throw new Error('Invalid ThreadKeeper stale threshold');
  const rows = await query<{
    operation_id: string;
    latest_event_id: string;
    status: 'STARTED' | ThreadKeeperOperationTerminalStatus;
    started_at: Date;
    terminal_at: Date | null;
    duration_ms: string | null;
    recovered: boolean;
  }>(
    `SELECT s.operation_id::text, s.latest_event_id::text, s.status,
            s.started_at, s.terminal_at, s.duration_ms::text,
            EXISTS (
              SELECT 1
                FROM comind.cm_threadkeeper_operation_event r
                JOIN comind.v_threadkeeper_operation_status rs ON rs.operation_id=r.operation_id
               WHERE r.prior_event_id IS NULL
                 AND r.recovery_of_event_id=s.latest_event_id
                 AND rs.status='SUCCEEDED'
            ) AS recovered
       FROM comind.v_threadkeeper_operation_status s
      ORDER BY s.started_at ASC, s.operation_id ASC`,
  );

  let succeeded = 0;
  let failed = 0;
  let blocked = 0;
  let inFlight = 0;
  let staleInFlight = 0;
  let unrecoveredFailures = 0;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  const successfulDurations: number[] = [];

  for (const row of rows.rows) {
    if (row.status === 'STARTED') {
      inFlight += 1;
      if (now.getTime() - new Date(row.started_at).getTime() > staleAfterMs) staleInFlight += 1;
      continue;
    }
    if (row.status === 'SUCCEEDED') {
      succeeded += 1;
      const terminal = row.terminal_at ? normalizedDate(row.terminal_at) : null;
      if (terminal && (!lastSuccessAt || terminal > lastSuccessAt)) lastSuccessAt = terminal;
      if (row.duration_ms !== null) successfulDurations.push(Number(row.duration_ms));
      continue;
    }
    if (row.status === 'FAILED') failed += 1;
    if (row.status === 'BLOCKED') blocked += 1;
    if (!row.recovered) unrecoveredFailures += 1;
    const terminal = row.terminal_at ? normalizedDate(row.terminal_at) : null;
    if (terminal && (!lastFailureAt || terminal > lastFailureAt)) lastFailureAt = terminal;
  }

  successfulDurations.sort((a, b) => a - b);
  const p95Index = successfulDurations.length === 0
    ? -1
    : Math.min(successfulDurations.length - 1, Math.ceil(successfulDurations.length * 0.95) - 1);
  const status: ThreadKeeperOperationalHealth['status'] = rows.rows.length === 0
    ? 'unknown'
    : staleInFlight > 0
      ? 'failed'
      : unrecoveredFailures > 0
        ? 'degraded'
        : 'healthy';

  return {
    status,
    operationCount: rows.rows.length,
    succeeded,
    failed,
    blocked,
    inFlight,
    staleInFlight,
    unrecoveredFailures,
    lastSuccessAt,
    lastFailureAt,
    p95SuccessfulDurationMs: p95Index < 0 ? null : successfulDurations[p95Index],
    staleAfterMs,
  };
}

export function verifyStoredThreadKeeperOperationEvent(row: StoredThreadKeeperOperationEvent): boolean {
  return fingerprintCanonicalValue(eventProjection(row)) === row.event_digest;
}
