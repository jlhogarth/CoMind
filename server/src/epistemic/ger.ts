export const GER_POLICY_VERSION = 'ger-001-v1' as const;

export type EpistemicObjectType =
  | 'observation'
  | 'claim'
  | 'fact'
  | 'evidence'
  | 'source'
  | 'testimony'
  | 'inference'
  | 'assumption'
  | 'hypothesis'
  | 'competing_hypothesis'
  | 'connection_candidate'
  | 'contradiction'
  | 'uncertainty'
  | 'confidence_assessment'
  | 'test'
  | 'test_result'
  | 'falsifier'
  | 'unresolved_question'
  | 'conclusion'
  | 'decision'
  | 'action'
  | 'review'
  | 'challenge'
  | 'exception'
  | 'edge_case'
  | 'reopening_trigger';

export type EpistemicState =
  | 'unknown'
  | 'observed'
  | 'suspected'
  | 'investigated'
  | 'corroborated'
  | 'challenged'
  | 'tested'
  | 'supported'
  | 'rejected'
  | 'inconclusive'
  | 'concluded'
  | 'acted_upon'
  | 'monitored'
  | 'reopened';

export type RigorClass = 0 | 1 | 2 | 3 | 4;
export type RigorDimension = 0 | 1 | 2 | 3 | 4 | null;

export type HardRigorTrigger =
  | 'production_change'
  | 'security_control_change'
  | 'regulated_or_highly_sensitive_data'
  | 'irreversible_external_action'
  | 'broad_delegated_authority'
  | 'material_financial_commitment'
  | 'identity_or_rights_impact';

export interface RigorInput {
  consequence: RigorDimension;
  uncertainty: RigorDimension;
  irreversibility: RigorDimension;
  authoritySensitivity: RigorDimension;
  scope: RigorDimension;
  externalImpact: RigorDimension;
  hardTriggers?: HardRigorTrigger[];
}

export interface RigorRequirements {
  class: RigorClass;
  evidence: string[];
  testing: string[];
  review: string[];
  authority: string[];
  audit: string[];
  reopening: string[];
}

export interface RigorAssessment {
  policyVersion: typeof GER_POLICY_VERSION;
  rigorClass: RigorClass;
  weightedScore: number | null;
  unknownDimensions: Array<keyof Omit<RigorInput, 'hardTriggers'>>;
  hardFloor: RigorClass;
  reasons: string[];
  requirements: RigorRequirements;
}

const DIMENSION_WEIGHTS = {
  consequence: 0.3,
  uncertainty: 0.2,
  irreversibility: 0.2,
  authoritySensitivity: 0.1,
  scope: 0.1,
  externalImpact: 0.1,
} as const;

const RIGOR_REQUIREMENTS: Record<RigorClass, RigorRequirements> = {
  0: {
    class: 0,
    evidence: ['Retain source attribution when a factual assertion is material.'],
    testing: ['No formal test required unless a policy or caller requires one.'],
    review: ['Self-check is sufficient for low-consequence, reversible work.'],
    authority: ['Action still requires whatever capability authority normally applies.'],
    audit: ['Preserve the material claim and source reference when persisted.'],
    reopening: ['Reopen when a direct contradiction or source invalidation appears.'],
  },
  1: {
    class: 1,
    evidence: ['Identify supporting evidence and material assumptions.'],
    testing: ['Perform a cheap verification when one is readily available.'],
    review: ['Expose unresolved uncertainty to the caller.'],
    authority: ['Do not infer authority from confidence or evidence strength.'],
    audit: ['Record provenance for material conclusions.'],
    reopening: ['Define at least one condition that would materially weaken the conclusion.'],
  },
  2: {
    class: 2,
    evidence: [
      'Preserve supporting and contradicting evidence separately.',
      'Identify material missing evidence and competing explanations.',
    ],
    testing: ['Perform a discriminating test when feasible or record why no useful test is available.'],
    review: ['Perform an explicit challenge for confirmation bias and premature closure.'],
    authority: ['Require explicit authority for consequential mutation or external action.'],
    audit: ['Record assumptions, uncertainty basis, tests, and decision lineage.'],
    reopening: ['Record falsifiers, failed-prediction triggers, or assumption-change triggers.'],
  },
  3: {
    class: 3,
    evidence: [
      'Require strong provenance and explicit evidence quality assessment.',
      'Preserve viable competing hypotheses and unresolved contradictions.',
    ],
    testing: [
      'Require at least one meaningful discriminating test where testability exists.',
      'Record negative, failed, and inconclusive test results rather than dropping them.',
    ],
    review: ['Require independent or role-separated review before consequential closure.'],
    authority: ['Require explicit human or separately governed approval for high-consequence action.'],
    audit: ['Make the conclusion reconstructable from evidence, alternatives, uncertainty, review, and authority.'],
    reopening: ['Require explicit monitored reopening conditions and a responsible owner.'],
  },
  4: {
    class: 4,
    evidence: [
      'Require high-quality, independently attributable evidence appropriate to the domain.',
      'Require explicit treatment of contradictions, source limitations, and missing evidence.',
    ],
    testing: [
      'Require adversarial or independent validation when technically and ethically feasible.',
      'Require rollback or containment proof for reversible execution paths where applicable.',
    ],
    review: [
      'Require independent review with no self-approval of exceptions.',
      'Require documented challenge paths for unresolved dissent.',
    ],
    authority: [
      'Require explicit human authority for critical actions.',
      'High confidence never grants or expands authority.',
    ],
    audit: ['Require complete evidence, test, decision, authorization, action, and monitoring lineage.'],
    reopening: ['Require monitored triggers, periodic review where appropriate, and fail-safe reopening on material contradiction.'],
  },
};

