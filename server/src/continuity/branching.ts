import { fingerprintCanonicalValue } from './checkpoint.js';
import {
  verifyContinuityCapsule,
  type ContinuityCapsule,
} from './capsule.js';

export const CONTINUITY_BRANCH_VERSION = 'continuity-branch-v1' as const;
export const CONTINUITY_BRANCH_CHECKPOINT_VERSION = 'continuity-branch-checkpoint-v1' as const;
export const CONTINUITY_BRANCH_OUTCOME_VERSION = 'continuity-branch-outcome-v1' as const;
export const CONTINUITY_BRANCH_COMPARISON_VERSION = 'continuity-branch-comparison-v1' as const;
export const CONTINUITY_MERGE_PROPOSAL_VERSION = 'continuity-merge-proposal-v1' as const;
export const CONTINUITY_MERGE_REVIEW_VERSION = 'continuity-merge-review-v1' as const;

const MAX_ITEMS = 256;
const MAX_REF_LENGTH = 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface ExperimentalContinuityBranch {
  version: typeof CONTINUITY_BRANCH_VERSION;
  branchId: string;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  baseContinuityDigest: string;
  baseCapsuleDigest: string;
  purposeRefs: string[];
  evidenceRefs: string[];
  authorityEvidenceRefs: string[];
  policyRefs: string[];
  createdAt: string;
  canonicalStatus: 'NON_CANONICAL';
  authorityMode: 'requires_independent_validation';
  automaticCanonicalPromotion: false;
  branchDigest: string;
}

export interface CreateExperimentalContinuityBranchInput {
  branchId: string;
  baseCapsule: ContinuityCapsule;
  purposeRefs: string[];
  evidenceRefs: string[];
  authorityEvidenceRefs: string[];
  policyRefs: string[];
  createdAt: string;
}

export interface ContinuityBranchCheckpoint {
  version: typeof CONTINUITY_BRANCH_CHECKPOINT_VERSION;
  branchId: string;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  checkpointId: string;
  parentCheckpointId: string;
  ordinal: number;
  candidateStateRefs: string[];
  observationRefs: string[];
  evidenceRefs: string[];
  createdAt: string;
  canonicalStatus: 'NON_CANONICAL';
  automaticAcceptance: false;
  branchDigest: string;
  checkpointDigest: string;
}

export interface CreateContinuityBranchCheckpointInput {
  checkpointId: string;
  parentCheckpointId: string;
  candidateStateRefs: string[];
  observationRefs: string[];
  evidenceRefs: string[];
  createdAt: string;
}

export type ContinuityBranchOutcomeStatus = 'COMPLETED' | 'INCONCLUSIVE' | 'BLOCKED';

export interface ContinuityBranchOutcome {
  version: typeof CONTINUITY_BRANCH_OUTCOME_VERSION;
  branchId: string;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  headCheckpointId: string;
  status: ContinuityBranchOutcomeStatus;
  outcomeRefs: string[];
  evidenceRefs: string[];
  unresolvedConflictRefs: string[];
  evaluatedAt: string;
  branchDigest: string;
  headCheckpointDigest: string;
  outcomeDigest: string;
}

export interface CreateContinuityBranchOutcomeInput {
  status: ContinuityBranchOutcomeStatus;
  outcomeRefs: string[];
  evidenceRefs: string[];
  unresolvedConflictRefs?: string[];
  evaluatedAt: string;
}

export interface ContinuityBranchComparisonCandidate {
  branch: ExperimentalContinuityBranch;
  checkpoints: readonly ContinuityBranchCheckpoint[];
  outcome: ContinuityBranchOutcome;
}

export interface ContinuityBranchComparisonEntry {
  branchId: string;
  headCheckpointId: string;
  headCheckpointDigest: string;
  status: ContinuityBranchOutcomeStatus;
  outcomeRefs: string[];
  evidenceRefs: string[];
  unresolvedConflictRefs: string[];
  branchDigest: string;
  outcomeDigest: string;
}

export interface ContinuityBranchComparison {
  version: typeof CONTINUITY_BRANCH_COMPARISON_VERSION;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  baseContinuityDigest: string;
  branchEntries: ContinuityBranchComparisonEntry[];
  unresolvedConflictRefs: string[];
  comparedAt: string;
  comparisonDigest: string;
}

export interface RejectedContinuityBranch {
  branchId: string;
  outcomeDigest: string;
  rejectionReasonRefs: string[];
}

