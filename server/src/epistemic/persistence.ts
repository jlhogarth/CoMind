import { pool, type QueryFunction } from '../db.js';
import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import {
  assessTransition,
  GER_POLICY_VERSION,
  type EpistemicObjectType,
  type EpistemicState,
  type RigorClass,
} from './ger.js';

export const GER_RUNTIME_ROLE = 'comind_ger_runtime';

export type GerEnvironment = 'development' | 'test' | 'production' | 'shared';
export type GerDataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'SECRET';
export type EpistemicRelationshipPredicate =
  | 'supports'
  | 'contradicts'
  | 'assumes'
  | 'derived_from'
  | 'competes_with'
  | 'tests'
  | 'falsifies'
  | 'weakens'
  | 'explains'
  | 'supersedes'
  | 'reopens'
  | 'decided_by'
  | 'authorized_by'
  | 'acted_by'
  | 'challenges'
  | 'reviews'
  | 'monitors'
  | 'references';

export type EpistemicEventType =
  | 'case_opened'
  | 'object_recorded'
  | 'relationship_recorded'
  | 'state_transition'
  | 'case_concluded'
  | 'case_reopened'
  | 'case_closed'
  | 'source_status_changed'
  | 'authority_changed'
  | 'review_recorded'
  | 'monitoring_recorded';

export type JsonObject = Record<string, unknown>;

export interface OpenEpistemicCaseInput {
  caseKey: string;
  subjectRef: string;
  purpose: string;
  environment: GerEnvironment;
  initialRigorClass: RigorClass;
  policyVersion?: string;
  dataClassification: GerDataClassification;
  retentionProfileKey: string;
  sourceRefs: string[];
  openedAt: string;
  openedByRef: string;
  authorityRef?: string;
  casePayload?: JsonObject;
  eventKey: string;
  eventPayload?: JsonObject;
}

export interface RecordEpistemicObjectInput {
  caseId: string;
  expectedPriorEventId: string;
  eventKey: string;
  objectKey: string;
  objectType: EpistemicObjectType;
  initialState: Extract<EpistemicState, 'unknown' | 'observed' | 'suspected'>;
  summary: string;
  canonicalRef?: string;
  sourceRefs: string[];
  validFrom?: string;
  validTo?: string;
  content?: JsonObject;
  createdAt: string;
  createdByRef: string;
  rationale: string;
  evidenceRefs?: string[];
  policyVersion?: string;
  eventPayload?: JsonObject;
}

export interface RecordEpistemicRelationshipInput {
  caseId: string;
  expectedPriorEventId: string;
  eventKey: string;
  relationshipKey: string;
  subjectObjectId: string;
  predicate: EpistemicRelationshipPredicate;
  objectObjectId: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  validFrom: string;
  validTo?: string;
  relationshipPayload?: JsonObject;
  createdAt: string;
  createdByRef: string;
  rationale: string;
  policyVersion?: string;
  eventPayload?: JsonObject;
}

export interface TransitionEpistemicObjectInput {
  caseId: string;
  expectedPriorEventId: string;
  eventKey: string;
  targetObjectId: string;
  from: EpistemicState;
  to: EpistemicState;
  actorRef: string;
  authorityRef?: string;
  rationale: string;
  evidenceRefs: string[];
  sourceRefs?: string[];
  policyVersion?: string;
  recordedAt: string;
  eventPayload?: JsonObject;
}

export interface AppendEpistemicCaseEventInput {
  caseId: string;
  expectedPriorEventId: string;
  eventKey: string;
  eventType: Exclude<EpistemicEventType, 'case_opened' | 'object_recorded' | 'relationship_recorded' | 'state_transition'>;
  targetObjectId?: string;
  actorRef: string;
  authorityRef?: string;
  rationale: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  policyVersion?: string;
  recordedAt: string;
  eventPayload?: JsonObject;
}

export interface EpistemicCaseRecord {
  case_id: string;
  persistence_seq: string;
  case_key: string;
  subject_ref: string;
  purpose: string;
  environment: GerEnvironment;
  initial_rigor_class: RigorClass;
  policy_version: string;
  data_classification: GerDataClassification;
  retention_profile_key: string;
  source_refs: string[];
  opened_at: string;
  opened_by_ref: string;
  authority_ref: string | null;
  case_digest: string;
  case_payload: JsonObject;
  inserted_at: string;
}