const HARD_TRIGGER_FLOORS: Record<HardRigorTrigger, RigorClass> = {
  production_change: 4,
  security_control_change: 4,
  regulated_or_highly_sensitive_data: 4,
  irreversible_external_action: 4,
  broad_delegated_authority: 4,
  material_financial_commitment: 3,
  identity_or_rights_impact: 4,
};

function weightedClass(score: number): RigorClass {
  if (score < 0.75) return 0;
  if (score < 1.5) return 1;
  if (score < 2.5) return 2;
  if (score < 3.5) return 3;
  return 4;
}

function maxRigor(a: RigorClass, b: RigorClass): RigorClass {
  return Math.max(a, b) as RigorClass;
}

export function assessRigor(input: RigorInput): RigorAssessment {
  const dimensions = {
    consequence: input.consequence,
    uncertainty: input.uncertainty,
    irreversibility: input.irreversibility,
    authoritySensitivity: input.authoritySensitivity,
    scope: input.scope,
    externalImpact: input.externalImpact,
  };

  const unknownDimensions = (Object.keys(dimensions) as Array<keyof typeof dimensions>)
    .filter((key) => dimensions[key] === null);

  let hardFloor: RigorClass = unknownDimensions.length > 0 ? 3 : 0;
  const reasons: string[] = [];

  if (unknownDimensions.length > 0) {
    reasons.push(`Unknown rigor dimensions require fail-safe class 3 floor: ${unknownDimensions.join(', ')}`);
  }

  for (const trigger of input.hardTriggers ?? []) {
    hardFloor = maxRigor(hardFloor, HARD_TRIGGER_FLOORS[trigger]);
    reasons.push(`Hard trigger ${trigger} requires class ${HARD_TRIGGER_FLOORS[trigger]} floor.`);
  }

  const knownValues = Object.values(dimensions).filter((value): value is Exclude<RigorDimension, null> => value !== null);
  const highDimensions = knownValues.filter((value) => value >= 3).length;
  if (highDimensions >= 2) {
    hardFloor = maxRigor(hardFloor, 3);
    reasons.push('Two or more high dimensions require at least class 3 rigor.');
  }

  if (dimensions.consequence === 4 || dimensions.irreversibility === 4 || dimensions.externalImpact === 4) {
    hardFloor = maxRigor(hardFloor, 4);
    reasons.push('Critical consequence, irreversibility, or external impact requires class 4 rigor.');
  }

  let weightedScore: number | null = null;
  let scoreClass: RigorClass = 0;

  if (unknownDimensions.length === 0) {
    weightedScore =
      (dimensions.consequence as number) * DIMENSION_WEIGHTS.consequence +
      (dimensions.uncertainty as number) * DIMENSION_WEIGHTS.uncertainty +
      (dimensions.irreversibility as number) * DIMENSION_WEIGHTS.irreversibility +
      (dimensions.authoritySensitivity as number) * DIMENSION_WEIGHTS.authoritySensitivity +
      (dimensions.scope as number) * DIMENSION_WEIGHTS.scope +
      (dimensions.externalImpact as number) * DIMENSION_WEIGHTS.externalImpact;
    scoreClass = weightedClass(weightedScore);
    reasons.push(`Versioned weighted policy score ${weightedScore.toFixed(2)} maps to class ${scoreClass}.`);
  }

  const rigorClass = maxRigor(scoreClass, hardFloor);
  if (hardFloor > scoreClass) {
    reasons.push(`Hard floor raises required rigor to class ${hardFloor}.`);
  }

  return {
    policyVersion: GER_POLICY_VERSION,
    rigorClass,
    weightedScore,
    unknownDimensions,
    hardFloor,
    reasons,
    requirements: RIGOR_REQUIREMENTS[rigorClass],
  };
}