export interface ContinuityMergeProposal {
  version: typeof CONTINUITY_MERGE_PROPOSAL_VERSION;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  baseContinuityDigest: string;
  selectedBranchIds: string[];
  selectedOutcomeDigests: string[];
  rejectedBranches: RejectedContinuityBranch[];
  candidateSuccessorStateRefs: string[];
  mergeEvidenceRefs: string[];
  unresolvedConflictRefs: string[];
  proposedAt: string;
  reviewStatus: 'READY_FOR_INDEPENDENT_REVIEW' | 'BLOCKED_UNRESOLVED_CONFLICT';
  authorityMode: 'requires_independent_authorization';
  automaticCanonicalAcceptance: false;
  canonicalHeadMutation: false;
  comparisonDigest: string;
  proposalDigest: string;
}

export interface CreateContinuityMergeProposalInput {
  selectedBranchIds: string[];
  rejectedBranches: Array<{ branchId: string; rejectionReasonRefs: string[] }>;
  candidateSuccessorStateRefs: string[];
  mergeEvidenceRefs: string[];
  proposedAt: string;
}

export interface ContinuityMergeReviewRequest {
  version: typeof CONTINUITY_MERGE_REVIEW_VERSION;
  scopeSemanticKey: string;
  baseCheckpointId: string;
  selectedBranchIds: string[];
  rejectedBranchIds: string[];
  comparisonDigest: string;
  proposalDigest: string;
  evidenceRefs: string[];
  requestedAt: string;
  recommendedRoute: 'REQUEST_INDEPENDENT_MERGE_REVIEW';
  authorityMode: 'requires_independent_authorization';
  automaticCanonicalAcceptance: false;
  canonicalHeadMutation: false;
  reviewRequestDigest: string;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REF_LENGTH || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function digest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) throw new Error(`Invalid ${field}`);
}

function timestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function refs(values: readonly string[], field: string, required = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS || (required && values.length === 0)) {
    throw new Error(`Invalid ${field}`);
  }
  const result = values.map((value, index) => {
    requiredText(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(result).size !== result.length) throw new Error(`Duplicate ${field}`);
  return [...result].sort();
}

function uniqueRefs(values: readonly string[], field: string, required = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS * MAX_ITEMS) throw new Error(`Invalid ${field}`);
  return refs([...new Set(values)], field, required);
}

function branchPayload(branch: ExperimentalContinuityBranch): Omit<ExperimentalContinuityBranch, 'branchDigest'> {
  const { branchDigest: _digest, ...payload } = branch;
  return payload;
}

export function createExperimentalContinuityBranch(
  input: CreateExperimentalContinuityBranchInput
): ExperimentalContinuityBranch {
  requiredText(input.branchId, 'continuity branch id');
  const createdAt = timestamp(input.createdAt, 'continuity branch creation timestamp');
  if (!verifyContinuityCapsule(input.baseCapsule, createdAt)) {
    throw new Error('Experimental branch requires a valid, unexpired continuity capsule at fork time');
  }
  const payload: Omit<ExperimentalContinuityBranch, 'branchDigest'> = {
    version: CONTINUITY_BRANCH_VERSION,
    branchId: input.branchId,
    scopeSemanticKey: input.baseCapsule.scopeSemanticKey,
    baseCheckpointId: input.baseCapsule.currentCheckpoint.checkpointId,
    baseContinuityDigest: input.baseCapsule.continuityDigest,
    baseCapsuleDigest: input.baseCapsule.capsuleDigest,
    purposeRefs: refs(input.purposeRefs, 'branch purpose references', true),
    evidenceRefs: refs(input.evidenceRefs, 'branch evidence references', true),
    authorityEvidenceRefs: refs(input.authorityEvidenceRefs, 'branch authority evidence references', true),
    policyRefs: refs(input.policyRefs, 'branch policy references', true),
    createdAt,
    canonicalStatus: 'NON_CANONICAL',
    authorityMode: 'requires_independent_validation',
    automaticCanonicalPromotion: false,
  };
  return Object.freeze({ ...payload, branchDigest: fingerprintCanonicalValue(payload) });
}