export interface EpistemicObjectRecord {
  object_id: string;
  persistence_seq: string;
  case_id: string;
  object_key: string;
  object_type: EpistemicObjectType;
  initial_state: EpistemicState;
  summary: string;
  canonical_ref: string | null;
  source_refs: string[];
  valid_from: string | null;
  valid_to: string | null;
  content: JsonObject;
  content_digest: string;
  created_at: string;
  created_by_ref: string;
  inserted_at: string;
}

export interface EpistemicRelationshipRecord {
  relationship_id: string;
  persistence_seq: string;
  relationship_key: string;
  case_id: string;
  subject_object_id: string;
  predicate: EpistemicRelationshipPredicate;
  object_object_id: string;
  evidence_refs: string[];
  source_refs: string[];
  valid_from: string;
  valid_to: string | null;
  relationship_digest: string;
  relationship_payload: JsonObject;
  created_at: string;
  created_by_ref: string;
  inserted_at: string;
}

export interface EpistemicEventRecord {
  event_id: string;
  persistence_seq: string;
  event_key: string;
  case_id: string;
  prior_event_id: string | null;
  event_type: EpistemicEventType;
  target_object_id: string | null;
  target_relationship_id: string | null;
  from_state: EpistemicState | null;
  to_state: EpistemicState | null;
  actor_ref: string;
  authority_ref: string | null;
  rationale: string;
  evidence_refs: string[];
  source_refs: string[];
  policy_version: string;
  recorded_at: string;
  event_digest: string;
  event_payload: JsonObject;
  inserted_at: string;
}

export interface EpistemicObjectStateRecord {
  object_id: string;
  case_id: string;
  object_key: string;
  object_type: EpistemicObjectType;
  summary: string;
  canonical_ref: string | null;
  current_state: EpistemicState;
  latest_transition_event_id: string | null;
  state_recorded_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  content_digest: string;
  created_at: string;
  created_by_ref: string;
}

export interface EpistemicCaseStatusRecord {
  case_id: string;
  case_key: string;
  subject_ref: string;
  environment: GerEnvironment;
  initial_rigor_class: RigorClass;
  policy_version: string;
  data_classification: GerDataClassification;
  retention_profile_key: string;
  case_status: 'open' | 'concluded' | 'reopened' | 'closed';
  status_recorded_at: string | null;
  latest_event_id: string | null;
  latest_event_type: EpistemicEventType | null;
  latest_event_at: string | null;
  object_count: string;
  relationship_count: string;
  opened_at: string;
  opened_by_ref: string;
  inserted_at: string;
}

export interface EpistemicCaseSnapshot {
  case: EpistemicCaseRecord;
  status: EpistemicCaseStatusRecord;
  objects: EpistemicObjectStateRecord[];
  relationships: EpistemicRelationshipRecord[];
  events: EpistemicEventRecord[];
}

