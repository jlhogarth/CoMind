import type { ContinuityAssessment, RouteCode, RouteRecommendation } from './types.js';

export const THREADKEEPER_ROUTE_POLICY_VERSION = 'tk-route-v1';

function includesAny(values: string[], candidates: string[]): boolean {
  return candidates.some(candidate => values.includes(candidate));
}

export function recommendRoute(assessment: ContinuityAssessment): RouteRecommendation {
  let routeCode: RouteCode;
  let authorityRequired = false;

  if (includesAny(assessment.reasonCodes, ['required_evidence_missing', 'required_evidence_unverifiable'])) {
    routeCode = 'REQUEST_EVIDENCE';
  } else if (includesAny(assessment.reasonCodes, ['scope_identity_ambiguous', 'scope_identity_invalid'])) {
    routeCode = 'REQUEST_HUMAN_REVIEW';
    authorityRequired = true;
  } else if (includesAny(assessment.reasonCodes, ['checkpoint_authority_invalid'])) {
    routeCode = 'REQUEST_GOVERNANCE_REVIEW';
    authorityRequired = true;
  } else if (assessment.classification === 'UNRESOLVED_CONFLICT') {
    routeCode = 'REQUEST_EPISTEMIC_REVIEW';
  } else if (assessment.classification === 'CHANGED_WITH_LINEAGE') {
    routeCode = 'PROPOSE_AUTHORIZED_DIVERGENCE';
    authorityRequired = true;
  } else if (assessment.classification === 'SUSPECTED_BREAK') {
    routeCode = 'REQUEST_HELPER_ANALYSIS';
  } else if (assessment.classification === 'CONFIRMED_BREAK') {
    routeCode = includesAny(assessment.breakTypes, ['broken_lineage'])
      ? 'REQUEST_GOVERNANCE_REVIEW'
      : 'REQUEST_HUMAN_REVIEW';
    authorityRequired = true;
  } else if (assessment.classification === 'BLOCKED') {
    routeCode = 'PAUSE_DEPENDENT_ACTION';
    authorityRequired = true;
  } else {
    routeCode = 'RETAIN_UNRESOLVED';
  }

  return {
    routeCode,
    policyVersion: THREADKEEPER_ROUTE_POLICY_VERSION,
    reasonCodes: [...assessment.reasonCodes],
    authorityRequired,
  };
}