export function verifyExperimentalContinuityBranch(branch: ExperimentalContinuityBranch): boolean {
  try {
    if (!branch || branch.version !== CONTINUITY_BRANCH_VERSION
        || branch.canonicalStatus !== 'NON_CANONICAL'
        || branch.authorityMode !== 'requires_independent_validation'
        || branch.automaticCanonicalPromotion !== false) return false;
    requiredText(branch.branchId, 'continuity branch id');
    requiredText(branch.scopeSemanticKey, 'continuity branch scope');
    requiredText(branch.baseCheckpointId, 'continuity branch base checkpoint');
    digest(branch.baseContinuityDigest, 'continuity branch base digest');
    digest(branch.baseCapsuleDigest, 'continuity branch base capsule digest');
    digest(branch.branchDigest, 'continuity branch digest');
    refs(branch.purposeRefs, 'branch purpose references', true);
    refs(branch.evidenceRefs, 'branch evidence references', true);
    refs(branch.authorityEvidenceRefs, 'branch authority evidence references', true);
    refs(branch.policyRefs, 'branch policy references', true);
    timestamp(branch.createdAt, 'continuity branch creation timestamp');
    return fingerprintCanonicalValue(branchPayload(branch)) === branch.branchDigest;
  } catch {
    return false;
  }
}

function checkpointPayload(
  checkpoint: ContinuityBranchCheckpoint
): Omit<ContinuityBranchCheckpoint, 'checkpointDigest'> {
  const { checkpointDigest: _digest, ...payload } = checkpoint;
  return payload;
}

export function verifyContinuityBranchCheckpoint(checkpoint: ContinuityBranchCheckpoint): boolean {
  try {
    if (!checkpoint || checkpoint.version !== CONTINUITY_BRANCH_CHECKPOINT_VERSION
        || checkpoint.canonicalStatus !== 'NON_CANONICAL'
        || checkpoint.automaticAcceptance !== false
        || !Number.isSafeInteger(checkpoint.ordinal) || checkpoint.ordinal <= 0) return false;
    requiredText(checkpoint.branchId, 'branch checkpoint branch id');
    requiredText(checkpoint.scopeSemanticKey, 'branch checkpoint scope');
    requiredText(checkpoint.baseCheckpointId, 'branch checkpoint base checkpoint');
    requiredText(checkpoint.checkpointId, 'branch checkpoint id');
    requiredText(checkpoint.parentCheckpointId, 'branch checkpoint parent');
    digest(checkpoint.branchDigest, 'branch checkpoint branch digest');
    digest(checkpoint.checkpointDigest, 'branch checkpoint digest');
    refs(checkpoint.candidateStateRefs, 'branch candidate state references', true);
    refs(checkpoint.observationRefs, 'branch observation references');
    refs(checkpoint.evidenceRefs, 'branch checkpoint evidence references', true);
    timestamp(checkpoint.createdAt, 'branch checkpoint creation timestamp');
    return fingerprintCanonicalValue(checkpointPayload(checkpoint)) === checkpoint.checkpointDigest;
  } catch {
    return false;
  }
}

export function verifyContinuityBranchChain(
  branch: ExperimentalContinuityBranch,
  checkpoints: readonly ContinuityBranchCheckpoint[]
): boolean {
  if (!verifyExperimentalContinuityBranch(branch) || !Array.isArray(checkpoints) || checkpoints.length > MAX_ITEMS) return false;
  const ids = new Set<string>();
  let priorId = branch.baseCheckpointId;
  let priorTime = Date.parse(branch.createdAt);
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    if (!verifyContinuityBranchCheckpoint(checkpoint)
        || checkpoint.branchId !== branch.branchId
        || checkpoint.scopeSemanticKey !== branch.scopeSemanticKey
        || checkpoint.baseCheckpointId !== branch.baseCheckpointId
        || checkpoint.branchDigest !== branch.branchDigest
        || checkpoint.ordinal !== index + 1
        || checkpoint.parentCheckpointId !== priorId
        || checkpoint.checkpointId === branch.baseCheckpointId
        || ids.has(checkpoint.checkpointId)
        || Date.parse(checkpoint.createdAt) < priorTime) return false;
    ids.add(checkpoint.checkpointId);
    priorId = checkpoint.checkpointId;
    priorTime = Date.parse(checkpoint.createdAt);
  }
  return true;
}