function requireNonBlank(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function canonicalPolicyVersion(value?: string): string {
  return requireNonBlank(value ?? GER_POLICY_VERSION, 'policyVersion');
}

function digest(value: unknown): string {
  return fingerprintCanonicalValue(value);
}

function eventMaterial(input: {
  eventKey: string;
  caseId: string;
  priorEventId: string | null;
  eventType: EpistemicEventType;
  targetObjectId?: string | null;
  targetRelationshipId?: string | null;
  fromState?: EpistemicState | null;
  toState?: EpistemicState | null;
  actorRef: string;
  authorityRef?: string | null;
  rationale: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  policyVersion: string;
  recordedAt: string;
  eventPayload: JsonObject;
}): JsonObject {
  return {
    eventKey: input.eventKey,
    caseId: input.caseId,
    priorEventId: input.priorEventId,
    eventType: input.eventType,
    targetObjectId: input.targetObjectId ?? null,
    targetRelationshipId: input.targetRelationshipId ?? null,
    fromState: input.fromState ?? null,
    toState: input.toState ?? null,
    actorRef: input.actorRef,
    authorityRef: input.authorityRef ?? null,
    rationale: input.rationale,
    evidenceRefs: input.evidenceRefs,
    sourceRefs: input.sourceRefs,
    policyVersion: input.policyVersion,
    recordedAt: input.recordedAt,
    eventPayload: input.eventPayload,
  };
}

async function verifyRuntimeAccess(queryFn: QueryFunction): Promise<void> {
  const result = await queryFn<{
    can_set_role: boolean;
    case_select: boolean;
    case_insert: boolean;
    case_update: boolean;
    case_delete: boolean;
    event_select: boolean;
    event_insert: boolean;
    event_update: boolean;
    event_delete: boolean;
  }>(
    `SELECT pg_has_role(session_user, $1, 'SET') AS can_set_role,
            has_table_privilege($1, 'comind.cm_epistemic_case', 'SELECT') AS case_select,
            has_table_privilege($1, 'comind.cm_epistemic_case', 'INSERT') AS case_insert,
            has_table_privilege($1, 'comind.cm_epistemic_case', 'UPDATE') AS case_update,
            has_table_privilege($1, 'comind.cm_epistemic_case', 'DELETE') AS case_delete,
            has_table_privilege($1, 'comind.cm_epistemic_event', 'SELECT') AS event_select,
            has_table_privilege($1, 'comind.cm_epistemic_event', 'INSERT') AS event_insert,
            has_table_privilege($1, 'comind.cm_epistemic_event', 'UPDATE') AS event_update,
            has_table_privilege($1, 'comind.cm_epistemic_event', 'DELETE') AS event_delete`,
    [GER_RUNTIME_ROLE],
  );
  const access = result.rows[0];
  if (!access?.can_set_role || !access.case_select || !access.case_insert || access.case_update || access.case_delete
    || !access.event_select || !access.event_insert || access.event_update || access.event_delete) {
    throw new Error('GER runtime role is unavailable or has an unsafe privilege shape');
  }
}

async function withGerTransaction<T>(lockKey: string, work: (queryFn: QueryFunction) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard: Error | undefined;
  const queryFn: QueryFunction = async <TResult>(text: string, params?: any[]) => {
    const result = await client.query(text, params);
    return { rows: result.rows as TResult[] };
  };
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await verifyRuntimeAccess(queryFn);
    await client.query(`SET LOCAL ROLE ${GER_RUNTIME_ROLE}`);
    const identity = await client.query<{ current_user: string }>('SELECT current_user::text AS current_user');
    if (identity.rows[0]?.current_user !== GER_RUNTIME_ROLE) {
      throw new Error('GER transaction did not assume the constrained runtime role');
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ger:${lockKey}`]);
    const value = await work(queryFn);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = new Error('Discarding PostgreSQL connection after failed GER rollback');
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function currentHead(queryFn: QueryFunction, caseId: string): Promise<EpistemicEventRecord | null> {
  const result = await queryFn<EpistemicEventRecord>(
    `SELECT * FROM comind.cm_epistemic_event WHERE case_id=$1 ORDER BY persistence_seq DESC LIMIT 1`,
    [caseId],
  );
  return result.rows[0] ?? null;
}

async function assertExpectedHead(queryFn: QueryFunction, caseId: string, expectedPriorEventId: string): Promise<void> {
  const head = await currentHead(queryFn, caseId);
  if (!head) throw new Error(`GER case ${caseId} has no event lineage`);
  if (head.event_id !== expectedPriorEventId) {
    throw new Error(`GER stale case head: expected ${expectedPriorEventId}, current ${head.event_id}`);
  }
}

async function loadEventByKey(queryFn: QueryFunction, eventKey: string): Promise<EpistemicEventRecord | null> {
  const result = await queryFn<EpistemicEventRecord>(
    `SELECT * FROM comind.cm_epistemic_event WHERE event_key=$1`,
    [eventKey],
  );
  return result.rows[0] ?? null;
}

function assertReplayDigest(existing: EpistemicEventRecord, expectedDigest: string): EpistemicEventRecord {
  if (existing.event_digest !== expectedDigest) {
    throw new Error(`GER event key ${existing.event_key} was reused with different content`);
  }
  return existing;
}

async function insertEvent(queryFn: QueryFunction, input: ReturnType<typeof eventMaterial>): Promise<EpistemicEventRecord> {
  const expectedDigest = digest(input);
  const replay = await loadEventByKey(queryFn, input.eventKey as string);
  if (replay) return assertReplayDigest(replay, expectedDigest);
  const result = await queryFn<EpistemicEventRecord>(
    `INSERT INTO comind.cm_epistemic_event (
       event_key,case_id,prior_event_id,event_type,target_object_id,target_relationship_id,
       from_state,to_state,actor_ref,authority_ref,rationale,evidence_refs,source_refs,
       policy_version,recorded_at,event_digest,event_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17::jsonb)
     RETURNING *`,
    [
      input.eventKey,
      input.caseId,
      input.priorEventId,
      input.eventType,
      input.targetObjectId,
      input.targetRelationshipId,
      input.fromState,
      input.toState,
      input.actorRef,
      input.authorityRef,
      input.rationale,
      JSON.stringify(input.evidenceRefs),
      JSON.stringify(input.sourceRefs),
      input.policyVersion,
      input.recordedAt,
      expectedDigest,
      JSON.stringify(input.eventPayload),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('GER event insert returned no row');
  return row;
}

export async function openEpistemicCase(input: OpenEpistemicCaseInput): Promise<{ case: EpistemicCaseRecord; event: EpistemicEventRecord }> {
  const caseKey = requireNonBlank(input.caseKey, 'caseKey');
  const policyVersion = canonicalPolicyVersion(input.policyVersion);
  const casePayload = input.casePayload ?? {};
  const caseMaterial = {
    caseKey,
    subjectRef: requireNonBlank(input.subjectRef, 'subjectRef'),
    purpose: requireNonBlank(input.purpose, 'purpose'),
    environment: input.environment,
    initialRigorClass: input.initialRigorClass,
    policyVersion,
    dataClassification: input.dataClassification,
    retentionProfileKey: requireNonBlank(input.retentionProfileKey, 'retentionProfileKey'),
    sourceRefs: input.sourceRefs,
    openedAt: input.openedAt,
    openedByRef: requireNonBlank(input.openedByRef, 'openedByRef'),
    authorityRef: input.authorityRef ?? null,
    casePayload,
  };
  const caseDigest = digest(caseMaterial);

  return withGerTransaction(`case-key:${caseKey}`, async (queryFn) => {
    const existingResult = await queryFn<EpistemicCaseRecord>(
      `SELECT * FROM comind.cm_epistemic_case WHERE case_key=$1`,
      [caseKey],
    );
    let caseRow = existingResult.rows[0];
    if (caseRow) {
      if (caseRow.case_digest !== caseDigest) {
        throw new Error(`GER case key ${caseKey} was reused with different opening content`);
      }
    } else {
      const inserted = await queryFn<EpistemicCaseRecord>(
        `INSERT INTO comind.cm_epistemic_case (
           case_key,subject_ref,purpose,environment,initial_rigor_class,policy_version,
           data_classification,retention_profile_key,source_refs,opened_at,opened_by_ref,
           authority_ref,case_digest,case_payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb)
         RETURNING *`,
        [caseKey,caseMaterial.subjectRef,caseMaterial.purpose,input.environment,input.initialRigorClass,policyVersion,
          input.dataClassification,caseMaterial.retentionProfileKey,JSON.stringify(input.sourceRefs),input.openedAt,
          caseMaterial.openedByRef,input.authorityRef ?? null,caseDigest,JSON.stringify(casePayload)],
      );
      caseRow = inserted.rows[0];
      if (!caseRow) throw new Error('GER case insert returned no row');
    }

    const rootMaterial = eventMaterial({
      eventKey: requireNonBlank(input.eventKey, 'eventKey'),
      caseId: caseRow.case_id,
      priorEventId: null,
      eventType: 'case_opened',
      actorRef: caseMaterial.openedByRef,
      authorityRef: input.authorityRef,
      rationale: `Open epistemic case: ${caseMaterial.purpose}`,
      evidenceRefs: [],
      sourceRefs: input.sourceRefs,
      policyVersion,
      recordedAt: input.openedAt,
      eventPayload: input.eventPayload ?? {},
    });
    const event = await insertEvent(queryFn, rootMaterial);
    return { case: caseRow, event };
  });
}

export async function recordEpistemicObject(input: RecordEpistemicObjectInput): Promise<{ object: EpistemicObjectRecord; event: EpistemicEventRecord }> {
  const content = input.content ?? {};
  const contentDigest = digest({
    objectKey: input.objectKey,
    objectType: input.objectType,
    initialState: input.initialState,
    summary: input.summary,
    canonicalRef: input.canonicalRef ?? null,
    sourceRefs: input.sourceRefs,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    content,
    createdAt: input.createdAt,
    createdByRef: input.createdByRef,
  });
  const policyVersion = canonicalPolicyVersion(input.policyVersion);
  return withGerTransaction(`case-id:${input.caseId}`, async (queryFn) => {
    const existing = await queryFn<EpistemicObjectRecord>(`SELECT * FROM comind.cm_epistemic_object WHERE object_key=$1`, [input.objectKey]);
    let objectRow = existing.rows[0];
    if (objectRow) {
      if (objectRow.case_id !== input.caseId || objectRow.content_digest !== contentDigest) {
        throw new Error(`GER object key ${input.objectKey} was reused with different content`);
      }
    } else {
      await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
      const inserted = await queryFn<EpistemicObjectRecord>(
        `INSERT INTO comind.cm_epistemic_object (
           case_id,object_key,object_type,initial_state,summary,canonical_ref,source_refs,
           valid_from,valid_to,content,content_digest,created_at,created_by_ref
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13) RETURNING *`,
        [input.caseId,input.objectKey,input.objectType,input.initialState,input.summary,input.canonicalRef ?? null,
          JSON.stringify(input.sourceRefs),input.validFrom ?? null,input.validTo ?? null,JSON.stringify(content),contentDigest,
          input.createdAt,input.createdByRef],
      );
      objectRow = inserted.rows[0];
      if (!objectRow) throw new Error('GER object insert returned no row');
    }
    const material = eventMaterial({
      eventKey: input.eventKey,
      caseId: input.caseId,
      priorEventId: input.expectedPriorEventId,
      eventType: 'object_recorded',
      targetObjectId: objectRow.object_id,
      actorRef: input.createdByRef,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs ?? [],
      sourceRefs: input.sourceRefs,
      policyVersion,
      recordedAt: input.createdAt,
      eventPayload: input.eventPayload ?? {},
    });
    const replay = await loadEventByKey(queryFn, input.eventKey);
    if (!replay) await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
    const event = await insertEvent(queryFn, material);
    return { object: objectRow, event };
  });
}

export async function recordEpistemicRelationship(input: RecordEpistemicRelationshipInput): Promise<{ relationship: EpistemicRelationshipRecord; event: EpistemicEventRecord }> {
  const payload = input.relationshipPayload ?? {};
  const relationshipDigest = digest({
    relationshipKey: input.relationshipKey,
    caseId: input.caseId,
    subjectObjectId: input.subjectObjectId,
    predicate: input.predicate,
    objectObjectId: input.objectObjectId,
    evidenceRefs: input.evidenceRefs,
    sourceRefs: input.sourceRefs,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    payload,
    createdAt: input.createdAt,
    createdByRef: input.createdByRef,
  });
  const policyVersion = canonicalPolicyVersion(input.policyVersion);
  return withGerTransaction(`case-id:${input.caseId}`, async (queryFn) => {
    const existing = await queryFn<EpistemicRelationshipRecord>(`SELECT * FROM comind.cm_epistemic_relationship WHERE relationship_key=$1`, [input.relationshipKey]);
    let relationship = existing.rows[0];
    if (relationship) {
      if (relationship.case_id !== input.caseId || relationship.relationship_digest !== relationshipDigest) {
        throw new Error(`GER relationship key ${input.relationshipKey} was reused with different content`);
      }
    } else {
      await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
      const inserted = await queryFn<EpistemicRelationshipRecord>(
        `INSERT INTO comind.cm_epistemic_relationship (
           relationship_key,case_id,subject_object_id,predicate,object_object_id,evidence_refs,source_refs,
           valid_from,valid_to,relationship_digest,relationship_payload,created_at,created_by_ref
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13) RETURNING *`,
        [input.relationshipKey,input.caseId,input.subjectObjectId,input.predicate,input.objectObjectId,
          JSON.stringify(input.evidenceRefs),JSON.stringify(input.sourceRefs),input.validFrom,input.validTo ?? null,
          relationshipDigest,JSON.stringify(payload),input.createdAt,input.createdByRef],
      );
      relationship = inserted.rows[0];
      if (!relationship) throw new Error('GER relationship insert returned no row');
    }
    const material = eventMaterial({
      eventKey: input.eventKey,
      caseId: input.caseId,
      priorEventId: input.expectedPriorEventId,
      eventType: 'relationship_recorded',
      targetRelationshipId: relationship.relationship_id,
      actorRef: input.createdByRef,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
      sourceRefs: input.sourceRefs,
      policyVersion,
      recordedAt: input.createdAt,
      eventPayload: input.eventPayload ?? {},
    });
    const replay = await loadEventByKey(queryFn, input.eventKey);
    if (!replay) await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
    const event = await insertEvent(queryFn, material);
    return { relationship, event };
  });
}

export async function transitionEpistemicObject(input: TransitionEpistemicObjectInput): Promise<EpistemicEventRecord> {
  const assessment = assessTransition({
    from: input.from,
    to: input.to,
    reason: input.rationale,
    evidenceRefs: input.evidenceRefs,
    actorRef: input.actorRef,
    authorityRef: input.authorityRef,
  });
  if (!assessment.allowed) throw new Error(`GER transition rejected: ${assessment.reasons.join(' ')}`);
  const policyVersion = canonicalPolicyVersion(input.policyVersion);
  return withGerTransaction(`case-id:${input.caseId}`, async (queryFn) => {
    const material = eventMaterial({
      eventKey: input.eventKey,
      caseId: input.caseId,
      priorEventId: input.expectedPriorEventId,
      eventType: 'state_transition',
      targetObjectId: input.targetObjectId,
      fromState: input.from,
      toState: input.to,
      actorRef: input.actorRef,
      authorityRef: input.authorityRef,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
      sourceRefs: input.sourceRefs ?? [],
      policyVersion,
      recordedAt: input.recordedAt,
      eventPayload: input.eventPayload ?? {},
    });
    const replay = await loadEventByKey(queryFn, input.eventKey);
    if (replay) return assertReplayDigest(replay, digest(material));
    await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
    const state = await queryFn<EpistemicObjectStateRecord>(
      `SELECT * FROM comind.v_epistemic_object_state WHERE case_id=$1 AND object_id=$2`,
      [input.caseId,input.targetObjectId],
    );
    if (!state.rows[0]) throw new Error('GER transition target object does not exist in the case');
    if (state.rows[0].current_state !== input.from) {
      throw new Error(`GER stale object state: expected ${input.from}, current ${state.rows[0].current_state}`);
    }
    if (state.rows[0].object_type === 'connection_candidate' && input.to === 'concluded') {
      throw new Error('GER connection candidate cannot be concluded directly');
    }
    return insertEvent(queryFn, material);
  });
}

export async function appendEpistemicCaseEvent(input: AppendEpistemicCaseEventInput): Promise<EpistemicEventRecord> {
  const policyVersion = canonicalPolicyVersion(input.policyVersion);
  return withGerTransaction(`case-id:${input.caseId}`, async (queryFn) => {
    const material = eventMaterial({
      eventKey: input.eventKey,
      caseId: input.caseId,
      priorEventId: input.expectedPriorEventId,
      eventType: input.eventType,
      targetObjectId: input.targetObjectId,
      actorRef: input.actorRef,
      authorityRef: input.authorityRef,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
      sourceRefs: input.sourceRefs,
      policyVersion,
      recordedAt: input.recordedAt,
      eventPayload: input.eventPayload ?? {},
    });
    const replay = await loadEventByKey(queryFn, input.eventKey);
    if (replay) return assertReplayDigest(replay, digest(material));
    await assertExpectedHead(queryFn, input.caseId, input.expectedPriorEventId);
    return insertEvent(queryFn, material);
  });
}

export async function readEpistemicCaseSnapshot(caseId: string): Promise<EpistemicCaseSnapshot | null> {
  return withGerTransaction(`case-id:${caseId}`, async (queryFn) => {
    const caseResult = await queryFn<EpistemicCaseRecord>(`SELECT * FROM comind.cm_epistemic_case WHERE case_id=$1`, [caseId]);
    const caseRow = caseResult.rows[0];
    if (!caseRow) return null;
    const statusResult = await queryFn<EpistemicCaseStatusRecord>(`SELECT * FROM comind.v_epistemic_case_status WHERE case_id=$1`, [caseId]);
    const objects = await queryFn<EpistemicObjectStateRecord>(`SELECT * FROM comind.v_epistemic_object_state WHERE case_id=$1 ORDER BY created_at,object_id`, [caseId]);
    const relationships = await queryFn<EpistemicRelationshipRecord>(`SELECT * FROM comind.cm_epistemic_relationship WHERE case_id=$1 ORDER BY persistence_seq`, [caseId]);
    const events = await queryFn<EpistemicEventRecord>(`SELECT * FROM comind.cm_epistemic_event WHERE case_id=$1 ORDER BY persistence_seq`, [caseId]);
    const status = statusResult.rows[0];
    if (!status) throw new Error('GER case exists without a status projection');
    return { case: caseRow, status, objects: objects.rows, relationships: relationships.rows, events: events.rows };
  });
}