const ALLOWED_TRANSITIONS: Record<EpistemicState, readonly EpistemicState[]> = {
  unknown: ['observed', 'suspected'],
  observed: ['investigated', 'corroborated', 'challenged', 'rejected'],
  suspected: ['investigated', 'challenged', 'rejected'],
  investigated: ['corroborated', 'challenged', 'tested', 'supported', 'rejected', 'inconclusive'],
  corroborated: ['challenged', 'tested', 'supported', 'rejected'],
  challenged: ['investigated', 'tested', 'supported', 'rejected', 'inconclusive'],
  tested: ['supported', 'rejected', 'inconclusive', 'challenged'],
  supported: ['challenged', 'concluded', 'rejected', 'inconclusive'],
  rejected: ['reopened'],
  inconclusive: ['investigated', 'reopened', 'rejected'],
  concluded: ['acted_upon', 'monitored', 'challenged', 'reopened'],
  acted_upon: ['monitored', 'reopened'],
  monitored: ['challenged', 'reopened'],
  reopened: ['investigated', 'challenged', 'tested', 'supported', 'rejected', 'inconclusive'],
};

export interface TransitionRequest {
  from: EpistemicState;
  to: EpistemicState;
  reason: string;
  evidenceRefs: string[];
  actorRef: string;
  authorityRef?: string;
}

export interface TransitionAssessment {
  allowed: boolean;
  reasons: string[];
}

export function assessTransition(request: TransitionRequest): TransitionAssessment {
  const reasons: string[] = [];
  if (!request.reason.trim()) reasons.push('A state transition requires a rationale.');
  if (!request.actorRef.trim()) reasons.push('A state transition requires an actor reference.');
  if (request.evidenceRefs.length === 0 && request.to !== 'suspected') {
    reasons.push('A material state transition requires at least one evidence reference.');
  }
  if (!ALLOWED_TRANSITIONS[request.from].includes(request.to)) {
    reasons.push(`Transition ${request.from} -> ${request.to} is not permitted by GER-001 policy.`);
  }

  return { allowed: reasons.length === 0, reasons };
}

export interface ConclusionCandidate {
  objectType: EpistemicObjectType;
  state: EpistemicState;
  evidenceRefs: string[];
  sourceRefs: string[];
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  unresolvedContradictions: number;
  assumptionRefs: string[];
  competingHypothesesConsidered: number;
  falsifierRefs: string[];
  testResultRefs: string[];
  uncertaintyBasis?: string;
  confidence?: number;
  independentReviewRef?: string;
  exceptionRef?: string;
}

export interface ConclusionAssessment {
  ready: boolean;
  disposition: 'conclude' | 'inconclusive' | 'reject' | 'investigate_more';
  reasons: string[];
}