export function createContinuityBranchCheckpoint(
  branch: ExperimentalContinuityBranch,
  existing: readonly ContinuityBranchCheckpoint[],
  input: CreateContinuityBranchCheckpointInput
): ContinuityBranchCheckpoint {
  if (!verifyContinuityBranchChain(branch, existing)) throw new Error('Invalid experimental branch or branch checkpoint lineage');
  requiredText(input.checkpointId, 'branch checkpoint id');
  requiredText(input.parentCheckpointId, 'branch checkpoint parent');
  if (input.checkpointId === branch.baseCheckpointId
      || existing.some(item => item.checkpointId === input.checkpointId)) {
    throw new Error('Branch checkpoint identity collides with existing lineage');
  }
  const expectedParent = existing.at(-1)?.checkpointId ?? branch.baseCheckpointId;
  if (input.parentCheckpointId !== expectedParent) {
    throw new Error('Branch checkpoint must extend the current branch-local head');
  }
  const createdAt = timestamp(input.createdAt, 'branch checkpoint creation timestamp');
  const priorTime = existing.at(-1)?.createdAt ?? branch.createdAt;
  if (Date.parse(createdAt) < Date.parse(priorTime)) throw new Error('Branch checkpoint time regresses');
  const payload: Omit<ContinuityBranchCheckpoint, 'checkpointDigest'> = {
    version: CONTINUITY_BRANCH_CHECKPOINT_VERSION,
    branchId: branch.branchId,
    scopeSemanticKey: branch.scopeSemanticKey,
    baseCheckpointId: branch.baseCheckpointId,
    checkpointId: input.checkpointId,
    parentCheckpointId: input.parentCheckpointId,
    ordinal: existing.length + 1,
    candidateStateRefs: refs(input.candidateStateRefs, 'branch candidate state references', true),
    observationRefs: refs(input.observationRefs, 'branch observation references'),
    evidenceRefs: refs(input.evidenceRefs, 'branch checkpoint evidence references', true),
    createdAt,
    canonicalStatus: 'NON_CANONICAL',
    automaticAcceptance: false,
    branchDigest: branch.branchDigest,
  };
  return Object.freeze({ ...payload, checkpointDigest: fingerprintCanonicalValue(payload) });
}

function outcomePayload(outcome: ContinuityBranchOutcome): Omit<ContinuityBranchOutcome, 'outcomeDigest'> {
  const { outcomeDigest: _digest, ...payload } = outcome;
  return payload;
}

export function verifyContinuityBranchOutcome(outcome: ContinuityBranchOutcome): boolean {
  try {
    if (!outcome || outcome.version !== CONTINUITY_BRANCH_OUTCOME_VERSION
        || !['COMPLETED', 'INCONCLUSIVE', 'BLOCKED'].includes(outcome.status)) return false;
    requiredText(outcome.branchId, 'branch outcome branch id');
    requiredText(outcome.scopeSemanticKey, 'branch outcome scope');
    requiredText(outcome.baseCheckpointId, 'branch outcome base checkpoint');
    requiredText(outcome.headCheckpointId, 'branch outcome head checkpoint');
    digest(outcome.branchDigest, 'branch outcome branch digest');
    digest(outcome.headCheckpointDigest, 'branch outcome head checkpoint digest');
    digest(outcome.outcomeDigest, 'branch outcome digest');
    refs(outcome.outcomeRefs, 'branch outcome references', true);
    refs(outcome.evidenceRefs, 'branch outcome evidence references', true);
    refs(outcome.unresolvedConflictRefs, 'branch unresolved conflict references');
    timestamp(outcome.evaluatedAt, 'branch outcome evaluation timestamp');
    return fingerprintCanonicalValue(outcomePayload(outcome)) === outcome.outcomeDigest;
  } catch {
    return false;
  }
}

