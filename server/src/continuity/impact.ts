import { fingerprintCanonicalValue } from './checkpoint.js';
import {
  ContinuityCapsule,
  ContinuitySensitivity,
  verifyContinuityCapsule,
} from './capsule.js';

export const CONTINUITY_IMPACT_PROJECTION_VERSION = 'continuity-impact-projection-v1' as const;
export const CONTINUITY_DRIFT_REPORT_VERSION = 'continuity-drift-report-v1' as const;
export const CONTINUITY_DEBT_REPORT_VERSION = 'continuity-debt-report-v1' as const;

const MAX_EDGES = 4096;
const MAX_REF_COUNT = 512;
const MAX_REF_LENGTH = 1024;
const MAX_IMPACT_DEPTH = 32;

export type ContinuityDependencyKind =
  | 'depends_on'
  | 'constrained_by'
  | 'governed_by'
  | 'derived_from'
  | 'handoff_from';

export interface ContinuityDependencyEdge {
  edgeId: string;
  dependencyScopeSemanticKey: string;
  dependentScopeSemanticKey: string;
  relationshipKind: ContinuityDependencyKind;
  assertionMode: 'explicit_evidence';
  evidenceRefs: string[];
  sourceRef: string;
  observedAt: string;
  status: 'current' | 'retired';
}

export interface ContinuityImpactProjection {
  version: typeof CONTINUITY_IMPACT_PROJECTION_VERSION;
  edges: ContinuityDependencyEdge[];
  projectionDigest: string;
}

export interface ContinuityImpactPath {
  scopeSemanticKey: string;
  depth: number;
  pathScopeSemanticKeys: string[];
  viaEdgeIds: string[];
}

export interface ContinuityImpactReport {
  changedScopeSemanticKey: string;
  impacted: ContinuityImpactPath[];
  cycleEdgeIds: string[];
  truncated: boolean;
  projectionDigest: string;
}

export type ContinuityDriftIndicator =
  | 'baseline_objective_lost'
  | 'baseline_decision_lost'
  | 'baseline_obligation_lost'
  | 'baseline_prohibition_lost'
  | 'baseline_evidence_lost'
  | 'baseline_authority_evidence_lost'
  | 'baseline_policy_reference_lost'
  | 'repeated_semantic_change'
  | 'obligation_churn'
  | 'prohibition_churn'
  | 'authority_reference_churn'
  | 'sensitivity_weakened'
  | 'retention_changed'
  | 'unresolved_cases_accumulating';

export type ContinuityDriftClassification =
  | 'stable'
  | 'changed_with_lineage'
  | 'cumulative_drift_risk'
  | 'continuity_break_risk';

export interface ContinuityDriftReport {
  version: typeof CONTINUITY_DRIFT_REPORT_VERSION;
  scopeSemanticKey: string;
  baselineCheckpointId: string;
  currentCheckpointId: string;
  transitionCount: number;
  changedTransitionCount: number;
  classification: ContinuityDriftClassification;
  indicators: ContinuityDriftIndicator[];
  lostReferences: {
    objectiveRefs: string[];
    decisionRefs: string[];
    obligationRefs: string[];
    prohibitedActionRefs: string[];
    evidenceRefs: string[];
    authorityEvidenceRefs: string[];
    policyRefs: string[];
  };
  reportDigest: string;
}

export type ContinuityDebtCategory =
  | 'stale_checkpoint'
  | 'unresolved_conflict'
  | 'incomplete_handoff'
  | 'missing_provenance'
  | 'expiring_authority'
  | 'outdated_assumption'
  | 'reassessment_required'
  | 'fidelity_failure';

export interface ContinuityDebtSignals {
  staleCheckpointRefs?: string[];
  unresolvedConflictRefs?: string[];
  incompleteHandoffRefs?: string[];
  missingProvenanceRefs?: string[];
  expiringAuthorityRefs?: string[];
  outdatedAssumptionRefs?: string[];
  reassessmentScopeRefs?: string[];
  fidelityFailureRefs?: string[];
}

export interface ContinuityDebtItem {
  category: ContinuityDebtCategory;
  reference: string;
  blocking: boolean;
}

