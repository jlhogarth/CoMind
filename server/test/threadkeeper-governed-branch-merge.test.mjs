import test from 'node:test';
import assert from 'node:assert/strict';

import { createContinuityCapsule } from '../dist/continuity/capsule.js';
import { fingerprintCanonicalValue } from '../dist/continuity/checkpoint.js';
import {
  compareContinuityBranches,
  createContinuityBranchCheckpoint,
  createContinuityBranchOutcome,
  createContinuityMergeProposal,
  createContinuityMergeReviewRequest,
  createExperimentalContinuityBranch,
  verifyContinuityBranchChain,
  verifyContinuityBranchComparison,
  verifyContinuityMergeProposal,
} from '../dist/continuity/branching.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function handoff(overrides = {}) {
  const base = {
    version: 'continuity-handoff-v1',
    scopeSemanticKey: 'architecture:comind:branch-merge-proof',
    currentCheckpoint: {
      checkpointId: 'checkpoint:canonical:1',
      parentCheckpointId: null,
      persistenceSeq: '1',
      acceptedAt: '2026-10-29T18:00:00.000Z',
      acceptedByRef: 'actor:founder',
      authorityEvidenceRef: 'authority:founder:tk012',
      policyRef: 'policy:threadkeeper:branching',
      stateDigest: A,
      proposalDigest: B,
    },
    lineage: { checkpointIds: ['checkpoint:canonical:1'], depth: 1 },
    unresolvedCases: [],
    consumer: {
      consumerRef: 'consumer:tk012:test',
      providerRef: null,
      actorRef: 'actor:tk012:test',
      authorityMode: 'requires_independent_validation',
      resolvedAt: '2026-10-29T18:01:00.000Z',
    },
  };
  const merged = { ...base, ...overrides };
  const canonical = {
    version: merged.version,
    scopeSemanticKey: merged.scopeSemanticKey,
    currentCheckpoint: merged.currentCheckpoint,
    lineage: merged.lineage,
    unresolvedCases: merged.unresolvedCases,
  };
  return { ...merged, continuityDigest: fingerprintCanonicalValue(canonical) };
}

function capsule(overrides = {}) {
  const source = handoff(overrides.handoff);
  return createContinuityCapsule({
    handoff: source,
    references: {
      objectiveRefs: ['objective:explore-without-overwrite'],
      decisionRefs: ['decision:canonical-baseline'],
      assumptionRefs: ['assumption:experimental-branches-are-noncanonical'],
      obligationRefs: ['obligation:independent-merge-review'],
      prohibitedActionRefs: ['prohibition:no-silent-canonical-promotion'],
      openQuestionRefs: ['question:which-experiment-best-supported'],
      evidenceRefs: ['evidence:canonical-baseline'],
    },
    authorityEvidenceRefs: ['authority:tk012:consumer-independent-validation'],
    policyRefs: ['policy:tk012:experimental-branching'],
    sensitivity: 'internal',
    retentionClass: 'durable',
    issuedAt: '2026-10-29T18:02:00.000Z',
    expiresAt: '2026-10-30T18:02:00.000Z',
  });
}

function branch(id, overrides = {}) {
  return createExperimentalContinuityBranch({
    branchId: id,
    baseCapsule: overrides.baseCapsule ?? capsule(),
    purposeRefs: overrides.purposeRefs ?? [`purpose:${id}`],
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${id}:fork`],
    authorityEvidenceRefs: overrides.authorityEvidenceRefs ?? ['authority:founder:tk012'],
    policyRefs: overrides.policyRefs ?? ['policy:threadkeeper:branching'],
    createdAt: overrides.createdAt ?? '2026-10-29T18:03:00.000Z',
  });
}

function checkpoint(branchValue, existing, id, overrides = {}) {
  return createContinuityBranchCheckpoint(branchValue, existing, {
    checkpointId: id,
    parentCheckpointId: overrides.parentCheckpointId ?? existing.at(-1)?.checkpointId ?? branchValue.baseCheckpointId,
    candidateStateRefs: overrides.candidateStateRefs ?? [`candidate-state:${id}`],
    observationRefs: overrides.observationRefs ?? [`observation:${id}`],
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${id}`],
    createdAt: overrides.createdAt ?? `2026-10-29T18:0${4 + existing.length}:00.000Z`,
  });
}