export function createContinuityBranchOutcome(
  branch: ExperimentalContinuityBranch,
  checkpoints: readonly ContinuityBranchCheckpoint[],
  input: CreateContinuityBranchOutcomeInput
): ContinuityBranchOutcome {
  if (!verifyContinuityBranchChain(branch, checkpoints) || checkpoints.length === 0) {
    throw new Error('Branch outcome requires a valid non-empty branch checkpoint lineage');
  }
  if (!['COMPLETED', 'INCONCLUSIVE', 'BLOCKED'].includes(input.status)) throw new Error('Invalid branch outcome status');
  const head = checkpoints.at(-1)!;
  const evaluatedAt = timestamp(input.evaluatedAt, 'branch outcome evaluation timestamp');
  if (Date.parse(evaluatedAt) < Date.parse(head.createdAt)) throw new Error('Branch outcome predates its branch head');
  const payload: Omit<ContinuityBranchOutcome, 'outcomeDigest'> = {
    version: CONTINUITY_BRANCH_OUTCOME_VERSION,
    branchId: branch.branchId,
    scopeSemanticKey: branch.scopeSemanticKey,
    baseCheckpointId: branch.baseCheckpointId,
    headCheckpointId: head.checkpointId,
    status: input.status,
    outcomeRefs: refs(input.outcomeRefs, 'branch outcome references', true),
    evidenceRefs: refs(input.evidenceRefs, 'branch outcome evidence references', true),
    unresolvedConflictRefs: refs(input.unresolvedConflictRefs ?? [], 'branch unresolved conflict references'),
    evaluatedAt,
    branchDigest: branch.branchDigest,
    headCheckpointDigest: head.checkpointDigest,
  };
  return Object.freeze({ ...payload, outcomeDigest: fingerprintCanonicalValue(payload) });
}

function comparisonPayload(
  comparison: ContinuityBranchComparison
): Omit<ContinuityBranchComparison, 'comparisonDigest'> {
  const { comparisonDigest: _digest, ...payload } = comparison;
  return payload;
}

function verifyComparisonEntry(entry: ContinuityBranchComparisonEntry): boolean {
  try {
    requiredText(entry.branchId, 'comparison branch id');
    requiredText(entry.headCheckpointId, 'comparison head checkpoint id');
    digest(entry.headCheckpointDigest, 'comparison head checkpoint digest');
    digest(entry.branchDigest, 'comparison branch digest');
    digest(entry.outcomeDigest, 'comparison outcome digest');
    if (!['COMPLETED', 'INCONCLUSIVE', 'BLOCKED'].includes(entry.status)) return false;
    refs(entry.outcomeRefs, 'comparison outcome references', true);
    refs(entry.evidenceRefs, 'comparison evidence references', true);
    refs(entry.unresolvedConflictRefs, 'comparison unresolved conflict references');
    return true;
  } catch {
    return false;
  }
}

export function verifyContinuityBranchComparison(comparison: ContinuityBranchComparison): boolean {
  try {
    if (!comparison || comparison.version !== CONTINUITY_BRANCH_COMPARISON_VERSION
        || !Array.isArray(comparison.branchEntries)
        || comparison.branchEntries.length < 2 || comparison.branchEntries.length > MAX_ITEMS) return false;
    requiredText(comparison.scopeSemanticKey, 'branch comparison scope');
    requiredText(comparison.baseCheckpointId, 'branch comparison base checkpoint');
    digest(comparison.baseContinuityDigest, 'branch comparison base continuity digest');
    digest(comparison.comparisonDigest, 'branch comparison digest');
    refs(comparison.unresolvedConflictRefs, 'comparison unresolved conflict references');
    timestamp(comparison.comparedAt, 'branch comparison timestamp');
    if (comparison.branchEntries.some(entry => !verifyComparisonEntry(entry))) return false;
    const branchIds = comparison.branchEntries.map(entry => entry.branchId);
    if (new Set(branchIds).size !== branchIds.length) return false;
    if (![...branchIds].sort().every((id, index) => id === branchIds[index])) return false;
    return fingerprintCanonicalValue(comparisonPayload(comparison)) === comparison.comparisonDigest;
  } catch {
    return false;
  }
}

