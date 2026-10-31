import type { QueryFunction } from '../db.js';
import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import { acceptCheckpointProposal, verifyCheckpointProposal } from './checkpoint.js';
import { withThreadKeeperRuntimeTransaction } from './database.js';
import { semanticScopeKey, validateScopeBinding } from './scope.js';
import type {
  AuthorityValidationResult,
  CheckpointProposal,
  ContinuityAssessment,
  EvidenceRef,
  RouteCode,
  ScopeBinding,
} from './types.js';

export type ThreadKeeperCaseState =
  | 'OBSERVED'
  | 'ASSESSED'
  | 'ROUTED'
  | 'RESOLVED'
  | 'ACCEPTED_DIVERGENCE'
  | 'BLOCKED'
  | 'UNRESOLVED';

export interface StoredThreadKeeperScope {
  scope_id: string;
  scope_type: ScopeBinding['scopeType'];
  namespace: string;
  subject_ref: string;
  semantic_key: string;
  sensitivity_class: string;
  retention_class: string;
  created_at: Date;
  created_by_ref: string;
}

export interface StoredThreadKeeperCheckpoint {
  checkpoint_id: string;
  persistence_seq: string;
  scope_id: string;
  parent_checkpoint_id: string | null;
  proposal_id: string;
  scope_semantic_key: string;
  accepted_at: Date;
  accepted_by_ref: string;
  authority_evidence_ref: string;
  policy_ref: string | null;
  state_digest: string;
  digest: string;
  proposal: CheckpointProposal;
}

export interface PersistAssessmentInput {
  idempotencyKey: string;
  assessment: ContinuityAssessment;
  createdAt: string;
}

export interface StoredThreadKeeperAssessment {
  assessment_id: string;
  persistence_seq: string;
  idempotency_key: string;
  scope_id: string;
  checkpoint_id: string | null;
  observation_id: string;
  classification: ContinuityAssessment['classification'];
  assessment_digest: string;
  assessment: ContinuityAssessment;
  created_at: Date;
}

export interface OpenContinuityCaseInput {
  caseKey: string;
  scopeSemanticKey: string;
  openedFromAssessmentId: string;
  openedAt: string;
  openedByRef: string;
  evidenceRefs?: EvidenceRef[];
}

export interface StoredThreadKeeperCase {
  case_id: string;
  case_key: string;
  scope_id: string;
  opened_from_assessment_id: string;
  opened_at: Date;
  opened_by_ref: string;
}

export interface AppendCaseTransitionInput {
  transitionKey: string;
  caseId: string;
  expectedPriorTransitionId: string;
  toState: Exclude<ThreadKeeperCaseState, 'OBSERVED'>;
  routeCode?: RouteCode;
  actorRef: string;
  authorityEvidenceRef?: string;
  evidenceRefs?: EvidenceRef[];
  resolutionRef?: string;
  successorCheckpointId?: string;
  recordedAt: string;
}

export interface StoredThreadKeeperCaseTransition {
  transition_id: string;
  persistence_seq: string;
  transition_key: string;
  case_id: string;
  prior_transition_id: string | null;
  from_state: ThreadKeeperCaseState | null;
  to_state: ThreadKeeperCaseState;
  route_code: RouteCode | null;
  actor_ref: string;
  authority_evidence_ref: string | null;
  evidence_refs: EvidenceRef[];
  resolution_ref: string | null;
  successor_checkpoint_id: string | null;
  recorded_at: Date;
  transition_digest: string;
  transition: Record<string, unknown>;
}

export interface ThreadKeeperContext {
  scope: StoredThreadKeeperScope;
  acceptedCheckpoint: StoredThreadKeeperCheckpoint | null;
  unresolvedCases: Array<{
    caseId: string;
    caseKey: string;
    state: ThreadKeeperCaseState;
    latestTransitionId: string;
    lastTransitionAt: string;
  }>;
}

const CASE_STATES: ThreadKeeperCaseState[] = [
  'OBSERVED', 'ASSESSED', 'ROUTED', 'RESOLVED', 'ACCEPTED_DIVERGENCE', 'BLOCKED', 'UNRESOLVED',
];

function boundedString(value: unknown, field: string, max = 512): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizeDbTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requireEvidenceRefs(value: EvidenceRef[] | undefined): EvidenceRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Invalid ThreadKeeper evidence references');
  return structuredClone(value);
}

