import {
  assertNoCredentialMaterial,
  fingerprintCanonicalValue,
} from './checkpoint.js';
import type { ContinuityHandoffEnvelope } from './handoff.js';

export const CONTINUITY_CAPSULE_VERSION = 'continuity-capsule-v1' as const;
export const CONTINUITY_PRECONDITION_VERSION = 'continuity-precondition-v1' as const;
export const CONTINUITY_FIDELITY_POLICY_VERSION = 'continuity-fidelity-policy-v1' as const;

const MAX_CAPSULE_BYTES = 65536;
const MAX_REFERENCE_LENGTH = 1024;
const MAX_REFERENCE_COUNT = 256;
const MAX_CAPSULE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export type ContinuitySensitivity =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

export interface ContinuityCapsuleReferences {
  objectiveRefs: string[];
  decisionRefs: string[];
  assumptionRefs: string[];
  obligationRefs: string[];
  prohibitedActionRefs: string[];
  openQuestionRefs: string[];
  evidenceRefs: string[];
}

export interface ContinuityCapsuleAuthority {
  mode: 'requires_independent_validation';
  inheritance: 'forbidden';
  authorityEvidenceRefs: string[];
  policyRefs: string[];
}

export interface ContinuityCapsule {
  version: typeof CONTINUITY_CAPSULE_VERSION;
  scopeSemanticKey: string;
  currentCheckpoint: {
    checkpointId: string;
    parentCheckpointId: string | null;
    acceptedAt: string;
    stateDigest: string;
    proposalDigest: string;
  };
  lineage: {
    checkpointIds: string[];
    depth: number;
  };
  unresolvedCaseRefs: string[];
  continuityDigest: string;
  references: ContinuityCapsuleReferences;
  authority: ContinuityCapsuleAuthority;
  sensitivity: ContinuitySensitivity;
  retentionClass: string;
  issuedAt: string;
  expiresAt: string;
  capsuleDigest: string;
}

export interface CreateContinuityCapsuleInput {
  handoff: ContinuityHandoffEnvelope;
  references: ContinuityCapsuleReferences;
  authorityEvidenceRefs?: string[];
  policyRefs?: string[];
  sensitivity: ContinuitySensitivity;
  retentionClass: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ContinuityPrecondition {
  version: typeof CONTINUITY_PRECONDITION_VERSION;
  scopeSemanticKey: string;
  expectedCheckpointId: string;
  expectedContinuityDigest: string;
  sourceCapsuleDigest: string;
  authorityMode: 'requires_independent_validation';
  authorityInheritance: 'forbidden';
  issuedAt: string;
  expiresAt: string;
  preconditionDigest: string;
}

export type ContinuityPreconditionStatus =
  | 'valid'
  | 'invalid'
  | 'integrity_mismatch'
  | 'handoff_integrity_mismatch'
  | 'expired'
  | 'scope_mismatch'
  | 'stale_checkpoint'
  | 'continuity_digest_mismatch'
  | 'authority_contract_mismatch';

export interface ContinuityPreconditionResult {
  valid: boolean;
  status: ContinuityPreconditionStatus;
}

export interface ContinuityFidelityPolicy {
  version: typeof CONTINUITY_FIDELITY_POLICY_VERSION;
  requireAssumptionRefs: boolean;
  requireOpenQuestionRefs: boolean;
  requireEvidenceRefs: boolean;
  requireUnresolvedCaseRefs: boolean;
}

export const STRICT_CONTINUITY_FIDELITY_POLICY: ContinuityFidelityPolicy = Object.freeze({
  version: CONTINUITY_FIDELITY_POLICY_VERSION,
  requireAssumptionRefs: true,
  requireOpenQuestionRefs: true,
  requireEvidenceRefs: true,
  requireUnresolvedCaseRefs: true,
});

export type ContinuityFidelityReason =
  | 'source_integrity_invalid'
  | 'candidate_integrity_invalid'
  | 'scope_substituted'
  | 'checkpoint_substituted'
  | 'continuity_digest_changed'
  | 'lineage_changed'
  | 'authority_weakened'
  | 'sensitivity_weakened'
  | 'retention_changed'
  | 'expiry_extended'
  | 'objective_reference_lost'
  | 'decision_reference_lost'
  | 'assumption_reference_lost'
  | 'obligation_reference_lost'
  | 'prohibition_reference_lost'
  | 'open_question_reference_lost'
  | 'evidence_reference_lost'
  | 'authority_evidence_reference_lost'
  | 'policy_reference_lost'
  | 'unresolved_case_reference_lost';

export interface ContinuityFidelityReport {
  status: 'PASS' | 'FAIL';
  preserved: boolean;
  reasons: ContinuityFidelityReason[];
}

function boundedString(value: unknown, field: string, max = MAX_REFERENCE_LENGTH): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function validateOrderedReferences(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFERENCE_COUNT) {
    throw new Error(`Invalid ${field}`);
  }
  const validated = values.map((value, index) => {
    boundedString(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(validated).size !== validated.length) {
    throw new Error(`Duplicate ${field}`);
  }
  return [...validated];
}

function normalizeReferences(values: readonly string[], field: string): string[] {
  return validateOrderedReferences(values, field).sort();
}

function assertSha256(value: string, field: string): void {
  if (!SHA256_HEX.test(value)) throw new Error(`Invalid ${field}`);
}

function assertLifetime(issuedAt: string, expiresAt: string): void {
  const issuedMs = Date.parse(issuedAt);
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)
      || expiresMs <= issuedMs
      || expiresMs - issuedMs > MAX_CAPSULE_LIFETIME_MS) {
    throw new Error('Invalid continuity capsule lifetime');
  }
}