export function compareContinuityBranches(
  candidates: readonly ContinuityBranchComparisonCandidate[],
  comparedAt: string
): ContinuityBranchComparison {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > MAX_ITEMS) {
    throw new Error('Branch comparison requires at least two branch candidates');
  }
  const branchIds = new Set<string>();
  const entries: ContinuityBranchComparisonEntry[] = [];
  const first = candidates[0]?.branch;
  if (!first || !verifyExperimentalContinuityBranch(first)) throw new Error('Invalid experimental branch');

  for (const candidate of candidates) {
    const { branch, checkpoints, outcome } = candidate;
    if (!verifyExperimentalContinuityBranch(branch) || branchIds.has(branch.branchId)) {
      throw new Error('Invalid or duplicate experimental branch');
    }
    branchIds.add(branch.branchId);
    if (branch.scopeSemanticKey !== first.scopeSemanticKey
        || branch.baseCheckpointId !== first.baseCheckpointId
        || branch.baseContinuityDigest !== first.baseContinuityDigest
        || branch.baseCapsuleDigest !== first.baseCapsuleDigest) {
      throw new Error('Compared branches must share the same governed continuity base');
    }
    if (!verifyContinuityBranchChain(branch, checkpoints) || checkpoints.length === 0) {
      throw new Error('Branch comparison requires a valid non-empty branch checkpoint lineage');
    }
    const head = checkpoints.at(-1)!;
    if (!verifyContinuityBranchOutcome(outcome)
        || outcome.scopeSemanticKey !== branch.scopeSemanticKey
        || outcome.baseCheckpointId !== branch.baseCheckpointId
        || outcome.branchDigest !== branch.branchDigest
        || outcome.headCheckpointId !== head.checkpointId
        || outcome.headCheckpointDigest !== head.checkpointDigest) {
      throw new Error('Branch outcome does not bind to the verified branch-local head');
    }
    if (Date.parse(outcome.evaluatedAt) < Date.parse(head.createdAt)) {
      throw new Error('Branch outcome predates its verified branch-local head');
    }
    entries.push({
      branchId: branch.branchId,
      headCheckpointId: head.checkpointId,
      headCheckpointDigest: head.checkpointDigest,
      status: outcome.status,
      outcomeRefs: [...outcome.outcomeRefs],
      evidenceRefs: [...outcome.evidenceRefs],
      unresolvedConflictRefs: [...outcome.unresolvedConflictRefs],
      branchDigest: branch.branchDigest,
      outcomeDigest: outcome.outcomeDigest,
    });
  }

  entries.sort((a, b) => a.branchId.localeCompare(b.branchId));
  const normalizedComparedAt = timestamp(comparedAt, 'branch comparison timestamp');
  for (const candidate of candidates) {
    if (Date.parse(candidate.outcome.evaluatedAt) > Date.parse(normalizedComparedAt)) {
      throw new Error('Branch comparison predates a branch outcome');
    }
  }
  const payload: Omit<ContinuityBranchComparison, 'comparisonDigest'> = {
    version: CONTINUITY_BRANCH_COMPARISON_VERSION,
    scopeSemanticKey: first.scopeSemanticKey,
    baseCheckpointId: first.baseCheckpointId,
    baseContinuityDigest: first.baseContinuityDigest,
    branchEntries: entries,
    unresolvedConflictRefs: uniqueRefs(
      entries.flatMap(entry => entry.unresolvedConflictRefs),
      'comparison unresolved conflict references'
    ),
    comparedAt: normalizedComparedAt,
  };
  return Object.freeze({ ...payload, comparisonDigest: fingerprintCanonicalValue(payload) });
}

function mergeProposalPayload(
  proposal: ContinuityMergeProposal
): Omit<ContinuityMergeProposal, 'proposalDigest'> {
  const { proposalDigest: _digest, ...payload } = proposal;
  return payload;
}

export function verifyContinuityMergeProposal(proposal: ContinuityMergeProposal): boolean {
  try {
    if (!proposal || proposal.version !== CONTINUITY_MERGE_PROPOSAL_VERSION
        || proposal.authorityMode !== 'requires_independent_authorization'
        || proposal.automaticCanonicalAcceptance !== false
        || proposal.canonicalHeadMutation !== false
        || (proposal.reviewStatus !== 'READY_FOR_INDEPENDENT_REVIEW'
          && proposal.reviewStatus !== 'BLOCKED_UNRESOLVED_CONFLICT')) return false;
    requiredText(proposal.scopeSemanticKey, 'merge proposal scope');
    requiredText(proposal.baseCheckpointId, 'merge proposal base checkpoint');
    digest(proposal.baseContinuityDigest, 'merge proposal base continuity digest');
    digest(proposal.comparisonDigest, 'merge proposal comparison digest');
    digest(proposal.proposalDigest, 'merge proposal digest');
    const selected = refs(proposal.selectedBranchIds, 'selected branch ids', true);
    const selectedDigests = refs(proposal.selectedOutcomeDigests, 'selected outcome digests', true);
    if (selected.length !== selectedDigests.length) return false;
    if (!Array.isArray(proposal.rejectedBranches) || proposal.rejectedBranches.length > MAX_ITEMS) return false;
    const rejectedIds = new Set<string>();
    for (const rejected of proposal.rejectedBranches) {
      requiredText(rejected.branchId, 'rejected branch id');
      digest(rejected.outcomeDigest, 'rejected branch outcome digest');
      refs(rejected.rejectionReasonRefs, 'rejected branch reason references', true);
      if (rejectedIds.has(rejected.branchId) || selected.includes(rejected.branchId)) return false;
      rejectedIds.add(rejected.branchId);
    }
    refs(proposal.candidateSuccessorStateRefs, 'candidate successor state references', true);
    refs(proposal.mergeEvidenceRefs, 'merge evidence references', true);
    refs(proposal.unresolvedConflictRefs, 'merge unresolved conflict references');
    timestamp(proposal.proposedAt, 'merge proposal timestamp');
    if (proposal.reviewStatus === 'READY_FOR_INDEPENDENT_REVIEW' && proposal.unresolvedConflictRefs.length > 0) return false;
    if (proposal.reviewStatus === 'BLOCKED_UNRESOLVED_CONFLICT' && proposal.unresolvedConflictRefs.length === 0) return false;
    return fingerprintCanonicalValue(mergeProposalPayload(proposal)) === proposal.proposalDigest;
  } catch {
    return false;
  }
}