export function assessConclusionReadiness(
  candidate: ConclusionCandidate,
  rigorClass: RigorClass,
): ConclusionAssessment {
  const reasons: string[] = [];

  if (candidate.objectType === 'connection_candidate') {
    reasons.push('A novel connection candidate cannot be promoted directly to fact or conclusion. It must first become an examined hypothesis or supported claim.');
  }
  if (candidate.evidenceRefs.length === 0 || candidate.sourceRefs.length === 0) {
    reasons.push('Conclusion requires evidence and source provenance.');
  }
  if (candidate.supportingEvidenceCount <= 0) {
    reasons.push('Conclusion requires at least one item of supporting evidence.');
  }
  if (!candidate.uncertaintyBasis?.trim()) {
    reasons.push('Conclusion requires an explicit uncertainty basis.');
  }
  if (candidate.unresolvedContradictions > 0 && !candidate.exceptionRef) {
    reasons.push('Unresolved material contradictions block clean conclusion unless a governed exception is explicitly recorded.');
  }
  if (rigorClass >= 2 && candidate.competingHypothesesConsidered < 1) {
    reasons.push('Rigor class 2 or higher requires explicit consideration of at least one competing explanation when alternatives are plausible.');
  }
  if (rigorClass >= 2 && candidate.falsifierRefs.length < 1) {
    reasons.push('Rigor class 2 or higher requires at least one falsifier or material weakening condition.');
  }
  if (rigorClass >= 3 && candidate.testResultRefs.length < 1) {
    reasons.push('Rigor class 3 or higher requires test evidence when the claim is testable.');
  }
  if (rigorClass >= 3 && !candidate.independentReviewRef) {
    reasons.push('Rigor class 3 or higher requires independent or role-separated review.');
  }

  if (reasons.length > 0) {
    const contradictionDominant = candidate.unresolvedContradictions > 0 || candidate.contradictingEvidenceCount > candidate.supportingEvidenceCount;
    return {
      ready: false,
      disposition: contradictionDominant ? 'inconclusive' : 'investigate_more',
      reasons,
    };
  }

  return { ready: true, disposition: 'conclude', reasons: [] };
}

export interface ActionReadinessInput {
  conclusionReady: boolean;
  rigorClass: RigorClass;
  confidence?: number;
  authorityRef?: string;
  capabilityRef?: string;
  humanApprovalRef?: string;
  actionIsConsequential: boolean;
  requiredMonitoringOwner?: string;
}

export interface ActionReadinessAssessment {
  allowed: boolean;
  reasons: string[];
}

export function assessActionReadiness(input: ActionReadinessInput): ActionReadinessAssessment {
  const reasons: string[] = [];

  if (!input.conclusionReady) reasons.push('Action cannot proceed from an epistemically unready conclusion.');
  if (!input.authorityRef) reasons.push('Action requires an explicit authority reference.');
  if (!input.capabilityRef) reasons.push('Action requires an explicit capability reference.');
  if (input.actionIsConsequential && input.rigorClass >= 3 && !input.humanApprovalRef) {
    reasons.push('High-consequence action at rigor class 3 or higher requires explicit human approval.');
  }
  if (input.actionIsConsequential && input.rigorClass >= 3 && !input.requiredMonitoringOwner) {
    reasons.push('High-consequence action requires a monitoring owner and reopening path.');
  }

  return { allowed: reasons.length === 0, reasons };
}

export type ReopeningReason =
  | 'new_material_evidence'
  | 'new_contradiction'
  | 'source_invalidated_or_stale'
  | 'assumption_changed'
  | 'failed_prediction'
  | 'failed_or_reversed_test'
  | 'policy_changed'
  | 'authority_changed'
  | 'confidence_degraded'
  | 'external_state_changed'
  | 'scheduled_review';

export interface ReopeningTrigger {
  reason: ReopeningReason;
  evidenceRef: string;
  observedAt: string;
  ownerRef: string;
  materiality: 'low' | 'moderate' | 'high' | 'critical';
}

export function shouldReopen(trigger: ReopeningTrigger): boolean {
  if (!trigger.evidenceRef.trim() || !trigger.ownerRef.trim() || !trigger.observedAt.trim()) return false;
  return trigger.materiality === 'moderate' || trigger.materiality === 'high' || trigger.materiality === 'critical';
}

export const GER_INVARIANTS = [
  'Confidence is not evidence.',
  'High confidence does not grant authority.',
  'Retrieval relevance does not establish truth.',
  'A hypothesis or novel connection is not a fact.',
  'Contradictory and superseded evidence is preserved rather than erased.',
  'Unknown rigor inputs increase scrutiny rather than reducing it.',
  'Consequential action requires separate authority and capability checks.',
  'Material conclusions require explicit reopening conditions.',
  'Structured rationale and evidence references are auditable; private chain-of-thought is not required or persisted.',
] as const;
