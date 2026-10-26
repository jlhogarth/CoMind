import type {
  AssessmentContext,
  ContinuityAssessment,
  ContinuityClassification,
} from './types.js';

export const THREADKEEPER_ASSESSOR_VERSION = 'tk-assessor-v1';

interface Decision {
  classification: ContinuityClassification;
  reasonCodes: string[];
  breakTypes: string[];
  confidence: number;
  uncertainty: number;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function decision(
  classification: ContinuityClassification,
  reasonCodes: string[],
  breakTypes: string[],
  confidence: number,
  uncertainty: number
): Decision {
  return {
    classification,
    reasonCodes,
    breakTypes,
    confidence: bounded(confidence),
    uncertainty: bounded(uncertainty),
  };
}

export function assessContinuity(context: AssessmentContext): ContinuityAssessment {
  const { signals } = context;
  let result: Decision;

  if (signals.scopeStatus !== 'valid') {
    result = decision(
      'BLOCKED',
      [signals.scopeStatus === 'ambiguous' ? 'scope_identity_ambiguous' : 'scope_identity_invalid'],
      ['identity_collision'],
      1,
      signals.scopeStatus === 'ambiguous' ? 1 : 0
    );
  } else if (signals.requiredEvidenceStatus === 'conflicting') {
    result = decision(
      'UNRESOLVED_CONFLICT',
      ['authoritative_evidence_conflict'],
      ['contradictory_accepted_state'],
      0.95,
      1
    );
  } else if (signals.requiredEvidenceStatus === 'missing'
      || signals.requiredEvidenceStatus === 'unverifiable') {
    result = decision(
      'BLOCKED',
      [signals.requiredEvidenceStatus === 'missing' ? 'required_evidence_missing' : 'required_evidence_unverifiable'],
      ['missing_provenance'],
      1,
      1
    );
  } else if (!signals.checkpointIntegrityValid) {
    result = decision(
      'BLOCKED',
      ['checkpoint_integrity_invalid'],
      ['broken_lineage'],
      1,
      0
    );
  } else if (!signals.checkpointAuthorityValid) {
    result = decision(
      'BLOCKED',
      ['checkpoint_authority_invalid'],
      ['authority_failure'],
      1,
      0
    );
  } else if (!signals.acceptedBaselinePresent) {
    result = decision(
      'BLOCKED',
      ['accepted_baseline_missing'],
      ['context_loss'],
      1,
      1
    );
  } else if (signals.predecessorStatus === 'broken') {
    result = decision(
      'CONFIRMED_BREAK',
      ['broken_predecessor_lineage'],
      ['broken_lineage'],
      1,
      0
    );
  } else if (signals.authoritativeConflict) {
    result = decision(
      'UNRESOLVED_CONFLICT',
      ['authoritative_state_conflict'],
      ['contradictory_accepted_state'],
      0.95,
      1
    );
  } else if (signals.authorizedChange && signals.materialChange) {
    result = decision(
      'CHANGED_WITH_LINEAGE',
      ['authorized_material_change'],
      [],
      1,
      0
    );
  } else if (signals.materialChange && signals.incompatibilityProven) {
    result = decision(
      'CONFIRMED_BREAK',
      ['authoritative_incompatibility_proven'],
      ['unexplained_plan_divergence'],
      1,
      0
    );
  } else if (signals.materialChange) {
    result = decision(
      'SUSPECTED_BREAK',
      ['material_change_without_sufficient_authority_or_explanation'],
      ['unexplained_plan_divergence'],
      0.75,
      0.5
    );
  } else {
    result = decision('INTACT', ['continuity_invariants_hold'], [], 1, 0);
  }

  return {
    ...result,
    scopeSemanticKey: context.scopeSemanticKey,
    checkpointId: context.checkpointId,
    observationId: context.observationId,
    evidenceRefs: structuredClone(context.evidenceRefs),
    ...(context.traceId ? { traceId: context.traceId } : {}),
    assessorVersion: THREADKEEPER_ASSESSOR_VERSION,
  };
}