async function withThreadKeeperTransaction<T>(
  lockKey: string,
  work: (query: QueryFunction) => Promise<T>
): Promise<T> {
  boundedString(lockKey, 'ThreadKeeper transaction lock key', 4096);
  return withThreadKeeperRuntimeTransaction(
    query => work(query),
    { serializable: true, advisoryLockKey: lockKey },
  );
}

async function scopeBySemanticKey(query: QueryFunction, semanticKey: string): Promise<StoredThreadKeeperScope | null> {
  const result = await query<StoredThreadKeeperScope>(
    `SELECT scope_id::text, scope_type, namespace, subject_ref, semantic_key,
            sensitivity_class, retention_class, created_at, created_by_ref
       FROM comind.cm_threadkeeper_scope
      WHERE semantic_key=$1`,
    [semanticKey]
  );
  return result.rows[0] ?? null;
}

export async function registerContinuityScope(
  query: QueryFunction,
  binding: ScopeBinding,
  createdByRef: string,
  sensitivityClass: string,
  retentionClass: string
): Promise<StoredThreadKeeperScope> {
  validateScopeBinding(binding);
  boundedString(createdByRef, 'ThreadKeeper scope creator', 512);
  boundedString(sensitivityClass, 'ThreadKeeper sensitivity class', 128);
  boundedString(retentionClass, 'ThreadKeeper retention class', 128);
  const semanticKey = semanticScopeKey(binding);

  if (binding.scopeId) {
    const known = await query<StoredThreadKeeperScope>(
      `SELECT scope_id::text, scope_type, namespace, subject_ref, semantic_key,
              sensitivity_class, retention_class, created_at, created_by_ref
         FROM comind.cm_threadkeeper_scope
        WHERE scope_id=$1::uuid`,
      [binding.scopeId]
    );
    const row = known.rows[0];
    if (!row) throw new Error('Known ThreadKeeper scope id is unavailable');
    if (row.semantic_key !== semanticKey || row.scope_type !== binding.scopeType
        || row.namespace !== binding.namespace || row.subject_ref !== binding.subjectRef) {
      throw new Error('ThreadKeeper scope identity mismatch');
    }
    return row;
  }

  const inserted = await query<StoredThreadKeeperScope>(
    `INSERT INTO comind.cm_threadkeeper_scope (
       scope_type, namespace, subject_ref, semantic_key,
       sensitivity_class, retention_class, created_by_ref
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (semantic_key) DO NOTHING
     RETURNING scope_id::text, scope_type, namespace, subject_ref, semantic_key,
               sensitivity_class, retention_class, created_at, created_by_ref`,
    [binding.scopeType, binding.namespace, binding.subjectRef, semanticKey, sensitivityClass, retentionClass, createdByRef]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await scopeBySemanticKey(query, semanticKey);
  if (!existing) throw new Error('ThreadKeeper scope persistence outcome uncertain');
  if (existing.scope_type !== binding.scopeType || existing.namespace !== binding.namespace
      || existing.subject_ref !== binding.subjectRef) {
    throw new Error('ThreadKeeper semantic scope key collision');
  }
  return existing;
}

async function acceptedHead(
  query: QueryFunction,
  scopeId: string
): Promise<StoredThreadKeeperCheckpoint | null> {
  const result = await query<StoredThreadKeeperCheckpoint>(
    `SELECT checkpoint_id::text, persistence_seq::text, scope_id::text,
            parent_checkpoint_id::text, proposal_id, scope_semantic_key,
            accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
            state_digest, digest, proposal
       FROM comind.cm_threadkeeper_checkpoint
      WHERE scope_id=$1::uuid
      ORDER BY persistence_seq DESC
      LIMIT 1`,
    [scopeId]
  );
  return result.rows[0] ?? null;
}

export async function persistAcceptedCheckpoint(
  proposal: CheckpointProposal,
  authority: AuthorityValidationResult,
  acceptedAt: string
): Promise<{ checkpointId: string; proposal: CheckpointProposal; acceptedAt: string }> {
  if (!verifyCheckpointProposal(proposal)) throw new Error('ThreadKeeper checkpoint proposal integrity invalid');
  const preliminaryAcceptance = acceptCheckpointProposal(
    proposal,
    proposal.parentCheckpointId,
    authority,
    acceptedAt
  );
  if (!preliminaryAcceptance.accepted) {
    throw new Error(`ThreadKeeper checkpoint acceptance rejected: ${preliminaryAcceptance.reasonCode}`);
  }

  return withThreadKeeperTransaction(proposal.scopeSemanticKey, async query => {
    const scope = await scopeBySemanticKey(query, proposal.scopeSemanticKey);
    if (!scope) throw new Error('ThreadKeeper scope is unavailable for checkpoint acceptance');

    const existing = await query<StoredThreadKeeperCheckpoint>(
      `SELECT checkpoint_id::text, persistence_seq::text, scope_id::text,
              parent_checkpoint_id::text, proposal_id, scope_semantic_key,
              accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
              state_digest, digest, proposal
         FROM comind.cm_threadkeeper_checkpoint
        WHERE scope_id=$1::uuid AND proposal_id=$2`,
      [scope.scope_id, proposal.proposalId]
    );
    if (existing.rows[0]) {
      const stored = existing.rows[0];
      if (stored.digest !== proposal.digest
          || stored.accepted_by_ref !== preliminaryAcceptance.acceptedByRef
          || stored.authority_evidence_ref !== preliminaryAcceptance.authorityEvidenceRef
          || (stored.policy_ref ?? undefined) !== preliminaryAcceptance.policyRef) {
        throw new Error('ThreadKeeper proposal id reused with different accepted checkpoint evidence');
      }
      return {
        checkpointId: stored.checkpoint_id,
        proposal: stored.proposal,
        acceptedAt: normalizeDbTimestamp(stored.accepted_at),
      };
    }

    const head = await acceptedHead(query, scope.scope_id);
    const acceptance = acceptCheckpointProposal(
      proposal,
      head?.checkpoint_id ?? null,
      authority,
      acceptedAt
    );
    if (!acceptance.accepted) {
      throw new Error(`ThreadKeeper checkpoint acceptance rejected: ${acceptance.reasonCode}`);
    }

    const inserted = await query<StoredThreadKeeperCheckpoint>(
      `INSERT INTO comind.cm_threadkeeper_checkpoint (
         scope_id, parent_checkpoint_id, proposal_id, checkpoint_version,
         scope_semantic_key, proposed_at, proposed_by_ref,
         accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
         state_digest, digest, proposal
       ) VALUES (
         $1::uuid,$2::uuid,$3,1,$4,$5::timestamptz,$6,
         $7::timestamptz,$8,$9,$10,$11,$12,$13::jsonb
       )
       RETURNING checkpoint_id::text, persistence_seq::text, scope_id::text,
                 parent_checkpoint_id::text, proposal_id, scope_semantic_key,
                 accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
                 state_digest, digest, proposal`,
      [
        scope.scope_id,
        proposal.parentCheckpointId,
        proposal.proposalId,
        proposal.scopeSemanticKey,
        proposal.proposedAt,
        proposal.proposedByRef,
        acceptance.acceptedAt,
        acceptance.acceptedByRef,
        acceptance.authorityEvidenceRef,
        acceptance.policyRef ?? null,
        proposal.stateDigest,
        proposal.digest,
        JSON.stringify(proposal),
      ]
    );
    const stored = inserted.rows[0];
    if (!stored) throw new Error('ThreadKeeper accepted checkpoint persistence failed');
    return {
      checkpointId: stored.checkpoint_id,
      proposal: stored.proposal,
      acceptedAt: normalizeDbTimestamp(stored.accepted_at),
    };
  });
}

export async function persistAssessment(
  query: QueryFunction,
  input: PersistAssessmentInput
): Promise<StoredThreadKeeperAssessment> {
  boundedString(input.idempotencyKey, 'ThreadKeeper assessment idempotency key', 512);
  const createdAt = normalizeTimestamp(input.createdAt, 'ThreadKeeper assessment timestamp');
  const assessment = structuredClone(input.assessment);
  boundedString(assessment.scopeSemanticKey, 'ThreadKeeper assessment scope semantic key', 256);
  boundedString(assessment.observationId, 'ThreadKeeper assessment observation id', 512);
  boundedString(assessment.assessorVersion, 'ThreadKeeper assessor version', 256);
  if (!Number.isFinite(assessment.confidence) || assessment.confidence < 0 || assessment.confidence > 1
      || !Number.isFinite(assessment.uncertainty) || assessment.uncertainty < 0 || assessment.uncertainty > 1) {
    throw new Error('Invalid ThreadKeeper assessment confidence or uncertainty');
  }
  const scope = await scopeBySemanticKey(query, assessment.scopeSemanticKey);
  if (!scope) throw new Error('ThreadKeeper scope is unavailable for assessment persistence');
  const digest = fingerprintCanonicalValue(assessment);

  const inserted = await query<StoredThreadKeeperAssessment>(
    `INSERT INTO comind.cm_threadkeeper_assessment (
       idempotency_key, scope_id, checkpoint_id, observation_id, classification,
       reason_codes, break_types, confidence, uncertainty, evidence_refs,
       trace_id, assessor_version, assessment_digest, assessment, created_at
     ) VALUES (
       $1,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,
       $11,$12,$13,$14::jsonb,$15::timestamptz
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING assessment_id::text, persistence_seq::text, idempotency_key,
               scope_id::text, checkpoint_id::text, observation_id, classification,
               assessment_digest, assessment, created_at`,
    [
      input.idempotencyKey,
      scope.scope_id,
      assessment.checkpointId,
      assessment.observationId,
      assessment.classification,
      JSON.stringify(assessment.reasonCodes),
      JSON.stringify(assessment.breakTypes),
      assessment.confidence,
      assessment.uncertainty,
      JSON.stringify(assessment.evidenceRefs),
      assessment.traceId ?? null,
      assessment.assessorVersion,
      digest,
      JSON.stringify(assessment),
      createdAt,
    ]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await query<StoredThreadKeeperAssessment>(
    `SELECT assessment_id::text, persistence_seq::text, idempotency_key,
            scope_id::text, checkpoint_id::text, observation_id, classification,
            assessment_digest, assessment, created_at
       FROM comind.cm_threadkeeper_assessment
      WHERE idempotency_key=$1`,
    [input.idempotencyKey]
  );
  const stored = existing.rows[0];
  if (!stored) throw new Error('ThreadKeeper assessment persistence outcome uncertain');
  if (stored.assessment_digest !== digest) {
    throw new Error('ThreadKeeper assessment idempotency key reused with different evidence');
  }
  return stored;
}

function legalCaseTransition(from: ThreadKeeperCaseState, to: ThreadKeeperCaseState): boolean {
  if (from === 'OBSERVED') return ['ASSESSED', 'BLOCKED', 'UNRESOLVED'].includes(to);
  if (from === 'ASSESSED') return ['ASSESSED', 'ROUTED', 'BLOCKED', 'UNRESOLVED'].includes(to);
  if (from === 'ROUTED') return ['ASSESSED', 'RESOLVED', 'ACCEPTED_DIVERGENCE', 'BLOCKED', 'UNRESOLVED'].includes(to);
  if (from === 'BLOCKED' || from === 'UNRESOLVED') return to === 'ASSESSED';
  return false;
}

function transitionPayload(input: {
  fromState: ThreadKeeperCaseState | null;
  toState: ThreadKeeperCaseState;
  routeCode?: RouteCode;
  actorRef: string;
  authorityEvidenceRef?: string;
  evidenceRefs: EvidenceRef[];
  resolutionRef?: string;
  successorCheckpointId?: string;
  recordedAt: string;
}): Record<string, unknown> {
  return {
    fromState: input.fromState,
    toState: input.toState,
    routeCode: input.routeCode ?? null,
    actorRef: input.actorRef,
    authorityEvidenceRef: input.authorityEvidenceRef ?? null,
    evidenceRefs: structuredClone(input.evidenceRefs),
    resolutionRef: input.resolutionRef ?? null,
    successorCheckpointId: input.successorCheckpointId ?? null,
    recordedAt: input.recordedAt,
  };
}

export async function openContinuityCase(input: OpenContinuityCaseInput): Promise<{
  case: StoredThreadKeeperCase;
  transition: StoredThreadKeeperCaseTransition;
}> {
  boundedString(input.caseKey, 'ThreadKeeper case key', 512);
  boundedString(input.scopeSemanticKey, 'ThreadKeeper case scope semantic key', 256);
  boundedString(input.openedFromAssessmentId, 'ThreadKeeper case assessment id', 128);
  boundedString(input.openedByRef, 'ThreadKeeper case opener reference', 512);
  const openedAt = normalizeTimestamp(input.openedAt, 'ThreadKeeper case opening timestamp');
  const evidenceRefs = requireEvidenceRefs(input.evidenceRefs);

  return withThreadKeeperTransaction(`tk-case-key:${input.caseKey}`, async query => {
    const scope = await scopeBySemanticKey(query, input.scopeSemanticKey);
    if (!scope) throw new Error('ThreadKeeper scope is unavailable for case opening');

    const assessment = await query<{ assessment_id: string }>(
      `SELECT assessment_id::text
         FROM comind.cm_threadkeeper_assessment
        WHERE assessment_id=$1::uuid AND scope_id=$2::uuid`,
      [input.openedFromAssessmentId, scope.scope_id]
    );
    if (!assessment.rows[0]) throw new Error('ThreadKeeper case assessment is unavailable for this scope');

    const existing = await query<StoredThreadKeeperCase>(
      `SELECT case_id::text, case_key, scope_id::text, opened_from_assessment_id::text,
              opened_at, opened_by_ref
         FROM comind.cm_threadkeeper_case
        WHERE case_key=$1`,
      [input.caseKey]
    );
    let storedCase = existing.rows[0];
    if (storedCase) {
      if (storedCase.scope_id !== scope.scope_id
          || storedCase.opened_from_assessment_id !== input.openedFromAssessmentId) {
        throw new Error('ThreadKeeper case key reused with different evidence');
      }
    } else {
      const insertedCase = await query<StoredThreadKeeperCase>(
        `INSERT INTO comind.cm_threadkeeper_case (
           case_key, scope_id, opened_from_assessment_id, opened_at, opened_by_ref
         ) VALUES ($1,$2::uuid,$3::uuid,$4::timestamptz,$5)
         RETURNING case_id::text, case_key, scope_id::text,
                   opened_from_assessment_id::text, opened_at, opened_by_ref`,
        [input.caseKey, scope.scope_id, input.openedFromAssessmentId, openedAt, input.openedByRef]
      );
      storedCase = insertedCase.rows[0];
      if (!storedCase) throw new Error('ThreadKeeper case persistence failed');
    }

    const transitionKey = `tk-transition:${fingerprintCanonicalValue({ caseKey: input.caseKey, state: 'OBSERVED' })}`;
    const existingTransition = await query<StoredThreadKeeperCaseTransition>(
      `SELECT transition_id::text, persistence_seq::text, transition_key, case_id::text,
              prior_transition_id::text, from_state, to_state, route_code, actor_ref,
              authority_evidence_ref, evidence_refs, resolution_ref,
              successor_checkpoint_id::text, recorded_at, transition_digest, transition
         FROM comind.cm_threadkeeper_case_transition
        WHERE transition_key=$1`,
      [transitionKey]
    );
    if (existingTransition.rows[0]) return { case: storedCase, transition: existingTransition.rows[0] };

    const payload = transitionPayload({
      fromState: null,
      toState: 'OBSERVED',
      actorRef: input.openedByRef,
      evidenceRefs,
      recordedAt: openedAt,
    });
    const transitionDigest = fingerprintCanonicalValue(payload);
    const insertedTransition = await query<StoredThreadKeeperCaseTransition>(
      `INSERT INTO comind.cm_threadkeeper_case_transition (
         transition_key, case_id, prior_transition_id, from_state, to_state,
         route_code, actor_ref, authority_evidence_ref, evidence_refs,
         resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
       ) VALUES ($1,$2::uuid,NULL,NULL,'OBSERVED',NULL,$3,NULL,$4::jsonb,NULL,NULL,$5::timestamptz,$6,$7::jsonb)
       RETURNING transition_id::text, persistence_seq::text, transition_key, case_id::text,
                 prior_transition_id::text, from_state, to_state, route_code, actor_ref,
                 authority_evidence_ref, evidence_refs, resolution_ref,
                 successor_checkpoint_id::text, recorded_at, transition_digest, transition`,
      [transitionKey, storedCase.case_id, input.openedByRef, JSON.stringify(evidenceRefs), openedAt, transitionDigest, JSON.stringify(payload)]
    );
    const transition = insertedTransition.rows[0];
    if (!transition) throw new Error('ThreadKeeper initial case transition persistence failed');
    return { case: storedCase, transition };
  });
}

export async function appendCaseTransition(
  input: AppendCaseTransitionInput
): Promise<StoredThreadKeeperCaseTransition> {
  boundedString(input.transitionKey, 'ThreadKeeper transition key', 512);
  boundedString(input.caseId, 'ThreadKeeper case id', 128);
  boundedString(input.expectedPriorTransitionId, 'ThreadKeeper prior transition id', 128);
  boundedString(input.actorRef, 'ThreadKeeper transition actor', 512);
  if (!CASE_STATES.includes(input.toState)) throw new Error('Invalid ThreadKeeper case state');
  if (input.authorityEvidenceRef !== undefined) boundedString(input.authorityEvidenceRef, 'ThreadKeeper authority evidence', 4096);
  if (input.resolutionRef !== undefined) boundedString(input.resolutionRef, 'ThreadKeeper resolution reference', 4096);
  if (input.successorCheckpointId !== undefined) boundedString(input.successorCheckpointId, 'ThreadKeeper successor checkpoint id', 128);
  const evidenceRefs = requireEvidenceRefs(input.evidenceRefs);
  const recordedAt = normalizeTimestamp(input.recordedAt, 'ThreadKeeper transition timestamp');

  return withThreadKeeperTransaction(`tk-case:${input.caseId}`, async query => {
    const duplicate = await query<StoredThreadKeeperCaseTransition>(
      `SELECT transition_id::text, persistence_seq::text, transition_key, case_id::text,
              prior_transition_id::text, from_state, to_state, route_code, actor_ref,
              authority_evidence_ref, evidence_refs, resolution_ref,
              successor_checkpoint_id::text, recorded_at, transition_digest, transition
         FROM comind.cm_threadkeeper_case_transition
        WHERE transition_key=$1`,
      [input.transitionKey]
    );
    if (duplicate.rows[0]) {
      if (duplicate.rows[0].case_id !== input.caseId) {
        throw new Error('ThreadKeeper transition key reused across cases');
      }
      return duplicate.rows[0];
    }

    const caseResult = await query<{ case_id: string; scope_id: string }>(
      `SELECT case_id::text, scope_id::text
         FROM comind.cm_threadkeeper_case
        WHERE case_id=$1::uuid`,
      [input.caseId]
    );
    const storedCase = caseResult.rows[0];
    if (!storedCase) throw new Error('ThreadKeeper case is unavailable');

    const latest = await query<StoredThreadKeeperCaseTransition>(
      `SELECT transition_id::text, persistence_seq::text, transition_key, case_id::text,
              prior_transition_id::text, from_state, to_state, route_code, actor_ref,
              authority_evidence_ref, evidence_refs, resolution_ref,
              successor_checkpoint_id::text, recorded_at, transition_digest, transition
         FROM comind.cm_threadkeeper_case_transition
        WHERE case_id=$1::uuid
        ORDER BY persistence_seq DESC
        LIMIT 1`,
      [input.caseId]
    );
    const current = latest.rows[0];
    if (!current) throw new Error('ThreadKeeper case has no OBSERVED transition');
    if (current.transition_id !== input.expectedPriorTransitionId) {
      throw new Error('ThreadKeeper case transition stale head');
    }
    if (!legalCaseTransition(current.to_state, input.toState)) {
      throw new Error(`Illegal ThreadKeeper case transition from ${current.to_state} to ${input.toState}`);
    }
    if (input.toState === 'ROUTED' && !input.routeCode) {
      throw new Error('ROUTED ThreadKeeper case transition requires route code');
    }
    if (input.toState === 'RESOLVED' && !input.resolutionRef) {
      throw new Error('RESOLVED ThreadKeeper case transition requires resolution reference');
    }
    if (input.toState === 'ACCEPTED_DIVERGENCE' && (!input.authorityEvidenceRef || !input.successorCheckpointId)) {
      throw new Error('ACCEPTED_DIVERGENCE requires authority evidence and successor checkpoint');
    }
    if (input.successorCheckpointId) {
      const checkpoint = await query<{ checkpoint_id: string }>(
        `SELECT checkpoint_id::text
           FROM comind.cm_threadkeeper_checkpoint
          WHERE checkpoint_id=$1::uuid AND scope_id=$2::uuid`,
        [input.successorCheckpointId, storedCase.scope_id]
      );
      if (!checkpoint.rows[0]) throw new Error('ThreadKeeper successor checkpoint is unavailable for this case scope');
    }

    const payload = transitionPayload({
      fromState: current.to_state,
      toState: input.toState,
      ...(input.routeCode ? { routeCode: input.routeCode } : {}),
      actorRef: input.actorRef,
      ...(input.authorityEvidenceRef ? { authorityEvidenceRef: input.authorityEvidenceRef } : {}),
      evidenceRefs,
      ...(input.resolutionRef ? { resolutionRef: input.resolutionRef } : {}),
      ...(input.successorCheckpointId ? { successorCheckpointId: input.successorCheckpointId } : {}),
      recordedAt,
    });
    const digest = fingerprintCanonicalValue(payload);

    const inserted = await query<StoredThreadKeeperCaseTransition>(
      `INSERT INTO comind.cm_threadkeeper_case_transition (
         transition_key, case_id, prior_transition_id, from_state, to_state,
         route_code, actor_ref, authority_evidence_ref, evidence_refs,
         resolution_ref, successor_checkpoint_id, recorded_at, transition_digest, transition
       ) VALUES (
         $1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::uuid,$12::timestamptz,$13,$14::jsonb
       )
       RETURNING transition_id::text, persistence_seq::text, transition_key, case_id::text,
                 prior_transition_id::text, from_state, to_state, route_code, actor_ref,
                 authority_evidence_ref, evidence_refs, resolution_ref,
                 successor_checkpoint_id::text, recorded_at, transition_digest, transition`,
      [
        input.transitionKey,
        input.caseId,
        current.transition_id,
        current.to_state,
        input.toState,
        input.routeCode ?? null,
        input.actorRef,
        input.authorityEvidenceRef ?? null,
        JSON.stringify(evidenceRefs),
        input.resolutionRef ?? null,
        input.successorCheckpointId ?? null,
        recordedAt,
        digest,
        JSON.stringify(payload),
      ]
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('ThreadKeeper case transition persistence failed');
    return row;
  });
}

export async function getCheckpointLineage(
  query: QueryFunction,
  scopeSemanticKey: string
): Promise<StoredThreadKeeperCheckpoint[]> {
  boundedString(scopeSemanticKey, 'ThreadKeeper lineage scope semantic key', 256);
  const scope = await scopeBySemanticKey(query, scopeSemanticKey);
  if (!scope) return [];
  const result = await query<StoredThreadKeeperCheckpoint>(
    `SELECT checkpoint_id::text, persistence_seq::text, scope_id::text,
            parent_checkpoint_id::text, proposal_id, scope_semantic_key,
            accepted_at, accepted_by_ref, authority_evidence_ref, policy_ref,
            state_digest, digest, proposal
       FROM comind.cm_threadkeeper_checkpoint
      WHERE scope_id=$1::uuid
      ORDER BY persistence_seq ASC`,
    [scope.scope_id]
  );
  return result.rows;
}

export async function getContinuityContext(
  query: QueryFunction,
  scopeSemanticKey: string
): Promise<ThreadKeeperContext | null> {
  boundedString(scopeSemanticKey, 'ThreadKeeper context scope semantic key', 256);
  const scope = await scopeBySemanticKey(query, scopeSemanticKey);
  if (!scope) return null;
  const head = await acceptedHead(query, scope.scope_id);
  const cases = await query<{
    case_id: string;
    case_key: string;
    to_state: ThreadKeeperCaseState;
    transition_id: string;
    recorded_at: Date;
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (t.case_id)
              t.case_id, t.transition_id, t.to_state, t.recorded_at, t.persistence_seq
         FROM comind.cm_threadkeeper_case_transition t
        ORDER BY t.case_id, t.persistence_seq DESC
     )
     SELECT c.case_id::text, c.case_key, latest.to_state,
            latest.transition_id::text, latest.recorded_at
       FROM comind.cm_threadkeeper_case c
       JOIN latest ON latest.case_id=c.case_id
      WHERE c.scope_id=$1::uuid
        AND latest.to_state NOT IN ('RESOLVED','ACCEPTED_DIVERGENCE')
      ORDER BY latest.recorded_at ASC, c.case_id ASC`,
    [scope.scope_id]
  );
  return {
    scope,
    acceptedCheckpoint: head,
    unresolvedCases: cases.rows.map(row => ({
      caseId: row.case_id,
      caseKey: row.case_key,
      state: row.to_state,
      latestTransitionId: row.transition_id,
      lastTransitionAt: normalizeDbTimestamp(row.recorded_at),
    })),
  };
}
