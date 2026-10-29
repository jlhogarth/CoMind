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
  | {
      conditionId: string;
      kind: 'threshold';
      metricRef: string;
      operator: ThresholdOperator;
      threshold: number;
      unitRef: string;
    }
  | {
      conditionId: string;
      kind: 'external_state';
      subjectRef: string;
      expectedStateRef: string;
    }
  | {
      conditionId: string;
      kind: 'policy_change';
      policyRef: string;
      fromVersionRef: string;
      toVersionRef: string;
    }
  | {
      conditionId: string;
      kind: 'dependency_change';
      dependencyScopeSemanticKey: string;
      fromCheckpointId: string;
      toCheckpointId: string;
    }
  | {
      conditionId: string;
      kind: 'expiry';
      notBefore: string;
    }
  | {
      conditionId: string;
      kind: 'evidence_arrival';
      evidenceClassRef: string;
    };

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

export type ReconsiderationConditionStatus =
  | 'SATISFIED'
  | 'NOT_SATISFIED'
  | 'NO_EVIDENCE'
  | 'INVALIDATED';

export interface ReconsiderationConditionResult {
  conditionId: string;
  status: ReconsiderationConditionStatus;
  observationId: string | null;
  evidenceRefs: string[];
}

export type DecisionReconsiderationStatus =
  | 'UNRESOLVED'
  | 'PARTIALLY_SATISFIED'
  | 'SATISFIED'
  | 'INVALIDATED';

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

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizeRefs(values: readonly string[], field: string, requireOne = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS || (requireOne && values.length === 0)) {
    throw new Error(`Invalid ${field}`);
  }
  const normalized = values.map((value, index) => {
    requiredText(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`Duplicate ${field}`);
  return [...normalized].sort();
}

function normalizeAnalysis(analysis: FourSidedDecisionAnalysisRefs): FourSidedDecisionAnalysisRefs {
  if (!analysis || typeof analysis !== 'object') throw new Error('Invalid four-sided decision analysis');
  return {
    supportRefs: normalizeRefs(analysis.supportRefs, 'decision support references'),
    defeatRefs: normalizeRefs(analysis.defeatRefs, 'decision defeat references'),
    choosingCostRefs: normalizeRefs(analysis.choosingCostRefs, 'choosing cost references'),
    rejectingCostRefs: normalizeRefs(analysis.rejectingCostRefs, 'rejecting cost references'),
  };
}

function normalizeAlternative(alternative: RejectedDecisionAlternative): RejectedDecisionAlternative {
  requiredText(alternative.alternativeRef, 'rejected alternative reference');
  return {
    alternativeRef: alternative.alternativeRef,
    rejectionReasonRefs: normalizeRefs(alternative.rejectionReasonRefs, 'rejection reason references', true),
  };
}

function normalizeCondition(condition: ReconsiderationCondition): ReconsiderationCondition {
  requiredText(condition.conditionId, 'reconsideration condition id');
  switch (condition.kind) {
    case 'threshold':
      requiredText(condition.metricRef, 'threshold metric reference');
      requiredText(condition.unitRef, 'threshold unit reference');
      if (!['lt', 'lte', 'eq', 'gte', 'gt'].includes(condition.operator)
          || !Number.isFinite(condition.threshold)) {
        throw new Error('Invalid threshold reconsideration condition');
      }
      return { ...condition };
    case 'external_state':
      requiredText(condition.subjectRef, 'external state subject reference');
      requiredText(condition.expectedStateRef, 'expected external state reference');
      return { ...condition };
    case 'policy_change':
      requiredText(condition.policyRef, 'policy change policy reference');
      requiredText(condition.fromVersionRef, 'policy change source version');
      requiredText(condition.toVersionRef, 'policy change target version');
      if (condition.fromVersionRef === condition.toVersionRef) throw new Error('Policy change requires distinct versions');
      return { ...condition };
    case 'dependency_change':
      requiredText(condition.dependencyScopeSemanticKey, 'dependency change scope key');
      requiredText(condition.fromCheckpointId, 'dependency source checkpoint');
      requiredText(condition.toCheckpointId, 'dependency target checkpoint');
      if (condition.fromCheckpointId === condition.toCheckpointId) throw new Error('Dependency change requires distinct checkpoints');
      return { ...condition };
    case 'expiry':
      return { ...condition, notBefore: normalizeTimestamp(condition.notBefore, 'reconsideration expiry timestamp') };
    case 'evidence_arrival':
      requiredText(condition.evidenceClassRef, 'evidence arrival class reference');
      return { ...condition };
    default:
      throw new Error('Invalid reconsideration condition kind');
  }
}

function normalizeTrigger(
  trigger: DecisionReconsiderationTrigger,
  rejectedAlternativeRefs: ReadonlySet<string>
): DecisionReconsiderationTrigger {
  requiredText(trigger.triggerId, 'reconsideration trigger id');
  if (trigger.matchPolicy !== 'all') throw new Error('Only all-condition reconsideration triggers are supported');
  const targetAlternativeRefs = normalizeRefs(trigger.targetAlternativeRefs, 'trigger alternative references', true);
  for (const alternativeRef of targetAlternativeRefs) {
    if (!rejectedAlternativeRefs.has(alternativeRef)) throw new Error('Reconsideration trigger targets an unknown rejected alternative');
  }
  if (!Array.isArray(trigger.conditions) || trigger.conditions.length === 0 || trigger.conditions.length > MAX_ITEMS) {
    throw new Error('Invalid reconsideration trigger conditions');
  }
  const conditions = trigger.conditions.map(normalizeCondition).sort((a, b) => a.conditionId.localeCompare(b.conditionId));
  if (new Set(conditions.map(condition => condition.conditionId)).size !== conditions.length) {
    throw new Error('Duplicate reconsideration condition id');
  }
  const evidenceRefs = normalizeRefs(trigger.evidenceRefs, 'trigger evidence references', true);
  requiredText(trigger.sourceRef, 'trigger source reference');
  if (trigger.status !== 'current' && trigger.status !== 'retired') throw new Error('Invalid reconsideration trigger status');
  return {
    ...trigger,
    targetAlternativeRefs,
    conditions,
    evidenceRefs,
    createdAt: normalizeTimestamp(trigger.createdAt, 'trigger creation timestamp'),
  };
}

function withoutRecordDigest(
  record: DecisionReconsiderationRecord
): Omit<DecisionReconsiderationRecord, 'recordDigest'> {
  const { recordDigest: _digest, ...payload } = record;
  return payload;
}

export function createDecisionReconsiderationRecord(
  input: CreateDecisionReconsiderationRecordInput
): DecisionReconsiderationRecord {
  requiredText(input.scopeSemanticKey, 'decision continuity scope key');
  requiredText(input.checkpointId, 'decision checkpoint id');
  requiredText(input.decisionRef, 'decision reference');
  requiredText(input.selectedOptionRef, 'selected option reference');
  const rationaleRefs = normalizeRefs(input.rationaleRefs, 'decision rationale references', true);
  const analysis = normalizeAnalysis(input.analysis);
  if (!Array.isArray(input.rejectedAlternatives)
      || input.rejectedAlternatives.length === 0
      || input.rejectedAlternatives.length > MAX_ITEMS) {
    throw new Error('Decision reconsideration requires rejected alternatives');
  }
  const rejectedAlternatives = input.rejectedAlternatives.map(normalizeAlternative)
    .sort((a, b) => a.alternativeRef.localeCompare(b.alternativeRef));
  if (new Set(rejectedAlternatives.map(item => item.alternativeRef)).size !== rejectedAlternatives.length) {
    throw new Error('Duplicate rejected alternative reference');
  }
  if (rejectedAlternatives.some(item => item.alternativeRef === input.selectedOptionRef)) {
    throw new Error('Selected option cannot also be a rejected alternative');
  }
  const rejectedAlternativeRefs = new Set(rejectedAlternatives.map(item => item.alternativeRef));
  if (!Array.isArray(input.triggers) || input.triggers.length === 0 || input.triggers.length > MAX_ITEMS) {
    throw new Error('Decision reconsideration requires at least one trigger');
  }
  const triggers = input.triggers.map(trigger => normalizeTrigger(trigger, rejectedAlternativeRefs))
    .sort((a, b) => a.triggerId.localeCompare(b.triggerId));
  if (new Set(triggers.map(trigger => trigger.triggerId)).size !== triggers.length) {
    throw new Error('Duplicate reconsideration trigger id');
  }
  const authorityEvidenceRefs = normalizeRefs(input.authorityEvidenceRefs, 'decision authority evidence references', true);
  const policyRefs = normalizeRefs(input.policyRefs, 'decision policy references', true);
  const payload: Omit<DecisionReconsiderationRecord, 'recordDigest'> = {
    version: DECISION_RECONSIDERATION_RECORD_VERSION,
    scopeSemanticKey: input.scopeSemanticKey,
    checkpointId: input.checkpointId,
    decisionRef: input.decisionRef,
    selectedOptionRef: input.selectedOptionRef,
    rationaleRefs,
    analysis,
    rejectedAlternatives,
    triggers,
    authorityEvidenceRefs,
    policyRefs,
  };
  return Object.freeze({ ...payload, recordDigest: fingerprintCanonicalValue(payload) });
}

export function verifyDecisionReconsiderationRecord(record: DecisionReconsiderationRecord): boolean {
  try {
    if (!record || record.version !== DECISION_RECONSIDERATION_RECORD_VERSION) return false;
    const rebuilt = createDecisionReconsiderationRecord(record);
    return rebuilt.recordDigest === record.recordDigest
      && fingerprintCanonicalValue(withoutRecordDigest(record)) === record.recordDigest;
  } catch {
    return false;
  }
}

function normalizeObservation(observation: ReconsiderationObservation): ReconsiderationObservation {
  requiredText(observation.observationId, 'reconsideration observation id');
  requiredText(observation.triggerId, 'reconsideration observation trigger id');
  requiredText(observation.conditionId, 'reconsideration observation condition id');
  if (observation.assertionMode !== 'explicit_evidence') {
    throw new Error('Reconsideration observations require explicit evidence');
  }
  if (observation.disposition !== 'observed' && observation.disposition !== 'invalidated') {
    throw new Error('Invalid reconsideration observation disposition');
  }
  if (observation.disposition === 'observed' && !observation.value) {
    throw new Error('Observed reconsideration evidence requires a value');
  }
  if (observation.disposition === 'invalidated' && observation.value !== null) {
    throw new Error('Invalidated reconsideration evidence must not carry a value');
  }
  requiredText(observation.sourceRef, 'reconsideration observation source reference');
  return {
    ...observation,
    evidenceRefs: normalizeRefs(observation.evidenceRefs, 'reconsideration observation evidence references', true),
    observedAt: normalizeTimestamp(observation.observedAt, 'reconsideration observation timestamp'),
  };
}

function observedValueMatchesCondition(
  condition: ReconsiderationCondition,
  value: ReconsiderationObservedValue
): boolean {
  if (condition.kind !== value.kind) throw new Error('Observation kind does not match reconsideration condition');
  switch (condition.kind) {
    case 'threshold': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'threshold' }>;
      if (condition.metricRef !== observed.metricRef || condition.unitRef !== observed.unitRef || !Number.isFinite(observed.value)) {
        return false;
      }
      switch (condition.operator) {
        case 'lt': return observed.value < condition.threshold;
        case 'lte': return observed.value <= condition.threshold;
        case 'eq': return observed.value === condition.threshold;
        case 'gte': return observed.value >= condition.threshold;
        case 'gt': return observed.value > condition.threshold;
      }
    }
    case 'external_state': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'external_state' }>;
      return observed.subjectRef === condition.subjectRef && observed.stateRef === condition.expectedStateRef;
    }
    case 'policy_change': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'policy_change' }>;
      return observed.policyRef === condition.policyRef
        && observed.fromVersionRef === condition.fromVersionRef
        && observed.toVersionRef === condition.toVersionRef;
    }
    case 'dependency_change': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'dependency_change' }>;
      return observed.dependencyScopeSemanticKey === condition.dependencyScopeSemanticKey
        && observed.fromCheckpointId === condition.fromCheckpointId
        && observed.toCheckpointId === condition.toCheckpointId;
    }
    case 'evidence_arrival': {
      const observed = value as Extract<ReconsiderationObservedValue, { kind: 'evidence_arrival' }>;
      return observed.evidenceClassRef === condition.evidenceClassRef;
    }
    case 'expiry':
      throw new Error('Expiry reconsideration conditions are evaluated against evaluatedAt, not observations');
  }
}

