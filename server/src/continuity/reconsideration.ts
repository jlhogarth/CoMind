import { fingerprintCanonicalValue } from './checkpoint.js';

export const DECISION_RECONSIDERATION_RECORD_VERSION = 'decision-reconsideration-record-v1' as const;
export const DECISION_RECONSIDERATION_EVALUATION_VERSION = 'decision-reconsideration-evaluation-v1' as const;
export const DECISION_RECONSIDERATION_REVIEW_VERSION = 'decision-reconsideration-review-v1' as const;

const MAX_ITEMS = 256;
const MAX_REF_LENGTH = 1024;

export interface FourSidedDecisionAnalysisRefs {
  supportRefs: string[];
  defeatRefs: string[];
  choosingCostRefs: string[];
  rejectingCostRefs: string[];
}

export interface RejectedDecisionAlternative {
  alternativeRef: string;
  rejectionReasonRefs: string[];
}

export type ThresholdOperator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt';

export type ReconsiderationCondition =
  | { conditionId: string; kind: 'threshold'; metricRef: string; operator: ThresholdOperator; threshold: number; unitRef: string }
  | { conditionId: string; kind: 'external_state'; subjectRef: string; expectedStateRef: string }
  | { conditionId: string; kind: 'policy_change'; policyRef: string; fromVersionRef: string; toVersionRef: string }
  | { conditionId: string; kind: 'dependency_change'; dependencyScopeSemanticKey: string; fromCheckpointId: string; toCheckpointId: string }
  | { conditionId: string; kind: 'expiry'; notBefore: string }
  | { conditionId: string; kind: 'evidence_arrival'; evidenceClassRef: string };

export interface DecisionReconsiderationTrigger {
  triggerId: string;
  targetAlternativeRefs: string[];
  conditions: ReconsiderationCondition[];
  matchPolicy: 'all';
  evidenceRefs: string[];
  sourceRef: string;
  createdAt: string;
  status: 'current' | 'retired';
}

export interface DecisionReconsiderationRecord {
  version: typeof DECISION_RECONSIDERATION_RECORD_VERSION;
  scopeSemanticKey: string;
  checkpointId: string;
  decisionRef: string;
  selectedOptionRef: string;
  rationaleRefs: string[];
  analysis: FourSidedDecisionAnalysisRefs;
  rejectedAlternatives: RejectedDecisionAlternative[];
  triggers: DecisionReconsiderationTrigger[];
  authorityEvidenceRefs: string[];
  policyRefs: string[];
  recordDigest: string;
}

export interface CreateDecisionReconsiderationRecordInput {
  scopeSemanticKey: string;
  checkpointId: string;
  decisionRef: string;
  selectedOptionRef: string;
  rationaleRefs: string[];
  analysis: FourSidedDecisionAnalysisRefs;
  rejectedAlternatives: RejectedDecisionAlternative[];
  triggers: DecisionReconsiderationTrigger[];
  authorityEvidenceRefs: string[];
  policyRefs: string[];
}

export type ReconsiderationObservedValue =
  | { kind: 'threshold'; metricRef: string; value: number; unitRef: string }
  | { kind: 'external_state'; subjectRef: string; stateRef: string }
  | { kind: 'policy_change'; policyRef: string; fromVersionRef: string; toVersionRef: string }
  | { kind: 'dependency_change'; dependencyScopeSemanticKey: string; fromCheckpointId: string; toCheckpointId: string }
  | { kind: 'evidence_arrival'; evidenceClassRef: string };

export interface ReconsiderationObservation {
  observationId: string;
  triggerId: string;
  conditionId: string;
  assertionMode: 'explicit_evidence';
  disposition: 'observed' | 'invalidated';
  value: ReconsiderationObservedValue | null;
  observedAt: string;
  evidenceRefs: string[];
  sourceRef: string;
}

export type ReconsiderationConditionStatus = 'SATISFIED' | 'NOT_SATISFIED' | 'NO_EVIDENCE' | 'INVALIDATED';
export type DecisionReconsiderationStatus = 'UNRESOLVED' | 'PARTIALLY_SATISFIED' | 'SATISFIED' | 'INVALIDATED';

export interface ReconsiderationConditionResult {
  conditionId: string;
  status: ReconsiderationConditionStatus;
  observationId: string | null;
  evidenceRefs: string[];
}