export interface ContinuityDebtReport {
  version: typeof CONTINUITY_DEBT_REPORT_VERSION;
  status: 'CLEAR' | 'ATTENTION' | 'BLOCKED';
  totalItems: number;
  blockingItems: number;
  counts: Record<ContinuityDebtCategory, number>;
  items: ContinuityDebtItem[];
  reportDigest: string;
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

function normalizeRefs(values: readonly string[] | undefined, field: string): string[] {
  const source = values ?? [];
  if (!Array.isArray(source) || source.length > MAX_REF_COUNT) throw new Error(`Invalid ${field}`);
  const normalized = source.map((value, index) => {
    requiredText(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`Duplicate ${field}`);
  return [...normalized].sort();
}

function isDependencyKind(value: unknown): value is ContinuityDependencyKind {
  return value === 'depends_on'
    || value === 'constrained_by'
    || value === 'governed_by'
    || value === 'derived_from'
    || value === 'handoff_from';
}

function normalizeEdge(edge: ContinuityDependencyEdge): ContinuityDependencyEdge {
  requiredText(edge.edgeId, 'continuity dependency edge id');
  requiredText(edge.dependencyScopeSemanticKey, 'dependency scope semantic key');
  requiredText(edge.dependentScopeSemanticKey, 'dependent scope semantic key');
  if (edge.dependencyScopeSemanticKey === edge.dependentScopeSemanticKey) {
    throw new Error('Continuity dependency self-edge is not allowed');
  }
  if (!isDependencyKind(edge.relationshipKind)) throw new Error('Invalid continuity dependency relationship kind');
  if (edge.assertionMode !== 'explicit_evidence') {
    throw new Error('Continuity dependency edges require explicit evidence');
  }
  requiredText(edge.sourceRef, 'continuity dependency source reference');
  const evidenceRefs = normalizeRefs(edge.evidenceRefs, 'continuity dependency evidence references');
  if (evidenceRefs.length === 0) throw new Error('Continuity dependency edge requires evidence');
  if (edge.status !== 'current' && edge.status !== 'retired') throw new Error('Invalid continuity dependency status');
  return {
    ...edge,
    evidenceRefs,
    observedAt: normalizeTimestamp(edge.observedAt, 'continuity dependency observed timestamp'),
  };
}

function withoutProjectionDigest(
  projection: ContinuityImpactProjection
): Omit<ContinuityImpactProjection, 'projectionDigest'> {
  const { projectionDigest: _digest, ...payload } = projection;
  return payload;
}

export function createContinuityImpactProjection(
  edges: readonly ContinuityDependencyEdge[]
): ContinuityImpactProjection {
  if (!Array.isArray(edges) || edges.length > MAX_EDGES) throw new Error('Invalid continuity dependency edge collection');
  const normalized = edges.map(normalizeEdge).sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  if (new Set(normalized.map(edge => edge.edgeId)).size !== normalized.length) {
    throw new Error('Duplicate continuity dependency edge id');
  }
  const payload: Omit<ContinuityImpactProjection, 'projectionDigest'> = {
    version: CONTINUITY_IMPACT_PROJECTION_VERSION,
    edges: normalized,
  };
  return Object.freeze({
    ...payload,
    projectionDigest: fingerprintCanonicalValue(payload),
  });
}

export function verifyContinuityImpactProjection(projection: ContinuityImpactProjection): boolean {
  try {
    if (!projection || projection.version !== CONTINUITY_IMPACT_PROJECTION_VERSION) return false;
    const rebuilt = createContinuityImpactProjection(projection.edges);
    return rebuilt.projectionDigest === projection.projectionDigest
      && fingerprintCanonicalValue(withoutProjectionDigest(projection)) === projection.projectionDigest;
  } catch {
    return false;
  }
}

export function analyzeContinuityImpact(
  projection: ContinuityImpactProjection,
  changedScopeSemanticKey: string,
  maxDepth = MAX_IMPACT_DEPTH
): ContinuityImpactReport {
  if (!verifyContinuityImpactProjection(projection)) throw new Error('Invalid continuity impact projection');
  requiredText(changedScopeSemanticKey, 'changed continuity scope semantic key');
  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0 || maxDepth > MAX_IMPACT_DEPTH) {
    throw new Error('Invalid continuity impact maximum depth');
  }

  const outgoing = new Map<string, ContinuityDependencyEdge[]>();
  for (const edge of projection.edges) {
    if (edge.status !== 'current') continue;
    const list = outgoing.get(edge.dependencyScopeSemanticKey) ?? [];
    list.push(edge);
    outgoing.set(edge.dependencyScopeSemanticKey, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  const visitedDepth = new Map<string, number>([[changedScopeSemanticKey, 0]]);
  const queue: Array<{ scope: string; depth: number; scopes: string[]; edges: string[] }> = [
    { scope: changedScopeSemanticKey, depth: 0, scopes: [changedScopeSemanticKey], edges: [] },
  ];
  const impacted: ContinuityImpactPath[] = [];
  const cycleEdgeIds = new Set<string>();
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextEdges = outgoing.get(current.scope) ?? [];
    for (const edge of nextEdges) {
      const nextDepth = current.depth + 1;
      if (current.scopes.includes(edge.dependentScopeSemanticKey)) {
        cycleEdgeIds.add(edge.edgeId);
        continue;
      }
      if (nextDepth > maxDepth) {
        truncated = true;
        continue;
      }
      const knownDepth = visitedDepth.get(edge.dependentScopeSemanticKey);
      if (knownDepth !== undefined && knownDepth <= nextDepth) continue;
      visitedDepth.set(edge.dependentScopeSemanticKey, nextDepth);
      const scopes = [...current.scopes, edge.dependentScopeSemanticKey];
      const edgeIds = [...current.edges, edge.edgeId];
      impacted.push({
        scopeSemanticKey: edge.dependentScopeSemanticKey,
        depth: nextDepth,
        pathScopeSemanticKeys: scopes,
        viaEdgeIds: edgeIds,
      });
      queue.push({ scope: edge.dependentScopeSemanticKey, depth: nextDepth, scopes, edges: edgeIds });
    }
  }

  impacted.sort((left, right) => left.depth - right.depth
    || left.scopeSemanticKey.localeCompare(right.scopeSemanticKey));

  return {
    changedScopeSemanticKey,
    impacted,
    cycleEdgeIds: [...cycleEdgeIds].sort(),
    truncated,
    projectionDigest: projection.projectionDigest,
  };
}

function sensitivityRank(value: ContinuitySensitivity): number {
  switch (value) {
    case 'public': return 0;
    case 'internal': return 1;
    case 'confidential': return 2;
    case 'restricted': return 3;
  }
}

function lostRefs(baseline: readonly string[], current: readonly string[]): string[] {
  const currentSet = new Set(current);
  return baseline.filter(value => !currentSet.has(value)).sort();
}

function setChanged(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return true;
  const rightSet = new Set(right);
  return left.some(value => !rightSet.has(value));
}

function capsuleSemanticChange(left: ContinuityCapsule, right: ContinuityCapsule): boolean {
  return setChanged(left.references.objectiveRefs, right.references.objectiveRefs)
    || setChanged(left.references.decisionRefs, right.references.decisionRefs)
    || setChanged(left.references.assumptionRefs, right.references.assumptionRefs)
    || setChanged(left.references.obligationRefs, right.references.obligationRefs)
    || setChanged(left.references.prohibitedActionRefs, right.references.prohibitedActionRefs)
    || setChanged(left.references.openQuestionRefs, right.references.openQuestionRefs)
    || setChanged(left.references.evidenceRefs, right.references.evidenceRefs)
    || setChanged(left.authority.authorityEvidenceRefs, right.authority.authorityEvidenceRefs)
    || setChanged(left.authority.policyRefs, right.authority.policyRefs)
    || left.sensitivity !== right.sensitivity
    || left.retentionClass !== right.retentionClass;
}

function assertLineageProgression(capsules: readonly ContinuityCapsule[]): void {
  const scope = capsules[0]?.scopeSemanticKey;
  const checkpointIds = new Set<string>();
  for (let index = 0; index < capsules.length; index += 1) {
    const capsule = capsules[index];
    if (!verifyContinuityCapsule(capsule)) throw new Error(`Invalid continuity capsule at index ${index}`);
    if (capsule.scopeSemanticKey !== scope) throw new Error('Continuity drift history contains multiple scopes');
    if (checkpointIds.has(capsule.currentCheckpoint.checkpointId)) {
      throw new Error('Continuity drift history contains duplicate checkpoints');
    }
    checkpointIds.add(capsule.currentCheckpoint.checkpointId);
    if (index === 0) continue;
    const prior = capsules[index - 1];
    if (capsule.currentCheckpoint.parentCheckpointId !== prior.currentCheckpoint.checkpointId) {
      throw new Error('Continuity drift history is not a direct accepted checkpoint lineage');
    }
    if (Date.parse(capsule.currentCheckpoint.acceptedAt) <= Date.parse(prior.currentCheckpoint.acceptedAt)) {
      throw new Error('Continuity drift history is not chronologically increasing');
    }
  }
}

export function analyzeCumulativeContinuityDrift(
  capsules: readonly ContinuityCapsule[]
): ContinuityDriftReport {
  if (!Array.isArray(capsules) || capsules.length < 2 || capsules.length > MAX_REF_COUNT) {
    throw new Error('Continuity drift analysis requires 2-512 accepted checkpoint capsules');
  }
  assertLineageProgression(capsules);
  const baseline = capsules[0];
  const current = capsules[capsules.length - 1];

  const lostReferences = {
    objectiveRefs: lostRefs(baseline.references.objectiveRefs, current.references.objectiveRefs),
    decisionRefs: lostRefs(baseline.references.decisionRefs, current.references.decisionRefs),
    obligationRefs: lostRefs(baseline.references.obligationRefs, current.references.obligationRefs),
    prohibitedActionRefs: lostRefs(baseline.references.prohibitedActionRefs, current.references.prohibitedActionRefs),
    evidenceRefs: lostRefs(baseline.references.evidenceRefs, current.references.evidenceRefs),
    authorityEvidenceRefs: lostRefs(baseline.authority.authorityEvidenceRefs, current.authority.authorityEvidenceRefs),
    policyRefs: lostRefs(baseline.authority.policyRefs, current.authority.policyRefs),
  };

  let changedTransitionCount = 0;
  let obligationChanges = 0;
  let prohibitionChanges = 0;
  let authorityChanges = 0;
  let sensitivityWeakened = false;
  let retentionChanged = false;
  for (let index = 1; index < capsules.length; index += 1) {
    const prior = capsules[index - 1];
    const next = capsules[index];
    if (capsuleSemanticChange(prior, next)) changedTransitionCount += 1;
    if (setChanged(prior.references.obligationRefs, next.references.obligationRefs)) obligationChanges += 1;
    if (setChanged(prior.references.prohibitedActionRefs, next.references.prohibitedActionRefs)) prohibitionChanges += 1;
    if (setChanged(prior.authority.authorityEvidenceRefs, next.authority.authorityEvidenceRefs)
        || setChanged(prior.authority.policyRefs, next.authority.policyRefs)) authorityChanges += 1;
    if (sensitivityRank(next.sensitivity) < sensitivityRank(prior.sensitivity)) sensitivityWeakened = true;
    if (next.retentionClass !== prior.retentionClass) retentionChanged = true;
  }

  const indicators = new Set<ContinuityDriftIndicator>();
  if (lostReferences.objectiveRefs.length) indicators.add('baseline_objective_lost');
  if (lostReferences.decisionRefs.length) indicators.add('baseline_decision_lost');
  if (lostReferences.obligationRefs.length) indicators.add('baseline_obligation_lost');
  if (lostReferences.prohibitedActionRefs.length) indicators.add('baseline_prohibition_lost');
  if (lostReferences.evidenceRefs.length) indicators.add('baseline_evidence_lost');
  if (lostReferences.authorityEvidenceRefs.length) indicators.add('baseline_authority_evidence_lost');
  if (lostReferences.policyRefs.length) indicators.add('baseline_policy_reference_lost');
  if (changedTransitionCount >= 2) indicators.add('repeated_semantic_change');
  if (obligationChanges >= 2) indicators.add('obligation_churn');
  if (prohibitionChanges >= 2) indicators.add('prohibition_churn');
  if (authorityChanges >= 2) indicators.add('authority_reference_churn');
  if (sensitivityWeakened) indicators.add('sensitivity_weakened');
  if (retentionChanged) indicators.add('retention_changed');
  if (current.unresolvedCaseRefs.length > baseline.unresolvedCaseRefs.length) {
    indicators.add('unresolved_cases_accumulating');
  }

  const breakIndicators: ContinuityDriftIndicator[] = [
    'baseline_objective_lost',
    'baseline_decision_lost',
    'baseline_obligation_lost',
    'baseline_prohibition_lost',
    'baseline_evidence_lost',
    'baseline_authority_evidence_lost',
    'baseline_policy_reference_lost',
    'sensitivity_weakened',
  ];
  let classification: ContinuityDriftClassification;
  if ([...indicators].some(indicator => breakIndicators.includes(indicator))) {
    classification = 'continuity_break_risk';
  } else if (indicators.has('repeated_semantic_change')
      || indicators.has('obligation_churn')
      || indicators.has('prohibition_churn')
      || indicators.has('authority_reference_churn')
      || indicators.has('unresolved_cases_accumulating')) {
    classification = 'cumulative_drift_risk';
  } else if (changedTransitionCount > 0) {
    classification = 'changed_with_lineage';
  } else {
    classification = 'stable';
  }

  const payload: Omit<ContinuityDriftReport, 'reportDigest'> = {
    version: CONTINUITY_DRIFT_REPORT_VERSION,
    scopeSemanticKey: baseline.scopeSemanticKey,
    baselineCheckpointId: baseline.currentCheckpoint.checkpointId,
    currentCheckpointId: current.currentCheckpoint.checkpointId,
    transitionCount: capsules.length - 1,
    changedTransitionCount,
    classification,
    indicators: [...indicators].sort(),
    lostReferences,
  };
  return Object.freeze({ ...payload, reportDigest: fingerprintCanonicalValue(payload) });
}

const DEBT_CATEGORIES: ContinuityDebtCategory[] = [
  'stale_checkpoint',
  'unresolved_conflict',
  'incomplete_handoff',
  'missing_provenance',
  'expiring_authority',
  'outdated_assumption',
  'reassessment_required',
  'fidelity_failure',
];

function debtCategoryRefs(signals: ContinuityDebtSignals): Record<ContinuityDebtCategory, string[]> {
  return {
    stale_checkpoint: normalizeRefs(signals.staleCheckpointRefs, 'stale checkpoint refs'),
    unresolved_conflict: normalizeRefs(signals.unresolvedConflictRefs, 'unresolved conflict refs'),
    incomplete_handoff: normalizeRefs(signals.incompleteHandoffRefs, 'incomplete handoff refs'),
    missing_provenance: normalizeRefs(signals.missingProvenanceRefs, 'missing provenance refs'),
    expiring_authority: normalizeRefs(signals.expiringAuthorityRefs, 'expiring authority refs'),
    outdated_assumption: normalizeRefs(signals.outdatedAssumptionRefs, 'outdated assumption refs'),
    reassessment_required: normalizeRefs(signals.reassessmentScopeRefs, 'reassessment scope refs'),
    fidelity_failure: normalizeRefs(signals.fidelityFailureRefs, 'fidelity failure refs'),
  };
}

function isBlockingDebt(category: ContinuityDebtCategory): boolean {
  return category === 'stale_checkpoint'
    || category === 'unresolved_conflict'
    || category === 'missing_provenance'
    || category === 'fidelity_failure';
}

export function classifyContinuityDebt(signals: ContinuityDebtSignals): ContinuityDebtReport {
  const refs = debtCategoryRefs(signals);
  const items: ContinuityDebtItem[] = [];
  const counts = {} as Record<ContinuityDebtCategory, number>;
  for (const category of DEBT_CATEGORIES) {
    counts[category] = refs[category].length;
    for (const reference of refs[category]) {
      items.push({ category, reference, blocking: isBlockingDebt(category) });
    }
  }
  items.sort((left, right) => left.category.localeCompare(right.category)
    || left.reference.localeCompare(right.reference));
  const blockingItems = items.filter(item => item.blocking).length;
  const status = blockingItems > 0 ? 'BLOCKED' : items.length > 0 ? 'ATTENTION' : 'CLEAR';
  const payload: Omit<ContinuityDebtReport, 'reportDigest'> = {
    version: CONTINUITY_DEBT_REPORT_VERSION,
    status,
    totalItems: items.length,
    blockingItems,
    counts,
    items,
  };
  return Object.freeze({ ...payload, reportDigest: fingerprintCanonicalValue(payload) });
}
