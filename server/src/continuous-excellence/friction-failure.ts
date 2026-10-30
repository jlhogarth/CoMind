import type { QueryFunction } from '../db.js';

export const CE_FRICTION_FAILURE_VERSION = 'ce-004-friction-failure-v1' as const;

export type FrictionFailureSignalType = 'friction' | 'failure';
export type FrictionFailureState =
  | 'untriaged'
  | 'triaged'
  | 'diagnosed'
  | 'deferred'
  | 'resolved'
  | 'closed_no_action'
  | 'reopened';
export type FrictionFailureEventType = Exclude<FrictionFailureState, 'untriaged'>;
export type RecurrenceRisk = 'unknown' | 'low' | 'moderate' | 'high' | 'critical';

interface RegisterRow {
  signal_id: string;
  project_id: string;
  task_id: string | null;
  actor_id: string | null;
  signal_type: FrictionFailureSignalType;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  requires_action: boolean;
  summary: string;
  details: Record<string, unknown>;
  signal_source_system: string;
  signal_source_ref: string | null;
  idempotency_key: string | null;
  observed_at: string | Date;
  signal_created_at: string | Date;
  current_state: FrictionFailureState;
  latest_event_id: string | null;
  latest_event_summary: string | null;
  latest_event_source_system: string | null;
  latest_event_source_ref: string | null;
  latest_event_at: string | Date | null;
  owner_actor_id: string | null;
  recurrence_risk: RecurrenceRisk | null;
  pattern_key: string | null;
  pattern_occurrence_count: number | string;
  linked_improvement_count: number | string;
  pattern_linked_improvement_count: number | string;
  open_action: boolean;
  improvement_review_recommended: boolean;
}

export interface FrictionFailureRegisterEntry {
  signalId: string;
  projectId: string;
  taskId: string | null;
  actorId: string | null;
  signalType: FrictionFailureSignalType;
  severity: RegisterRow['severity'];
  requiresAction: boolean;
  summary: string;
  details: Record<string, unknown>;
  signalSourceSystem: string;
  signalSourceRef: string | null;
  idempotencyKey: string | null;
  observedAt: string;
  signalCreatedAt: string;
  currentState: FrictionFailureState;
  latestEventId: string | null;
  latestEventSummary: string | null;
  latestEventSourceSystem: string | null;
  latestEventSourceRef: string | null;
  latestEventAt: string | null;
  ownerActorId: string | null;
  recurrenceRisk: RecurrenceRisk | null;
  patternKey: string | null;
  patternOccurrenceCount: number;
  linkedImprovementCount: number;
  patternLinkedImprovementCount: number;
  openAction: boolean;
  improvementReviewRecommended: boolean;
}

export interface FrictionFailureRegisterRequest {
  projectId: string;
}

export interface FrictionFailureRegisterAssessment {
  total: number;
  openActionCount: number;
  untriagedCount: number;
  terminalCount: number;
  improvementReviewCount: number;
  recommendedSignalIds: string[];
}