export interface DecisionReconsiderationEvaluation {
  version: typeof DECISION_RECONSIDERATION_EVALUATION_VERSION;
  decisionRef: string;
  scopeSemanticKey: string;
  checkpointId: string;
  triggerId: string;
  status: DecisionReconsiderationStatus;
  evaluatedAt: string;
  targetAlternativeRefs: string[];
  conditions: ReconsiderationConditionResult[];
  evidenceRefs: string[];
  recordDigest: string;
  evaluationDigest: string;
}

export interface DecisionReconsiderationReviewRequest {
  version: typeof DECISION_RECONSIDERATION_REVIEW_VERSION;
  decisionRef: string;
  scopeSemanticKey: string;
  checkpointId: string;
  triggerId: string;
  targetAlternativeRefs: string[];
  evidenceRefs: string[];
  recordDigest: string;
  evaluationDigest: string;
  recommendedRoute: 'OPEN_CONTINUITY_REVIEW';
  authorityMode: 'requires_independent_review';
  automaticDecisionChange: false;
  reviewRequestDigest: string;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REF_LENGTH || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function timestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function refs(values: readonly string[], field: string, required = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS || (required && values.length === 0)) throw new Error(`Invalid ${field}`);
  const result = values.map((value, index) => {
    requiredText(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(result).size !== result.length) throw new Error(`Duplicate ${field}`);
  return [...result].sort();
}

function normalizeAnalysis(value: FourSidedDecisionAnalysisRefs): FourSidedDecisionAnalysisRefs {
  if (!value || typeof value !== 'object') throw new Error('Invalid four-sided decision analysis');
  return {
    supportRefs: refs(value.supportRefs, 'decision support references'),
    defeatRefs: refs(value.defeatRefs, 'decision defeat references'),
    choosingCostRefs: refs(value.choosingCostRefs, 'choosing cost references'),
    rejectingCostRefs: refs(value.rejectingCostRefs, 'rejecting cost references'),
  };
}

function normalizeAlternative(value: RejectedDecisionAlternative): RejectedDecisionAlternative {
  requiredText(value.alternativeRef, 'rejected alternative reference');
  return { alternativeRef: value.alternativeRef, rejectionReasonRefs: refs(value.rejectionReasonRefs, 'rejection reason references', true) };
}

function normalizeCondition(value: ReconsiderationCondition): ReconsiderationCondition {
  requiredText(value.conditionId, 'reconsideration condition id');
  switch (value.kind) {
    case 'threshold':
      requiredText(value.metricRef, 'threshold metric reference');
      requiredText(value.unitRef, 'threshold unit reference');
      if (!['lt', 'lte', 'eq', 'gte', 'gt'].includes(value.operator) || !Number.isFinite(value.threshold)) {
        throw new Error('Invalid threshold reconsideration condition');
      }
      return { ...value };
    case 'external_state':
      requiredText(value.subjectRef, 'external state subject reference');
      requiredText(value.expectedStateRef, 'expected external state reference');
      return { ...value };
    case 'policy_change':
      requiredText(value.policyRef, 'policy change policy reference');
      requiredText(value.fromVersionRef, 'policy change source version');
      requiredText(value.toVersionRef, 'policy change target version');
      if (value.fromVersionRef === value.toVersionRef) throw new Error('Policy change requires distinct versions');
      return { ...value };
    case 'dependency_change':
      requiredText(value.dependencyScopeSemanticKey, 'dependency change scope key');
      requiredText(value.fromCheckpointId, 'dependency source checkpoint');
      requiredText(value.toCheckpointId, 'dependency target checkpoint');
      if (value.fromCheckpointId === value.toCheckpointId) throw new Error('Dependency change requires distinct checkpoints');
      return { ...value };
    case 'expiry':
      return { ...value, notBefore: timestamp(value.notBefore, 'reconsideration expiry timestamp') };
    case 'evidence_arrival':
      requiredText(value.evidenceClassRef, 'evidence arrival class reference');
      return { ...value };
  }
}

function normalizeTrigger(value: DecisionReconsiderationTrigger, alternatives: ReadonlySet<string>): DecisionReconsiderationTrigger {
  requiredText(value.triggerId, 'reconsideration trigger id');
  if (value.matchPolicy !== 'all') throw new Error('Only all-condition reconsideration triggers are supported');
  const targetAlternativeRefs = refs(value.targetAlternativeRefs, 'trigger alternative references', true);
  for (const target of targetAlternativeRefs) if (!alternatives.has(target)) throw new Error('Reconsideration trigger targets an unknown rejected alternative');
  if (!Array.isArray(value.conditions) || value.conditions.length === 0 || value.conditions.length > MAX_ITEMS) {
    throw new Error('Invalid reconsideration trigger conditions');
  }
  const conditions = value.conditions.map(normalizeCondition).sort((a, b) => a.conditionId.localeCompare(b.conditionId));
  if (new Set(conditions.map(item => item.conditionId)).size !== conditions.length) throw new Error('Duplicate reconsideration condition id');
  requiredText(value.sourceRef, 'trigger source reference');
  if (value.status !== 'current' && value.status !== 'retired') throw new Error('Invalid reconsideration trigger status');
  return {
    ...value,
    targetAlternativeRefs,
    conditions,
    evidenceRefs: refs(value.evidenceRefs, 'trigger evidence references', true),
    createdAt: timestamp(value.createdAt, 'trigger creation timestamp'),
  };
}

export function createDecisionReconsiderationRecord(input: CreateDecisionReconsiderationRecordInput): DecisionReconsiderationRecord {
  requiredText(input.scopeSemanticKey, 'decision continuity scope key');
  requiredText(input.checkpointId, 'decision checkpoint id');
  requiredText(input.decisionRef, 'decision reference');
  requiredText(input.selectedOptionRef, 'selected option reference');
  if (!Array.isArray(input.rejectedAlternatives) || input.rejectedAlternatives.length === 0 || input.rejectedAlternatives.length > MAX_ITEMS) {
    throw new Error('Decision reconsideration requires rejected alternatives');
  }
  const rejectedAlternatives = input.rejectedAlternatives.map(normalizeAlternative).sort((a, b) => a.alternativeRef.localeCompare(b.alternativeRef));
  if (new Set(rejectedAlternatives.map(item => item.alternativeRef)).size !== rejectedAlternatives.length) throw new Error('Duplicate rejected alternative reference');
  if (rejectedAlternatives.some(item => item.alternativeRef === input.selectedOptionRef)) throw new Error('Selected option cannot also be a rejected alternative');
  const alternativeRefs = new Set(rejectedAlternatives.map(item => item.alternativeRef));
  if (!Array.isArray(input.triggers) || input.triggers.length === 0 || input.triggers.length > MAX_ITEMS) throw new Error('Decision reconsideration requires at least one trigger');
  const triggers = input.triggers.map(item => normalizeTrigger(item, alternativeRefs)).sort((a, b) => a.triggerId.localeCompare(b.triggerId));
  if (new Set(triggers.map(item => item.triggerId)).size !== triggers.length) throw new Error('Duplicate reconsideration trigger id');
  const payload: Omit<DecisionReconsiderationRecord, 'recordDigest'> = {
    version: DECISION_RECONSIDERATION_RECORD_VERSION,
    scopeSemanticKey: input.scopeSemanticKey,
    checkpointId: input.checkpointId,
    decisionRef: input.decisionRef,
    selectedOptionRef: input.selectedOptionRef,
    rationaleRefs: refs(input.rationaleRefs, 'decision rationale references', true),
    analysis: normalizeAnalysis(input.analysis),
    rejectedAlternatives,
    triggers,
    authorityEvidenceRefs: refs(input.authorityEvidenceRefs, 'decision authority evidence references', true),
    policyRefs: refs(input.policyRefs, 'decision policy references', true),
  };
  return Object.freeze({ ...payload, recordDigest: fingerprintCanonicalValue(payload) });
}

function recordPayload(record: DecisionReconsiderationRecord): Omit<DecisionReconsiderationRecord, 'recordDigest'> {
  const { recordDigest: _digest, ...payload } = record;
  return payload;
}

export function verifyDecisionReconsiderationRecord(record: DecisionReconsiderationRecord): boolean {
  try {
    if (!record || record.version !== DECISION_RECONSIDERATION_RECORD_VERSION) return false;
    const rebuilt = createDecisionReconsiderationRecord(record);
    return rebuilt.recordDigest === record.recordDigest && fingerprintCanonicalValue(recordPayload(record)) === record.recordDigest;
  } catch {
    return false;
  }
}

function normalizeObservation(value: ReconsiderationObservation): ReconsiderationObservation {
  requiredText(value.observationId, 'reconsideration observation id');
  requiredText(value.triggerId, 'reconsideration observation trigger id');
  requiredText(value.conditionId, 'reconsideration observation condition id');
  if (value.assertionMode !== 'explicit_evidence') throw new Error('Reconsideration observations require explicit evidence');
  if (value.disposition !== 'observed' && value.disposition !== 'invalidated') throw new Error('Invalid reconsideration observation disposition');
  if (value.disposition === 'observed' && !value.value) throw new Error('Observed reconsideration evidence requires a value');
  if (value.disposition === 'invalidated' && value.value !== null) throw new Error('Invalidated reconsideration evidence must not carry a value');
  requiredText(value.sourceRef, 'reconsideration observation source reference');
  return { ...value, evidenceRefs: refs(value.evidenceRefs, 'reconsideration observation evidence references', true), observedAt: timestamp(value.observedAt, 'reconsideration observation timestamp') };
}

function matches(condition: Exclude<ReconsiderationCondition, { kind: 'expiry' }>, value: ReconsiderationObservedValue): boolean {
  if (condition.kind !== value.kind) throw new Error('Observation kind does not match reconsideration condition');
  switch (condition.kind) {
    case 'threshold': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'threshold' }>;
      if (condition.metricRef !== observed.metricRef || condition.unitRef !== observed.unitRef || !Number.isFinite(observed.value)) return false;
      if (condition.operator === 'lt') return observed.value < condition.threshold;
      if (condition.operator === 'lte') return observed.value <= condition.threshold;
      if (condition.operator === 'eq') return observed.value === condition.threshold;
      if (condition.operator === 'gte') return observed.value >= condition.threshold;
      return observed.value > condition.threshold;
    }
    case 'external_state': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'external_state' }>;
      return observed.subjectRef === condition.subjectRef && observed.stateRef === condition.expectedStateRef;
    }
    case 'policy_change': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'policy_change' }>;
      return observed.policyRef === condition.policyRef && observed.fromVersionRef === condition.fromVersionRef && observed.toVersionRef === condition.toVersionRef;
    }
    case 'dependency_change': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'dependency_change' }>;
      return observed.dependencyScopeSemanticKey === condition.dependencyScopeSemanticKey && observed.fromCheckpointId === condition.fromCheckpointId && observed.toCheckpointId === condition.toCheckpointId;
    }
    case 'evidence_arrival': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'evidence_arrival' }>;
      return observed.evidenceClassRef === condition.evidenceClassRef;
    }
  }
}