function withoutCapsuleDigest(capsule: ContinuityCapsule): Omit<ContinuityCapsule, 'capsuleDigest'> {
  const { capsuleDigest: _capsuleDigest, ...payload } = capsule;
  return payload;
}

function withoutPreconditionDigest(
  precondition: ContinuityPrecondition
): Omit<ContinuityPrecondition, 'preconditionDigest'> {
  const { preconditionDigest: _preconditionDigest, ...payload } = precondition;
  return payload;
}

function canonicalCapsuleBytes(capsule: ContinuityCapsule): number {
  return Buffer.byteLength(JSON.stringify(capsule), 'utf8');
}

function isSensitivity(value: unknown): value is ContinuitySensitivity {
  return value === 'public'
    || value === 'internal'
    || value === 'confidential'
    || value === 'restricted';
}

function sensitivityRank(value: ContinuitySensitivity): number {
  switch (value) {
    case 'public': return 0;
    case 'internal': return 1;
    case 'confidential': return 2;
    case 'restricted': return 3;
  }
}

function containsAll(candidate: readonly string[], source: readonly string[]): boolean {
  const available = new Set(candidate);
  return source.every(value => available.has(value));
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalHandoffContinuity(handoff: ContinuityHandoffEnvelope) {
  return {
    version: handoff.version,
    scopeSemanticKey: handoff.scopeSemanticKey,
    currentCheckpoint: handoff.currentCheckpoint,
    lineage: handoff.lineage,
    unresolvedCases: handoff.unresolvedCases,
  };
}

export function verifyContinuityHandoffDigest(handoff: ContinuityHandoffEnvelope): boolean {
  try {
    if (!handoff || handoff.version !== 'continuity-handoff-v1') return false;
    boundedString(handoff.scopeSemanticKey, 'continuity handoff scope semantic key', 256);
    boundedString(handoff.currentCheckpoint.checkpointId, 'continuity handoff checkpoint id', 128);
    if (handoff.currentCheckpoint.parentCheckpointId !== null) {
      boundedString(handoff.currentCheckpoint.parentCheckpointId, 'continuity handoff parent checkpoint id', 128);
    }
    boundedString(handoff.currentCheckpoint.persistenceSeq, 'continuity handoff persistence sequence', 128);
    normalizeTimestamp(handoff.currentCheckpoint.acceptedAt, 'continuity handoff accepted timestamp');
    boundedString(handoff.currentCheckpoint.acceptedByRef, 'continuity handoff accepted-by reference');
    boundedString(handoff.currentCheckpoint.authorityEvidenceRef, 'continuity handoff authority evidence reference');
    if (handoff.currentCheckpoint.policyRef !== null) {
      boundedString(handoff.currentCheckpoint.policyRef, 'continuity handoff policy reference');
    }
    assertSha256(handoff.currentCheckpoint.stateDigest, 'continuity handoff state digest');
    assertSha256(handoff.currentCheckpoint.proposalDigest, 'continuity handoff proposal digest');
    assertSha256(handoff.continuityDigest, 'continuity handoff continuity digest');

    const lineage = validateOrderedReferences(handoff.lineage.checkpointIds, 'continuity handoff lineage');
    if (!Number.isSafeInteger(handoff.lineage.depth)
        || handoff.lineage.depth <= 0
        || handoff.lineage.depth !== lineage.length
        || lineage.at(-1) !== handoff.currentCheckpoint.checkpointId) {
      return false;
    }

    if (!Array.isArray(handoff.unresolvedCases) || handoff.unresolvedCases.length > MAX_REFERENCE_COUNT) return false;
    for (const item of handoff.unresolvedCases) {
      boundedString(item.caseId, 'continuity handoff case id', 128);
      boundedString(item.caseKey, 'continuity handoff case key', 512);
      boundedString(item.state, 'continuity handoff case state', 128);
      boundedString(item.latestTransitionId, 'continuity handoff latest transition id', 128);
      normalizeTimestamp(item.lastTransitionAt, 'continuity handoff last transition timestamp');
    }

    if (handoff.consumer.authorityMode !== 'requires_independent_validation') return false;
    boundedString(handoff.consumer.consumerRef, 'continuity handoff consumer reference', 512);
    if (handoff.consumer.providerRef !== null) {
      boundedString(handoff.consumer.providerRef, 'continuity handoff provider reference', 512);
    }
    if (handoff.consumer.actorRef !== null) {
      boundedString(handoff.consumer.actorRef, 'continuity handoff actor reference', 512);
    }
    normalizeTimestamp(handoff.consumer.resolvedAt, 'continuity handoff resolved timestamp');

    const canonical = canonicalHandoffContinuity(handoff);
    assertNoCredentialMaterial(canonical);
    return fingerprintCanonicalValue(canonical) === handoff.continuityDigest;
  } catch {
    return false;
  }
}

export function createContinuityCapsule(input: CreateContinuityCapsuleInput): ContinuityCapsule {
  const { handoff } = input;
  if (!verifyContinuityHandoffDigest(handoff)) {
    throw new Error('Continuity handoff digest mismatch or malformed handoff');
  }

  const lineage = validateOrderedReferences(handoff.lineage.checkpointIds, 'continuity capsule lineage');
  if (lineage.length !== handoff.lineage.depth
      || lineage.at(-1) !== handoff.currentCheckpoint.checkpointId) {
    throw new Error('Invalid continuity handoff lineage');
  }

  const references: ContinuityCapsuleReferences = {
    objectiveRefs: normalizeReferences(input.references.objectiveRefs, 'objective references'),
    decisionRefs: normalizeReferences(input.references.decisionRefs, 'decision references'),
    assumptionRefs: normalizeReferences(input.references.assumptionRefs, 'assumption references'),
    obligationRefs: normalizeReferences(input.references.obligationRefs, 'obligation references'),
    prohibitedActionRefs: normalizeReferences(input.references.prohibitedActionRefs, 'prohibited action references'),
    openQuestionRefs: normalizeReferences(input.references.openQuestionRefs, 'open question references'),
    evidenceRefs: normalizeReferences(input.references.evidenceRefs, 'evidence references'),
  };

  const checkpointAuthorityRefs = normalizeReferences(
    [handoff.currentCheckpoint.authorityEvidenceRef, ...(input.authorityEvidenceRefs ?? [])],
    'authority evidence references'
  );
  const checkpointPolicyRefs = normalizeReferences(
    [
      ...(handoff.currentCheckpoint.policyRef ? [handoff.currentCheckpoint.policyRef] : []),
      ...(input.policyRefs ?? []),
    ],
    'policy references'
  );

  if (!isSensitivity(input.sensitivity)) throw new Error('Invalid continuity capsule sensitivity');
  boundedString(input.retentionClass, 'continuity capsule retention class', 128);
  const issuedAt = normalizeTimestamp(input.issuedAt, 'continuity capsule issued timestamp');
  const expiresAt = normalizeTimestamp(input.expiresAt, 'continuity capsule expiry timestamp');
  assertLifetime(issuedAt, expiresAt);

  const acceptedAt = normalizeTimestamp(
    handoff.currentCheckpoint.acceptedAt,
    'continuity capsule checkpoint acceptance timestamp'
  );
  const resolvedAt = normalizeTimestamp(handoff.consumer.resolvedAt, 'continuity handoff resolution timestamp');
  if (Date.parse(issuedAt) < Date.parse(acceptedAt) || Date.parse(issuedAt) < Date.parse(resolvedAt)) {
    throw new Error('Continuity capsule cannot be issued before accepted or resolved handoff state');
  }

  const payload: Omit<ContinuityCapsule, 'capsuleDigest'> = {
    version: CONTINUITY_CAPSULE_VERSION,
    scopeSemanticKey: handoff.scopeSemanticKey,
    currentCheckpoint: {
      checkpointId: handoff.currentCheckpoint.checkpointId,
      parentCheckpointId: handoff.currentCheckpoint.parentCheckpointId,
      acceptedAt,
      stateDigest: handoff.currentCheckpoint.stateDigest,
      proposalDigest: handoff.currentCheckpoint.proposalDigest,
    },
    lineage: {
      checkpointIds: lineage,
      depth: handoff.lineage.depth,
    },
    unresolvedCaseRefs: normalizeReferences(
      handoff.unresolvedCases.map(item => `threadkeeper-case:${item.caseId}`),
      'unresolved case references'
    ),
    continuityDigest: handoff.continuityDigest,
    references,
    authority: {
      mode: 'requires_independent_validation',
      inheritance: 'forbidden',
      authorityEvidenceRefs: checkpointAuthorityRefs,
      policyRefs: checkpointPolicyRefs,
    },
    sensitivity: input.sensitivity,
    retentionClass: input.retentionClass,
    issuedAt,
    expiresAt,
  };

  assertNoCredentialMaterial(payload);
  const capsule: ContinuityCapsule = {
    ...payload,
    capsuleDigest: fingerprintCanonicalValue(payload),
  };
  if (canonicalCapsuleBytes(capsule) > MAX_CAPSULE_BYTES) {
    throw new Error('Continuity capsule exceeds 64 KiB');
  }
  return Object.freeze(structuredClone(capsule));
}

export function verifyContinuityCapsule(capsule: ContinuityCapsule, now?: string): boolean {
  try {
    if (!capsule || capsule.version !== CONTINUITY_CAPSULE_VERSION
        || !SHA256_HEX.test(capsule.capsuleDigest)
        || !SHA256_HEX.test(capsule.continuityDigest)
        || !SHA256_HEX.test(capsule.currentCheckpoint.stateDigest)
        || !SHA256_HEX.test(capsule.currentCheckpoint.proposalDigest)
        || capsule.authority.mode !== 'requires_independent_validation'
        || capsule.authority.inheritance !== 'forbidden'
        || !isSensitivity(capsule.sensitivity)
        || canonicalCapsuleBytes(capsule) > MAX_CAPSULE_BYTES) {
      return false;
    }
    boundedString(capsule.scopeSemanticKey, 'continuity capsule scope semantic key', 256);
    boundedString(capsule.retentionClass, 'continuity capsule retention class', 128);
    assertLifetime(capsule.issuedAt, capsule.expiresAt);
    const acceptedAt = normalizeTimestamp(capsule.currentCheckpoint.acceptedAt, 'continuity capsule accepted timestamp');
    const issuedAt = normalizeTimestamp(capsule.issuedAt, 'continuity capsule issued timestamp');
    if (Date.parse(issuedAt) < Date.parse(acceptedAt)) return false;

    const lineage = validateOrderedReferences(capsule.lineage.checkpointIds, 'continuity capsule lineage');
    normalizeReferences(capsule.unresolvedCaseRefs, 'unresolved case references');
    normalizeReferences(capsule.references.objectiveRefs, 'objective references');
    normalizeReferences(capsule.references.decisionRefs, 'decision references');
    normalizeReferences(capsule.references.assumptionRefs, 'assumption references');
    normalizeReferences(capsule.references.obligationRefs, 'obligation references');
    normalizeReferences(capsule.references.prohibitedActionRefs, 'prohibited action references');
    normalizeReferences(capsule.references.openQuestionRefs, 'open question references');
    normalizeReferences(capsule.references.evidenceRefs, 'evidence references');
    normalizeReferences(capsule.authority.authorityEvidenceRefs, 'authority evidence references');
    normalizeReferences(capsule.authority.policyRefs, 'policy references');
    if (capsule.lineage.depth !== lineage.length
        || capsule.lineage.depth <= 0
        || lineage.at(-1) !== capsule.currentCheckpoint.checkpointId) {
      return false;
    }
    assertNoCredentialMaterial(capsule);
    if (fingerprintCanonicalValue(withoutCapsuleDigest(capsule)) !== capsule.capsuleDigest) {
      return false;
    }
    if (now !== undefined) {
      const nowMs = Date.parse(now);
      if (!Number.isFinite(nowMs)
          || nowMs < Date.parse(capsule.issuedAt)
          || nowMs >= Date.parse(capsule.expiresAt)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createContinuityPrecondition(capsule: ContinuityCapsule): ContinuityPrecondition {
  if (!verifyContinuityCapsule(capsule)) throw new Error('Cannot create precondition from invalid continuity capsule');
  const payload: Omit<ContinuityPrecondition, 'preconditionDigest'> = {
    version: CONTINUITY_PRECONDITION_VERSION,
    scopeSemanticKey: capsule.scopeSemanticKey,
    expectedCheckpointId: capsule.currentCheckpoint.checkpointId,
    expectedContinuityDigest: capsule.continuityDigest,
    sourceCapsuleDigest: capsule.capsuleDigest,
    authorityMode: 'requires_independent_validation',
    authorityInheritance: 'forbidden',
    issuedAt: capsule.issuedAt,
    expiresAt: capsule.expiresAt,
  };
  return Object.freeze({
    ...payload,
    preconditionDigest: fingerprintCanonicalValue(payload),
  });
}

export function validateContinuityPrecondition(
  precondition: ContinuityPrecondition,
  current: ContinuityHandoffEnvelope,
  now: string
): ContinuityPreconditionResult {
  try {
    if (!precondition || precondition.version !== CONTINUITY_PRECONDITION_VERSION
        || !SHA256_HEX.test(precondition.preconditionDigest)
        || !SHA256_HEX.test(precondition.expectedContinuityDigest)
        || !SHA256_HEX.test(precondition.sourceCapsuleDigest)) {
      return { valid: false, status: 'invalid' };
    }
    if (fingerprintCanonicalValue(withoutPreconditionDigest(precondition)) !== precondition.preconditionDigest) {
      return { valid: false, status: 'integrity_mismatch' };
    }
    const nowMs = Date.parse(now);
    const issuedMs = Date.parse(precondition.issuedAt);
    const expiresMs = Date.parse(precondition.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)
        || nowMs < issuedMs || nowMs >= expiresMs) {
      return { valid: false, status: 'expired' };
    }
    if (!verifyContinuityHandoffDigest(current)) {
      return { valid: false, status: 'handoff_integrity_mismatch' };
    }
    if (precondition.authorityMode !== 'requires_independent_validation'
        || precondition.authorityInheritance !== 'forbidden'
        || current.consumer.authorityMode !== 'requires_independent_validation') {
      return { valid: false, status: 'authority_contract_mismatch' };
    }
    if (precondition.scopeSemanticKey !== current.scopeSemanticKey) {
      return { valid: false, status: 'scope_mismatch' };
    }
    if (precondition.expectedCheckpointId !== current.currentCheckpoint.checkpointId) {
      return { valid: false, status: 'stale_checkpoint' };
    }
    if (precondition.expectedContinuityDigest !== current.continuityDigest) {
      return { valid: false, status: 'continuity_digest_mismatch' };
    }
    return { valid: true, status: 'valid' };
  } catch {
    return { valid: false, status: 'invalid' };
  }
}

export function validateContinuityCapsuleFidelity(
  source: ContinuityCapsule,
  candidate: ContinuityCapsule,
  policy: ContinuityFidelityPolicy = STRICT_CONTINUITY_FIDELITY_POLICY
): ContinuityFidelityReport {
  const reasons: ContinuityFidelityReason[] = [];
  if (!verifyContinuityCapsule(source)) reasons.push('source_integrity_invalid');
  if (!verifyContinuityCapsule(candidate)) reasons.push('candidate_integrity_invalid');
  if (reasons.length > 0) return { status: 'FAIL', preserved: false, reasons };

  if (source.scopeSemanticKey !== candidate.scopeSemanticKey) reasons.push('scope_substituted');
  if (source.currentCheckpoint.checkpointId !== candidate.currentCheckpoint.checkpointId) {
    reasons.push('checkpoint_substituted');
  }
  if (source.continuityDigest !== candidate.continuityDigest) reasons.push('continuity_digest_changed');
  if (!sameOrderedValues(source.lineage.checkpointIds, candidate.lineage.checkpointIds)) {
    reasons.push('lineage_changed');
  }
  if (candidate.authority.mode !== source.authority.mode
      || candidate.authority.inheritance !== 'forbidden') {
    reasons.push('authority_weakened');
  }
  if (sensitivityRank(candidate.sensitivity) < sensitivityRank(source.sensitivity)) {
    reasons.push('sensitivity_weakened');
  }
  if (candidate.retentionClass !== source.retentionClass) reasons.push('retention_changed');
  if (Date.parse(candidate.expiresAt) > Date.parse(source.expiresAt)) reasons.push('expiry_extended');

  if (!containsAll(candidate.references.objectiveRefs, source.references.objectiveRefs)) {
    reasons.push('objective_reference_lost');
  }
  if (!containsAll(candidate.references.decisionRefs, source.references.decisionRefs)) {
    reasons.push('decision_reference_lost');
  }
  if (policy.requireAssumptionRefs
      && !containsAll(candidate.references.assumptionRefs, source.references.assumptionRefs)) {
    reasons.push('assumption_reference_lost');
  }
  if (!containsAll(candidate.references.obligationRefs, source.references.obligationRefs)) {
    reasons.push('obligation_reference_lost');
  }
  if (!containsAll(candidate.references.prohibitedActionRefs, source.references.prohibitedActionRefs)) {
    reasons.push('prohibition_reference_lost');
  }
  if (policy.requireOpenQuestionRefs
      && !containsAll(candidate.references.openQuestionRefs, source.references.openQuestionRefs)) {
    reasons.push('open_question_reference_lost');
  }
  if (policy.requireEvidenceRefs
      && !containsAll(candidate.references.evidenceRefs, source.references.evidenceRefs)) {
    reasons.push('evidence_reference_lost');
  }
  if (!containsAll(candidate.authority.authorityEvidenceRefs, source.authority.authorityEvidenceRefs)) {
    reasons.push('authority_evidence_reference_lost');
  }
  if (!containsAll(candidate.authority.policyRefs, source.authority.policyRefs)) {
    reasons.push('policy_reference_lost');
  }
  if (policy.requireUnresolvedCaseRefs
      && !containsAll(candidate.unresolvedCaseRefs, source.unresolvedCaseRefs)) {
    reasons.push('unresolved_case_reference_lost');
  }

  return {
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    preserved: reasons.length === 0,
    reasons,
  };
}