function latestObservationByCondition(
  observations: readonly ReconsiderationObservation[],
  triggerId: string,
  validConditionIds: ReadonlySet<string>
): Map<string, ReconsiderationObservation> {
  const latest = new Map<string, ReconsiderationObservation>();
  const seenObservationIds = new Set<string>();
  for (const raw of observations) {
    const observation = normalizeObservation(raw);
    if (seenObservationIds.has(observation.observationId)) throw new Error('Duplicate reconsideration observation id');
    seenObservationIds.add(observation.observationId);
    if (observation.triggerId !== triggerId) continue;
    if (!validConditionIds.has(observation.conditionId)) {
      throw new Error('Observation references an unknown reconsideration condition');
    }
    const prior = latest.get(observation.conditionId);
    if (!prior
        || Date.parse(observation.observedAt) > Date.parse(prior.observedAt)
        || (observation.observedAt === prior.observedAt && observation.observationId.localeCompare(prior.observationId) > 0)) {
      latest.set(observation.conditionId, observation);
    }
  }
  return latest;
}

function uniqueSorted(...values: readonly string[][]): string[] {
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
  const trigger = record.triggers.find(candidate => candidate.triggerId === triggerId);
  if (!trigger) throw new Error('Unknown reconsideration trigger');
  const normalizedEvaluatedAt = normalizeTimestamp(evaluatedAt, 'reconsideration evaluation timestamp');
  const evaluatedAtMs = Date.parse(normalizedEvaluatedAt);
  if (evaluatedAtMs < Date.parse(trigger.createdAt)) throw new Error('Reconsideration trigger cannot be evaluated before creation');
  if (!Array.isArray(observations) || observations.length > MAX_ITEMS) throw new Error('Invalid reconsideration observations');

  const conditionIds = new Set(trigger.conditions.map(condition => condition.conditionId));
  const latest = latestObservationByCondition(observations, triggerId, conditionIds);
  const results: ReconsiderationConditionResult[] = [];

  for (const condition of trigger.conditions) {
    if (condition.kind === 'expiry') {
      const satisfied = evaluatedAtMs >= Date.parse(condition.notBefore);
      results.push({
        conditionId: condition.conditionId,
        status: satisfied ? 'SATISFIED' : 'NO_EVIDENCE',
        observationId: null,
        evidenceRefs: [...trigger.evidenceRefs],
      });
      continue;
    }
    const observation = latest.get(condition.conditionId);
    if (!observation) {
      results.push({ conditionId: condition.conditionId, status: 'NO_EVIDENCE', observationId: null, evidenceRefs: [] });
      continue;
    }
    if (observation.disposition === 'invalidated') {
      results.push({
        conditionId: condition.conditionId,
        status: 'INVALIDATED',
        observationId: observation.observationId,
        evidenceRefs: [...observation.evidenceRefs],
      });
      continue;
    }
    const satisfied = observedValueMatchesCondition(condition, observation.value!);
    results.push({
      conditionId: condition.conditionId,
      status: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
      observationId: observation.observationId,
      evidenceRefs: [...observation.evidenceRefs],
    });
  }

  let status: DecisionReconsiderationStatus;
  if (trigger.status === 'retired' || results.some(result => result.status === 'INVALIDATED')) {
    status = 'INVALIDATED';
  } else {
    const satisfiedCount = results.filter(result => result.status === 'SATISFIED').length;
    if (satisfiedCount === results.length) status = 'SATISFIED';
    else if (satisfiedCount > 0) status = 'PARTIALLY_SATISFIED';
    else status = 'UNRESOLVED';
  }

  const evidenceRefs = uniqueSorted(
    trigger.evidenceRefs,
    ...results.map(result => result.evidenceRefs)
  );
  const payload: Omit<DecisionReconsiderationEvaluation, 'evaluationDigest'> = {
    version: DECISION_RECONSIDERATION_EVALUATION_VERSION,
    decisionRef: record.decisionRef,
    scopeSemanticKey: record.scopeSemanticKey,
    checkpointId: record.checkpointId,
    triggerId,
    status,
    evaluatedAt: normalizedEvaluatedAt,
    targetAlternativeRefs: [...trigger.targetAlternativeRefs],
    conditions: results,
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
  if (evaluation.recordDigest !== record.recordDigest
      || evaluation.decisionRef !== record.decisionRef
      || evaluation.scopeSemanticKey !== record.scopeSemanticKey
      || evaluation.checkpointId !== record.checkpointId) {
    throw new Error('Reconsideration evaluation does not belong to this decision record');
  }
  const { evaluationDigest: suppliedDigest, ...evaluationPayload } = evaluation;
  if (fingerprintCanonicalValue(evaluationPayload) !== suppliedDigest) {
    throw new Error('Invalid reconsideration evaluation integrity');
  }
  if (evaluation.status !== 'SATISFIED') {
    throw new Error('Only a satisfied reconsideration trigger can request review');
  }
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