function latestByCondition(observations: readonly ReconsiderationObservation[], triggerId: string, validIds: ReadonlySet<string>): Map<string, ReconsiderationObservation> {
  const result = new Map<string, ReconsiderationObservation>();
  const observationIds = new Set<string>();
  for (const raw of observations) {
    const observation = normalizeObservation(raw);
    if (observationIds.has(observation.observationId)) throw new Error('Duplicate reconsideration observation id');
    observationIds.add(observation.observationId);
    if (observation.triggerId !== triggerId) continue;
    if (!validIds.has(observation.conditionId)) throw new Error('Observation references an unknown reconsideration condition');
    const prior = result.get(observation.conditionId);
    if (!prior || Date.parse(observation.observedAt) > Date.parse(prior.observedAt)
        || (observation.observedAt === prior.observedAt && observation.observationId.localeCompare(prior.observationId) > 0)) {
      result.set(observation.conditionId, observation);
    }
  }
  return result;
}

function uniqueRefs(values: readonly string[][]): string[] {
  return [...new Set(values.flat())].sort();
}

export function evaluateDecisionReconsiderationTrigger(
  record: DecisionReconsiderationRecord,
  triggerId: string,
  observations: readonly ReconsiderationObservation[],
  evaluatedAt: string
): DecisionReconsiderationEvaluation {
  if (!verifyDecisionReconsiderationRecord(record)) throw new Error('Invalid decision reconsideration record');
  requiredText(triggerId, 'reconsideration trigger id');
  const trigger = record.triggers.find(item => item.triggerId === triggerId);
  if (!trigger) throw new Error('Unknown reconsideration trigger');
  const normalizedEvaluatedAt = timestamp(evaluatedAt, 'reconsideration evaluation timestamp');
  const evaluatedAtMs = Date.parse(normalizedEvaluatedAt);
  if (evaluatedAtMs < Date.parse(trigger.createdAt)) throw new Error('Reconsideration trigger cannot be evaluated before creation');
  if (!Array.isArray(observations) || observations.length > MAX_ITEMS) throw new Error('Invalid reconsideration observations');
  const validIds = new Set(trigger.conditions.map(item => item.conditionId));
  const latest = latestByCondition(observations, triggerId, validIds);
  const conditions: ReconsiderationConditionResult[] = trigger.conditions.map(condition => {
    if (condition.kind === 'expiry') {
      return {
        conditionId: condition.conditionId,
        status: (evaluatedAtMs >= Date.parse(condition.notBefore) ? 'SATISFIED' : 'NO_EVIDENCE') as ReconsiderationConditionStatus,
        observationId: null,
        evidenceRefs: [...trigger.evidenceRefs],
      };
    }
    const observation = latest.get(condition.conditionId);
    if (!observation) return { conditionId: condition.conditionId, status: 'NO_EVIDENCE', observationId: null, evidenceRefs: [] };
    if (observation.disposition === 'invalidated') {
      return { conditionId: condition.conditionId, status: 'INVALIDATED', observationId: observation.observationId, evidenceRefs: [...observation.evidenceRefs] };
    }
    return {
      conditionId: condition.conditionId,
      status: matches(condition, observation.value!) ? 'SATISFIED' : 'NOT_SATISFIED',
      observationId: observation.observationId,
      evidenceRefs: [...observation.evidenceRefs],
    };
  });
  let status: DecisionReconsiderationStatus;
  if (trigger.status === 'retired' || conditions.some(item => item.status === 'INVALIDATED')) status = 'INVALIDATED';
  else {
    const satisfied = conditions.filter(item => item.status === 'SATISFIED').length;
    status = satisfied === conditions.length ? 'SATISFIED' : satisfied > 0 ? 'PARTIALLY_SATISFIED' : 'UNRESOLVED';
  }
  const evidenceRefs = uniqueRefs([trigger.evidenceRefs, ...conditions.map(item => item.evidenceRefs)]);
  const payload: Omit<DecisionReconsiderationEvaluation, 'evaluationDigest'> = {
    version: DECISION_RECONSIDERATION_EVALUATION_VERSION,
    decisionRef: record.decisionRef,
    scopeSemanticKey: record.scopeSemanticKey,
    checkpointId: record.checkpointId,
    triggerId,
    status,
    evaluatedAt: normalizedEvaluatedAt,
    targetAlternativeRefs: [...trigger.targetAlternativeRefs],
    conditions,
    evidenceRefs,
    recordDigest: record.recordDigest,
  };
  return Object.freeze({ ...payload, evaluationDigest: fingerprintCanonicalValue(payload) });
}

