export const TWIN_PROMOTION_POLICY_VERSION = 'ger-005-v1' as const;

export interface TwinPromotionCandidate {
  subjectRef: string;
  purpose: string;
  sourceClass: 'explicit_user' | 'observed' | 'imported' | 'inferred' | 'simulated';
  sourceRefs: string[];
  evidenceRefs: string[];
  inferenceMethodVersion?: string;
  uncertaintyBasis?: string;
  reopeningCondition?: string;
  status: 'candidate' | 'contradicted' | 'superseded' | 'restricted';
  sensitive: boolean;
}

export interface TwinPromotionContext {
  identity: { verified: boolean; subjectRef: string; actorRef: string; evidenceRef: string };
  consent: { decision: 'allow' | 'deny' | 'unknown'; liveVerified: boolean; subjectRef: string; purpose: string; evidenceRef: string };
  access: { decision: 'allow' | 'deny' | 'unknown'; liveVerified: boolean; subjectRef: string; evidenceRef: string };
  approval: { approved: boolean; actorRef: string; authorityRef: string };
}

export interface TwinPromotionAssessment {
  policyVersion: typeof TWIN_PROMOTION_POLICY_VERSION;
  readyForDurablePromotion: boolean;
  reasons: string[];
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const refs = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(filled);

// A policy assessment, not a writer, consent issuer, identity verifier, or RLS evaluator.
// Callers must supply independently verified decisions from their owning systems.
export function assessTwinPromotion(candidate: TwinPromotionCandidate, context: TwinPromotionContext): TwinPromotionAssessment {
  const reasons: string[] = [];
  if (!candidate || !context || !context.identity || !context.consent || !context.access || !context.approval) {
    return { policyVersion: TWIN_PROMOTION_POLICY_VERSION, readyForDurablePromotion: false, reasons: ['Missing promotion context.'] };
  }
  if (!filled(candidate.subjectRef) || !filled(candidate.purpose) || !refs(candidate.sourceRefs)
    || !refs(candidate.evidenceRefs)) reasons.push('Exact subject, purpose, source and evidence references are required.');
  if (refs(candidate.sourceRefs) && new Set(candidate.sourceRefs).size !== candidate.sourceRefs.length) {
    reasons.push('Repeated source references are not independent evidence.');
  }
  if (!['explicit_user', 'observed', 'imported', 'inferred', 'simulated'].includes(candidate.sourceClass)
    || !['candidate', 'contradicted', 'superseded', 'restricted'].includes(candidate.status)) {
    reasons.push('Unknown provenance or assertion status.');
  }
  if (typeof candidate.sensitive !== 'boolean') reasons.push('Explicit sensitivity classification is required.');
  if (candidate.sourceClass === 'simulated') reasons.push('Simulated output cannot be promoted as person history.');
  if (candidate.status !== 'candidate') reasons.push('Non-current, contradicted or restricted assertion cannot be promoted.');
  if (!context.identity.verified || !filled(context.identity.actorRef) || !filled(context.identity.evidenceRef)
    || context.identity.subjectRef !== candidate.subjectRef) reasons.push('Verified subject-to-principal binding is required.');
  if (!context.consent.liveVerified || context.consent.decision !== 'allow'
    || !filled(context.consent.evidenceRef) || context.consent.subjectRef !== candidate.subjectRef
    || context.consent.purpose !== candidate.purpose) reasons.push('Live subject-specific consent for this purpose is required.');
  if (!context.access.liveVerified || context.access.decision !== 'allow'
    || !filled(context.access.evidenceRef) || context.access.subjectRef !== candidate.subjectRef) {
    reasons.push('Live scoped access decision is required.');
  }
  if (candidate.sourceClass === 'inferred') {
    if (!filled(candidate.inferenceMethodVersion) || !filled(candidate.uncertaintyBasis)
      || !filled(candidate.reopeningCondition)) reasons.push('Inferred claim requires method, uncertainty and reopening condition.');
  }
  if (candidate.sourceClass !== 'explicit_user' || candidate.sensitive) {
    if (!context.approval.approved || !filled(context.approval.actorRef)
      || !filled(context.approval.authorityRef)
      || context.approval.actorRef !== context.identity.actorRef) {
      reasons.push('Consequential inference or sensitive claim requires bound human promotion approval.');
    }
  }
  return { policyVersion: TWIN_PROMOTION_POLICY_VERSION, readyForDurablePromotion: reasons.length === 0, reasons };
}