export function createContinuityMergeProposal(
  comparison: ContinuityBranchComparison,
  input: CreateContinuityMergeProposalInput
): ContinuityMergeProposal {
  if (!verifyContinuityBranchComparison(comparison)) throw new Error('Invalid branch comparison');
  const selectedBranchIds = refs(input.selectedBranchIds, 'selected branch ids', true);
  const selectedSet = new Set(selectedBranchIds);
  const known = new Map(comparison.branchEntries.map(entry => [entry.branchId, entry]));
  for (const branchId of selectedBranchIds) {
    const entry = known.get(branchId);
    if (!entry) throw new Error('Merge selects an unknown branch');
    if (entry.status !== 'COMPLETED') throw new Error('Only completed branch outcomes may be selected for merge');
  }
  if (!Array.isArray(input.rejectedBranches) || input.rejectedBranches.length > MAX_ITEMS) {
    throw new Error('Invalid rejected branch set');
  }
  const rejected: RejectedContinuityBranch[] = input.rejectedBranches.map(item => {
    requiredText(item.branchId, 'rejected branch id');
    if (selectedSet.has(item.branchId)) throw new Error('A branch cannot be both selected and rejected');
    const entry = known.get(item.branchId);
    if (!entry) throw new Error('Merge rejects an unknown branch');
    return {
      branchId: item.branchId,
      outcomeDigest: entry.outcomeDigest,
      rejectionReasonRefs: refs(item.rejectionReasonRefs, 'rejected branch reason references', true),
    };
  }).sort((a, b) => a.branchId.localeCompare(b.branchId));
  if (new Set(rejected.map(item => item.branchId)).size !== rejected.length) throw new Error('Duplicate rejected branch');
  const accounted = new Set([...selectedBranchIds, ...rejected.map(item => item.branchId)]);
  if (accounted.size !== comparison.branchEntries.length
      || comparison.branchEntries.some(entry => !accounted.has(entry.branchId))) {
    throw new Error('Every compared branch must be explicitly selected or rejected');
  }
  const unresolvedConflictRefs = uniqueRefs(
    comparison.branchEntries
      .filter(entry => selectedSet.has(entry.branchId))
      .flatMap(entry => entry.unresolvedConflictRefs),
    'merge unresolved conflict references'
  );
  const proposedAt = timestamp(input.proposedAt, 'merge proposal timestamp');
  if (Date.parse(proposedAt) < Date.parse(comparison.comparedAt)) {
    throw new Error('Merge proposal predates branch comparison');
  }
  const selectedOutcomeDigests = refs(
    selectedBranchIds.map(branchId => known.get(branchId)!.outcomeDigest),
    'selected outcome digests',
    true
  );
  const payload: Omit<ContinuityMergeProposal, 'proposalDigest'> = {
    version: CONTINUITY_MERGE_PROPOSAL_VERSION,
    scopeSemanticKey: comparison.scopeSemanticKey,
    baseCheckpointId: comparison.baseCheckpointId,
    baseContinuityDigest: comparison.baseContinuityDigest,
    selectedBranchIds,
    selectedOutcomeDigests,
    rejectedBranches: rejected,
    candidateSuccessorStateRefs: refs(input.candidateSuccessorStateRefs, 'candidate successor state references', true),
    mergeEvidenceRefs: refs(input.mergeEvidenceRefs, 'merge evidence references', true),
    unresolvedConflictRefs,
    proposedAt,
    reviewStatus: unresolvedConflictRefs.length > 0 ? 'BLOCKED_UNRESOLVED_CONFLICT' : 'READY_FOR_INDEPENDENT_REVIEW',
    authorityMode: 'requires_independent_authorization',
    automaticCanonicalAcceptance: false,
    canonicalHeadMutation: false,
    comparisonDigest: comparison.comparisonDigest,
  };
  return Object.freeze({ ...payload, proposalDigest: fingerprintCanonicalValue(payload) });
}