export function createDecisionReconsiderationReviewRequest(
  record: DecisionReconsiderationRecord,
  evaluation: DecisionReconsiderationEvaluation
): DecisionReconsiderationReviewRequest {
  if (!verifyDecisionReconsiderationRecord(record)) throw new Error('Invalid decision reconsideration record');
  if (evaluation.recordDigest !== record.recordDigest || evaluation.decisionRef !== record.decisionRef
      || evaluation.scopeSemanticKey !== record.scopeSemanticKey || evaluation.checkpointId !== record.checkpointId) {
    throw new Error('Reconsideration evaluation does not belong to this decision record');
  }
  const { evaluationDigest, ...payloadWithoutDigest } = evaluation;
  if (fingerprintCanonicalValue(payloadWithoutDigest) !== evaluationDigest) throw new Error('Invalid reconsideration evaluation integrity');
  if (evaluation.status !== 'SATISFIED') throw new Error('Only a satisfied reconsideration trigger can request review');
  const payload: Omit<DecisionReconsiderationReviewRequest, 'reviewRequestDigest'> = {
    version: DECISION_RECONSIDERATION_REVIEW_VERSION,
    decisionRef: record.decisionRef,
    scopeSemanticKey: record.scopeSemanticKey,
    checkpointId: record.checkpointId,
    triggerId: evaluation.triggerId,
    targetAlternativeRefs: [...evaluation.targetAlternativeRefs],
    evidenceRefs: [...evaluation.evidenceRefs],
    recordDigest: record.recordDigest,
    evaluationDigest: evaluation.evaluationDigest,
    recommendedRoute: 'OPEN_CONTINUITY_REVIEW',
    authorityMode: 'requires_independent_review',
    automaticDecisionChange: false,
  };
  return Object.freeze({ ...payload, reviewRequestDigest: fingerprintCanonicalValue(payload) });
}
