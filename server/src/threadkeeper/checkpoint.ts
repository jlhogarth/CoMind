import {
  assertNoCredentialMaterial,
  canonicalizeForIntegrity,
  fingerprintCanonicalValue,
} from '../continuity/checkpoint.js';
import type {
  AuthorityValidationResult,
  CheckpointAcceptanceResult,
  CheckpointProposal,
  CheckpointProposalInput,
  EvidenceRef,
  ThreadKeeperCheckpointState,
} from './types.js';

const MAX_THREADKEEPER_CHECKPOINT_BYTES = 65536;

function boundedString(value: unknown, field: string, max = 2048): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function validTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function validateStringRefs(values: string[], field: string): void {
  if (!Array.isArray(values)) throw new Error(`Invalid ${field}`);
  for (const value of values) boundedString(value, field, 4096);
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field}`);
}

function validateEvidenceRef(ref: EvidenceRef): void {
  if (!ref || typeof ref !== 'object') throw new Error('Invalid evidence reference');
  boundedString(ref.provider, 'evidence provider', 256);
  boundedString(ref.kind, 'evidence kind', 256);
  boundedString(ref.ref, 'evidence ref', 4096);
  if (ref.version !== undefined) boundedString(ref.version, 'evidence version', 512);
  if (ref.digest !== undefined && !/^[a-f0-9]{64}$/i.test(ref.digest)) throw new Error('Invalid evidence digest');
  if (ref.sensitivity !== undefined) boundedString(ref.sensitivity, 'evidence sensitivity', 128);
}

function validateState(state: ThreadKeeperCheckpointState): void {
  if (!state || typeof state !== 'object') throw new Error('Invalid ThreadKeeper checkpoint state');
  validateStringRefs(state.objectiveRefs, 'objective reference');
  validateStringRefs(state.decisionRefs, 'decision reference');
  validateStringRefs(state.commitmentRefs, 'commitment reference');
  validateStringRefs(state.obligationRefs, 'obligation reference');
  validateStringRefs(state.contextRefs, 'context reference');
  if (!Array.isArray(state.evidenceRefs) || !Array.isArray(state.sourceRefs)) {
    throw new Error('Invalid checkpoint evidence references');
  }
  state.evidenceRefs.forEach(validateEvidenceRef);
  state.sourceRefs.forEach(validateEvidenceRef);
  boundedString(state.sensitivity, 'checkpoint sensitivity', 128);
  boundedString(state.retentionClass, 'checkpoint retention class', 128);
  assertNoCredentialMaterial(state);
}

function proposalPayload(proposal: Omit<CheckpointProposal, 'digest'>): Omit<CheckpointProposal, 'digest'> {
  return structuredClone(proposal);
}

export function createCheckpointProposal(input: CheckpointProposalInput): CheckpointProposal {
  boundedString(input.proposalId, 'checkpoint proposal id', 512);
  boundedString(input.scopeSemanticKey, 'scope semantic key', 256);
  boundedString(input.proposedByRef, 'checkpoint proposer reference', 512);
  if (input.parentCheckpointId !== null) boundedString(input.parentCheckpointId, 'parent checkpoint id', 512);
  if (input.currentAcceptedCheckpointId !== null) {
    boundedString(input.currentAcceptedCheckpointId, 'current accepted checkpoint id', 512);
  }
  if (input.parentCheckpointId !== input.currentAcceptedCheckpointId) {
    throw new Error('Checkpoint proposal does not descend from the current accepted head');
  }
  if (input.policyRef !== undefined) boundedString(input.policyRef, 'checkpoint policy reference', 512);
  const proposedAt = validTimestamp(input.proposedAt, 'checkpoint proposal timestamp');
  validateState(input.state);

  const clonedState = structuredClone(input.state);
  const stateDigest = fingerprintCanonicalValue(clonedState);
  const payload: Omit<CheckpointProposal, 'digest'> = {
    version: 1,
    proposalId: input.proposalId,
    scopeSemanticKey: input.scopeSemanticKey,
    parentCheckpointId: input.parentCheckpointId,
    currentAcceptedCheckpointId: input.currentAcceptedCheckpointId,
    proposedAt,
    proposedByRef: input.proposedByRef,
    ...(input.policyRef ? { policyRef: input.policyRef } : {}),
    state: clonedState,
    stateDigest,
  };
  const digest = fingerprintCanonicalValue(payload);
  const proposal: CheckpointProposal = { ...payload, digest };
  if (Buffer.byteLength(canonicalizeForIntegrity(proposal), 'utf8') > MAX_THREADKEEPER_CHECKPOINT_BYTES) {
    throw new Error('ThreadKeeper checkpoint proposal exceeds 64 KiB');
  }
  return proposal;
}

export function verifyCheckpointProposal(proposal: CheckpointProposal): boolean {
  try {
    if (!proposal || proposal.version !== 1 || !/^[a-f0-9]{64}$/.test(proposal.stateDigest)
        || !/^[a-f0-9]{64}$/.test(proposal.digest)) return false;
    validateState(proposal.state);
    if (Buffer.byteLength(canonicalizeForIntegrity(proposal), 'utf8') > MAX_THREADKEEPER_CHECKPOINT_BYTES) return false;
    if (fingerprintCanonicalValue(proposal.state) !== proposal.stateDigest) return false;
    const { digest, ...withoutDigest } = proposal;
    return fingerprintCanonicalValue(proposalPayload(withoutDigest)) === digest;
  } catch {
    return false;
  }
}

export function acceptCheckpointProposal(
  proposal: CheckpointProposal,
  currentAcceptedCheckpointId: string | null,
  authority: AuthorityValidationResult,
  acceptedAt: string
): CheckpointAcceptanceResult {
  if (!verifyCheckpointProposal(proposal)) {
    return { accepted: false, reasonCode: 'checkpoint_proposal_integrity_invalid' };
  }
  if (proposal.parentCheckpointId !== currentAcceptedCheckpointId
      || proposal.currentAcceptedCheckpointId !== currentAcceptedCheckpointId) {
    return { accepted: false, reasonCode: 'checkpoint_acceptance_stale_head' };
  }
  if (!authority.valid) return { accepted: false, reasonCode: 'authority_validation_failed' };
  if (authority.source !== 'external') return { accepted: false, reasonCode: 'threadkeeper_self_approval_forbidden' };
  try {
    boundedString(authority.actorRef, 'authority actor reference', 512);
    boundedString(authority.evidenceRef, 'authority evidence reference', 4096);
    if (authority.policyRef !== undefined) boundedString(authority.policyRef, 'authority policy reference', 512);
    const normalizedAcceptedAt = validTimestamp(acceptedAt, 'checkpoint acceptance timestamp');
    if (Date.parse(normalizedAcceptedAt) < Date.parse(proposal.proposedAt)) {
      return { accepted: false, reasonCode: 'checkpoint_acceptance_precedes_proposal' };
    }
    return {
      accepted: true,
      proposalId: proposal.proposalId,
      checkpointDigest: proposal.digest,
      acceptedAt: normalizedAcceptedAt,
      acceptedByRef: authority.actorRef,
      authorityEvidenceRef: authority.evidenceRef,
      ...(authority.policyRef ? { policyRef: authority.policyRef } : {}),
    };
  } catch {
    return { accepted: false, reasonCode: 'authority_evidence_invalid' };
  }
}