function reviewPayload(
  review: ContinuityMergeReviewRequest
): Omit<ContinuityMergeReviewRequest, 'reviewRequestDigest'> {
  const { reviewRequestDigest: _digest, ...payload } = review;
  return payload;
}

export function verifyContinuityMergeReviewRequest(review: ContinuityMergeReviewRequest): boolean {
  try {
    if (!review || review.version !== CONTINUITY_MERGE_REVIEW_VERSION
        || review.recommendedRoute !== 'REQUEST_INDEPENDENT_MERGE_REVIEW'
        || review.authorityMode !== 'requires_independent_authorization'
        || review.automaticCanonicalAcceptance !== false
        || review.canonicalHeadMutation !== false) return false;
    requiredText(review.scopeSemanticKey, 'merge review scope');
    requiredText(review.baseCheckpointId, 'merge review base checkpoint');
    refs(review.selectedBranchIds, 'merge review selected branch ids', true);
    refs(review.rejectedBranchIds, 'merge review rejected branch ids');
    digest(review.comparisonDigest, 'merge review comparison digest');
    digest(review.proposalDigest, 'merge review proposal digest');
    digest(review.reviewRequestDigest, 'merge review request digest');
    refs(review.evidenceRefs, 'merge review evidence references', true);
    timestamp(review.requestedAt, 'merge review request timestamp');
    return fingerprintCanonicalValue(reviewPayload(review)) === review.reviewRequestDigest;
  } catch {
    return false;
  }
}

export function createContinuityMergeReviewRequest(
  comparison: ContinuityBranchComparison,
  proposal: ContinuityMergeProposal,
  requestedAt: string
): ContinuityMergeReviewRequest {
  if (!verifyContinuityBranchComparison(comparison) || !verifyContinuityMergeProposal(proposal)) {
    throw new Error('Invalid branch comparison or merge proposal');
  }
  if (proposal.comparisonDigest !== comparison.comparisonDigest
      || proposal.scopeSemanticKey !== comparison.scopeSemanticKey
      || proposal.baseCheckpointId !== comparison.baseCheckpointId) {
    throw new Error('Merge proposal does not belong to this branch comparison');
  }
  if (proposal.reviewStatus !== 'READY_FOR_INDEPENDENT_REVIEW' || proposal.unresolvedConflictRefs.length > 0) {
    throw new Error('Unresolved branch conflicts block independent merge review');
  }
  const normalizedRequestedAt = timestamp(requestedAt, 'merge review request timestamp');
  if (Date.parse(normalizedRequestedAt) < Date.parse(proposal.proposedAt)) {
    throw new Error('Merge review request predates proposal');
  }
  const rejectedBranchIds = proposal.rejectedBranches.map(item => item.branchId).sort();
  const payload: Omit<ContinuityMergeReviewRequest, 'reviewRequestDigest'> = {
    version: CONTINUITY_MERGE_REVIEW_VERSION,
    scopeSemanticKey: proposal.scopeSemanticKey,
    baseCheckpointId: proposal.baseCheckpointId,
    selectedBranchIds: [...proposal.selectedBranchIds],
    rejectedBranchIds,
    comparisonDigest: comparison.comparisonDigest,
    proposalDigest: proposal.proposalDigest,
    evidenceRefs: uniqueRefs([
      ...proposal.mergeEvidenceRefs,
      ...comparison.branchEntries.flatMap(entry => entry.evidenceRefs),
    ], 'merge review evidence references', true),
    requestedAt: normalizedRequestedAt,
    recommendedRoute: 'REQUEST_INDEPENDENT_MERGE_REVIEW',
    authorityMode: 'requires_independent_authorization',
    automaticCanonicalAcceptance: false,
    canonicalHeadMutation: false,
  };
  return Object.freeze({ ...payload, reviewRequestDigest: fingerprintCanonicalValue(payload) });
}