function outcome(branchValue, chain, overrides = {}) {
  return createContinuityBranchOutcome(branchValue, chain, {
    status: overrides.status ?? 'COMPLETED',
    outcomeRefs: overrides.outcomeRefs ?? [`outcome:${branchValue.branchId}`],
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${branchValue.branchId}:outcome`],
    unresolvedConflictRefs: overrides.unresolvedConflictRefs ?? [],
    evaluatedAt: overrides.evaluatedAt ?? '2026-10-29T18:10:00.000Z',
  });
}

function twoBranches() {
  const a = branch('branch:architecture:a');
  const b = branch('branch:architecture:b');
  const a1 = checkpoint(a, [], 'branch-checkpoint:a:1');
  const a2 = checkpoint(a, [a1], 'branch-checkpoint:a:2');
  const b1 = checkpoint(b, [], 'branch-checkpoint:b:1');
  return {
    a, b,
    aChain: [a1, a2],
    bChain: [b1],
    aOutcome: outcome(a, [a1, a2]),
    bOutcome: outcome(b, [b1]),
  };
}

test('TK-012 forks a valid accepted capsule into explicitly non-canonical branches', () => {
  const a = branch('branch:architecture:a');
  const b = branch('branch:architecture:b');
  assert.equal(a.baseCheckpointId, 'checkpoint:canonical:1');
  assert.equal(a.baseContinuityDigest, b.baseContinuityDigest);
  assert.equal(a.baseCapsuleDigest, b.baseCapsuleDigest);
  assert.equal(a.canonicalStatus, 'NON_CANONICAL');
  assert.equal(a.authorityMode, 'requires_independent_validation');
  assert.equal(a.automaticCanonicalPromotion, false);
  assert.notEqual(a.branchDigest, b.branchDigest);
});

test('TK-012 refuses forks from expired or tampered continuity capsules', () => {
  assert.throws(() => branch('branch:expired', {
    createdAt: '2026-10-31T00:00:00.000Z',
  }), /valid, unexpired continuity capsule/i);

  const tampered = structuredClone(capsule());
  tampered.currentCheckpoint.checkpointId = 'checkpoint:attacker';
  assert.throws(() => branch('branch:tampered', { baseCapsule: tampered }), /valid, unexpired continuity capsule/i);
});

test('TK-012 branch-local checkpoints form a strict append-only candidate lineage', () => {
  const a = branch('branch:architecture:a');
  const a1 = checkpoint(a, [], 'branch-checkpoint:a:1');
  const a2 = checkpoint(a, [a1], 'branch-checkpoint:a:2');
  assert.equal(a1.parentCheckpointId, a.baseCheckpointId);
  assert.equal(a1.ordinal, 1);
  assert.equal(a2.parentCheckpointId, a1.checkpointId);
  assert.equal(a2.ordinal, 2);
  assert.equal(a2.canonicalStatus, 'NON_CANONICAL');
  assert.equal(a2.automaticAcceptance, false);
  assert.equal(verifyContinuityBranchChain(a, [a1, a2]), true);

  assert.throws(() => checkpoint(a, [a1], 'branch-checkpoint:a:bad', {
    parentCheckpointId: a.baseCheckpointId,
  }), /current branch-local head/);

  const b = branch('branch:architecture:b');
  const b1 = checkpoint(b, [], 'branch-checkpoint:b:1');
  assert.equal(verifyContinuityBranchChain(a, [a1, b1]), false);
});

test('TK-012 compares only branches descended from the same governed base', () => {
  const fixture = twoBranches();
  const comparison = compareContinuityBranches(
    [fixture.b, fixture.a],
    [fixture.aOutcome, fixture.bOutcome],
    '2026-10-29T18:11:00.000Z'
  );
  assert.equal(verifyContinuityBranchComparison(comparison), true);
  assert.deepEqual(comparison.branchEntries.map(entry => entry.branchId), [
    'branch:architecture:a',
    'branch:architecture:b',
  ]);
  assert.equal(comparison.baseCheckpointId, 'checkpoint:canonical:1');

  const otherBase = capsule({
    handoff: {
      scopeSemanticKey: 'architecture:other-scope',
      currentCheckpoint: {
        ...handoff().currentCheckpoint,
        checkpointId: 'checkpoint:canonical:other',
      },
      lineage: { checkpointIds: ['checkpoint:canonical:other'], depth: 1 },
    },
  });
  const c = branch('branch:other:c', { baseCapsule: otherBase });
  const c1 = checkpoint(c, [], 'branch-checkpoint:c:1');
  const cOutcome = outcome(c, [c1]);
  assert.throws(() => compareContinuityBranches(
    [fixture.a, c],
    [fixture.aOutcome, cOutcome],
    '2026-10-29T18:11:00.000Z'
  ), /same governed continuity base/);
});

test('TK-012 merge proposal must account for every branch and preserves rejected alternatives', () => {
  const fixture = twoBranches();
  const comparison = compareContinuityBranches(
    [fixture.a, fixture.b],
    [fixture.aOutcome, fixture.bOutcome],
    '2026-10-29T18:11:00.000Z'
  );

  assert.throws(() => createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a'],
    rejectedBranches: [],
    candidateSuccessorStateRefs: ['candidate-successor:ab'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  }), /Every compared branch/);

  const proposal = createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a'],
    rejectedBranches: [{
      branchId: 'branch:architecture:b',
      rejectionReasonRefs: ['reason:b-inferior-evidence'],
    }],
    candidateSuccessorStateRefs: ['candidate-successor:a'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  });

  assert.equal(verifyContinuityMergeProposal(proposal), true);
  assert.equal(proposal.reviewStatus, 'READY_FOR_INDEPENDENT_REVIEW');
  assert.equal(proposal.automaticCanonicalAcceptance, false);
  assert.equal(proposal.canonicalHeadMutation, false);
  assert.equal(proposal.rejectedBranches[0].branchId, 'branch:architecture:b');
  assert.equal(proposal.rejectedBranches[0].outcomeDigest, fixture.bOutcome.outcomeDigest);
  assert.deepEqual(proposal.rejectedBranches[0].rejectionReasonRefs, ['reason:b-inferior-evidence']);
});

test('TK-012 unresolved conflicts remain explicit and block merge review', () => {
  const fixture = twoBranches();
  const conflictingB = outcome(fixture.b, fixture.bChain, {
    unresolvedConflictRefs: ['conflict:a-vs-b:authority-model'],
  });
  const comparison = compareContinuityBranches(
    [fixture.a, fixture.b],
    [fixture.aOutcome, conflictingB],
    '2026-10-29T18:11:00.000Z'
  );
  const proposal = createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a', 'branch:architecture:b'],
    rejectedBranches: [],
    candidateSuccessorStateRefs: ['candidate-successor:combined'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  });
  assert.equal(proposal.reviewStatus, 'BLOCKED_UNRESOLVED_CONFLICT');
  assert.deepEqual(proposal.unresolvedConflictRefs, ['conflict:a-vs-b:authority-model']);
  assert.throws(() => createContinuityMergeReviewRequest(
    comparison,
    proposal,
    '2026-10-29T18:13:00.000Z'
  ), /Unresolved branch conflicts block/);
});

test('TK-012 non-completed branches cannot be selected but can be explicitly rejected', () => {
  const fixture = twoBranches();
  const blockedB = outcome(fixture.b, fixture.bChain, { status: 'BLOCKED' });
  const comparison = compareContinuityBranches(
    [fixture.a, fixture.b],
    [fixture.aOutcome, blockedB],
    '2026-10-29T18:11:00.000Z'
  );
  assert.throws(() => createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:b'],
    rejectedBranches: [{ branchId: 'branch:architecture:a', rejectionReasonRefs: ['reason:not-selected'] }],
    candidateSuccessorStateRefs: ['candidate-successor:b'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  }), /Only completed branch outcomes/);

  const proposal = createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a'],
    rejectedBranches: [{ branchId: 'branch:architecture:b', rejectionReasonRefs: ['reason:branch-blocked'] }],
    candidateSuccessorStateRefs: ['candidate-successor:a'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  });
  assert.equal(proposal.reviewStatus, 'READY_FOR_INDEPENDENT_REVIEW');
});

test('TK-012 final output is only an independent review request, never canonical acceptance', () => {
  const fixture = twoBranches();
  const comparison = compareContinuityBranches(
    [fixture.a, fixture.b],
    [fixture.aOutcome, fixture.bOutcome],
    '2026-10-29T18:11:00.000Z'
  );
  const proposal = createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a'],
    rejectedBranches: [{ branchId: 'branch:architecture:b', rejectionReasonRefs: ['reason:b-not-selected'] }],
    candidateSuccessorStateRefs: ['candidate-successor:a'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  });
  const review = createContinuityMergeReviewRequest(
    comparison,
    proposal,
    '2026-10-29T18:13:00.000Z'
  );
  assert.equal(review.recommendedRoute, 'REQUEST_INDEPENDENT_MERGE_REVIEW');
  assert.equal(review.authorityMode, 'requires_independent_authorization');
  assert.equal(review.automaticCanonicalAcceptance, false);
  assert.equal(review.canonicalHeadMutation, false);
  assert.deepEqual(review.selectedBranchIds, ['branch:architecture:a']);
  assert.deepEqual(review.rejectedBranchIds, ['branch:architecture:b']);
});

test('TK-012 digest tampering fails verification rather than becoming accepted history', () => {
  const fixture = twoBranches();
  const comparison = compareContinuityBranches(
    [fixture.a, fixture.b],
    [fixture.aOutcome, fixture.bOutcome],
    '2026-10-29T18:11:00.000Z'
  );
  const proposal = createContinuityMergeProposal(comparison, {
    selectedBranchIds: ['branch:architecture:a'],
    rejectedBranches: [{ branchId: 'branch:architecture:b', rejectionReasonRefs: ['reason:b-not-selected'] }],
    candidateSuccessorStateRefs: ['candidate-successor:a'],
    mergeEvidenceRefs: ['evidence:merge-analysis'],
    proposedAt: '2026-10-29T18:12:00.000Z',
  });
  const tampered = structuredClone(proposal);
  tampered.selectedBranchIds = ['branch:architecture:b'];
  assert.equal(verifyContinuityMergeProposal(tampered), false);
});