export interface RecordFrictionFailureEventInput {
  signalId: string;
  actorId?: string | null;
  ownerActorId?: string | null;
  eventType: FrictionFailureEventType;
  recurrenceRisk: RecurrenceRisk | null;
  patternKey?: string | null;
  summary: string;
  details: Record<string, unknown>;
  sourceSystem: string;
  sourceRef?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordFrictionFailureEventResult {
  eventId: string;
  register: FrictionFailureRegisterEntry;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES: FrictionFailureEventType[] = [
  'triaged',
  'diagnosed',
  'deferred',
  'resolved',
  'closed_no_action',
  'reopened',
];
const RECURRENCE_RISKS: RecurrenceRisk[] = ['unknown','low','moderate','high','critical'];

function boundedString(value: unknown, field: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function assertUuid(value: unknown, field: string): asserts value is string {
  boundedString(value, field, 128);
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${field}`);
}

function normalizeTimestamp(value: string | Date): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Invalid CE-004 register timestamp');
  return new Date(parsed).toISOString();
}

function numericCount(value: number | string, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function mapRow(row: RegisterRow): FrictionFailureRegisterEntry {
  return {
    signalId: row.signal_id,
    projectId: row.project_id,
    taskId: row.task_id,
    actorId: row.actor_id,
    signalType: row.signal_type,
    severity: row.severity,
    requiresAction: row.requires_action,
    summary: row.summary,
    details: row.details,
    signalSourceSystem: row.signal_source_system,
    signalSourceRef: row.signal_source_ref,
    idempotencyKey: row.idempotency_key,
    observedAt: normalizeTimestamp(row.observed_at),
    signalCreatedAt: normalizeTimestamp(row.signal_created_at),
    currentState: row.current_state,
    latestEventId: row.latest_event_id,
    latestEventSummary: row.latest_event_summary,
    latestEventSourceSystem: row.latest_event_source_system,
    latestEventSourceRef: row.latest_event_source_ref,
    latestEventAt: row.latest_event_at === null ? null : normalizeTimestamp(row.latest_event_at),
    ownerActorId: row.owner_actor_id,
    recurrenceRisk: row.recurrence_risk,
    patternKey: row.pattern_key,
    patternOccurrenceCount: numericCount(row.pattern_occurrence_count, 'CE-004 pattern occurrence count'),
    linkedImprovementCount: numericCount(row.linked_improvement_count, 'CE-004 linked improvement count'),
    patternLinkedImprovementCount: numericCount(row.pattern_linked_improvement_count, 'CE-004 pattern linked improvement count'),
    openAction: row.open_action,
    improvementReviewRecommended: row.improvement_review_recommended,
  };
}

function validateEventInput(input: RecordFrictionFailureEventInput): void {
  assertUuid(input.signalId, 'CE-004 signal id');
  if (input.actorId !== undefined && input.actorId !== null) assertUuid(input.actorId, 'CE-004 actor id');
  if (input.ownerActorId !== undefined && input.ownerActorId !== null) assertUuid(input.ownerActorId, 'CE-004 owner actor id');
  if (!EVENT_TYPES.includes(input.eventType)) throw new Error('Invalid CE-004 event type');
  if (input.recurrenceRisk === null || !RECURRENCE_RISKS.includes(input.recurrenceRisk)) {
    if (input.eventType === 'triaged') throw new Error('CE-004 triaged event requires recurrenceRisk');
    throw new Error('CE-004 lifecycle event requires recurrenceRisk');
  }
  if (input.patternKey !== undefined && input.patternKey !== null) boundedString(input.patternKey, 'CE-004 pattern key', 256);
  boundedString(input.summary, 'CE-004 event summary', 6000);
  if (!input.details || typeof input.details !== 'object' || Array.isArray(input.details)) {
    throw new Error('Invalid CE-004 event details');
  }
  boundedString(input.sourceSystem, 'CE-004 source system', 256);
  if (input.sourceRef !== undefined && input.sourceRef !== null) boundedString(input.sourceRef, 'CE-004 source reference', 4096);
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) boundedString(input.idempotencyKey, 'CE-004 idempotency key', 512);
  if ((input.eventType === 'resolved' || input.eventType === 'closed_no_action') && !input.sourceRef) {
    throw new Error('CE-004 terminal event requires sourceRef');
  }
  if (input.eventType === 'closed_no_action' && typeof input.details.disposition_reason !== 'string') {
    throw new Error('CE-004 closed_no_action requires details.disposition_reason');
  }
}

export async function loadFrictionFailureRegister(
  query: QueryFunction,
  request: FrictionFailureRegisterRequest,
): Promise<FrictionFailureRegisterEntry[]> {
  assertUuid(request.projectId, 'CE-004 project id');
  const result = await query<RegisterRow>(
    `SELECT *
       FROM comind.v_ce_friction_failure_register
      WHERE project_id=$1::uuid
      ORDER BY observed_at DESC,signal_id`,
    [request.projectId],
  );
  return result.rows.map(mapRow);
}

export function assessFrictionFailureRegister(
  rows: readonly RegisterRow[] | readonly FrictionFailureRegisterEntry[],
): FrictionFailureRegisterAssessment {
  const normalized = rows.map((row) => 'signalId' in row ? row as FrictionFailureRegisterEntry : mapRow(row as RegisterRow));
  const recommendedSignalIds = normalized
    .filter(row => row.improvementReviewRecommended)
    .map(row => row.signalId)
    .sort();
  return {
    total: normalized.length,
    openActionCount: normalized.filter(row => row.openAction).length,
    untriagedCount: normalized.filter(row => row.currentState === 'untriaged').length,
    terminalCount: normalized.filter(row => row.currentState === 'resolved' || row.currentState === 'closed_no_action').length,
    improvementReviewCount: recommendedSignalIds.length,
    recommendedSignalIds,
  };
}

export async function recordFrictionFailureEvent(
  query: QueryFunction,
  input: RecordFrictionFailureEventInput,
): Promise<RecordFrictionFailureEventResult> {
  validateEventInput(input);
  const details = JSON.stringify(input.details);
  const written = await query<{ event_id: string }>(
    `SELECT comind.record_ce_signal_event(
       $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9,$10,$11
     ) AS event_id`,
    [
      input.signalId,
      input.actorId ?? null,
      input.ownerActorId ?? null,
      input.eventType,
      input.recurrenceRisk,
      input.patternKey ?? null,
      input.summary,
      details,
      input.sourceSystem,
      input.sourceRef ?? null,
      input.idempotencyKey ?? null,
    ],
  );
  const eventId = written.rows[0]?.event_id;
  if (!eventId) throw new Error('CE-004 lifecycle writer returned no event id');

  const readback = await query<RegisterRow>(
    `SELECT *
       FROM comind.v_ce_friction_failure_register
      WHERE signal_id=$1::uuid`,
    [input.signalId],
  );
  const row = readback.rows[0];
  if (!row) throw new Error('CE-004 lifecycle event persisted without register readback');
  return { eventId, register: mapRow(row) };
}
