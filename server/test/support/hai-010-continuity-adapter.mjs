import assert from 'node:assert/strict';

import {
  InMemoryObservationReferenceRegistry,
  ThreadKeeperService,
} from '../../dist/threadkeeper/service.js';
import {
  createContinuityCapsule,
  createContinuityPrecondition,
  validateContinuityCapsuleFidelity,
  validateContinuityPrecondition,
  verifyContinuityCapsule,
} from '../../dist/continuity/capsule.js';
import { fingerprintCanonicalValue } from '../../dist/continuity/checkpoint.js';

const SYNTHETIC_AUTHORITY = Object.freeze({
  valid: true,
  source: 'external',
  actorRef: 'actor:hai-010:synthetic-test-authority',
  evidenceRef: 'authority:hai-010:synthetic-test-only',
  policyRef: 'policy:hai-010:test-only',
});

function deterministicClock() {
  let value = 0;
  return () => { value += 1; return value; };
}

function availableResolver() {
  return {
    async resolve(ref) {
      return { status: 'available', ref: structuredClone(ref) };
    },
  };
}

function fixtureDigest(fixture) {
  const digest = fixture.referenceStateHash?.replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/i.test(digest ?? '')) throw new Error(`Invalid frozen fixture digest for ${fixture.id}`);
  return digest.toLowerCase();
}

function stateRef(fixture, itemId) {
  return `hai-010:fixture:${fixture.id}:state:${itemId}`;
}

export function assertNoMemoryGovernanceLeakage(value, forbiddenKeys) {
  const lowered = forbiddenKeys.map(item => item.toLowerCase());
  const visit = (node, path = '$') => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const compact = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lowered.some(term => compact.includes(term.toLowerCase().replace(/[^a-z0-9]/g, '')))) {
        throw new Error(`MEMORY_ONLY governance leakage at ${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
  return true;
}

export function sanitizeMemoryOnlyProof(show, preflight, manifest) {
  if (!preflight?.ok || preflight?.preflight?.currentUser !== manifest.memoryOnlyProof.expectedReaderRole) {
    throw new Error('MEMORY_ONLY proof did not execute under the required Conversation History reader role');
  }
  if (show?.sourceConversationId !== manifest.memoryOnlyProof.expectedSyntheticConversationId) {
    throw new Error('MEMORY_ONLY proof did not read the expected isolated synthetic conversation');
  }
  if (!Array.isArray(show?.nodes) || show.nodes.length === 0) {
    throw new Error('MEMORY_ONLY proof returned no retained conversation nodes');
  }
  const retainedMessages = show.nodes.map(node => ({
    sourceNodeId: node.sourceNodeId,
    sourceMessageId: node.sourceMessageId,
    role: node.role,
    contentType: node.contentType,
    contentText: node.contentText,
    onActiveBranch: node.onActiveBranch,
  }));
  const proof = {
    implementation: 'CoMind Conversation History reader',
    executionMode: 'actual_isolated_synthetic_postgresql',
    readerRoleVerified: true,
    privateDataUsed: false,
    sourceConversationId: show.sourceConversationId,
    retainedMessages,
    retentionOnlyView: true,
    note: 'The real Conversation History reader produced these retained synthetic messages. HAI semantic metrics remain frozen HAI-009 synthetic observations and are not inferred from this generic implementation probe.',
  };
  assertNoMemoryGovernanceLeakage(proof, manifest.mechanismEvidencePolicy.memoryOnlyForbiddenKeys);
  return Object.freeze(structuredClone(proof));
}

export function executeFreshSession(fixture) {
  return Object.freeze({
    implementation: 'none',
    executionMode: 'no_retained_state',
    retainedStateAvailable: false,
    fixtureInputRefs: [],
    systemProduced: {
      continuityMechanismInvoked: false,
    },
  });
}

export async function executeGovernedContinuity(fixture, manifest) {
  const digest = fixtureDigest(fixture);
  const stateRefs = fixture.referenceState.requiredResumeIds.map(itemId => stateRef(fixture, itemId));
  const unresolvedRefs = fixture.referenceState.unresolvedItemIds.map(itemId => `hai-010:fixture:${fixture.id}:unresolved:${itemId}`);
  const correctionRefs = fixture.referenceState.corrections.map(item => `hai-010:fixture:${fixture.id}:correction:${item.itemId}`);
  const evidenceRef = {
    provider: 'hai-010.synthetic-fixture',
    kind: 'frozen-reference-state',
    ref: `fixture:${fixture.id}:reference-state`,
    version: fixture.fixtureVersion,
    digest,
    sensitivity: 'internal',
  };
  const scopeBinding = {
    scopeType: 'plan',
    namespace: 'comind.hai-010.continuity-comparison',
    subjectRef: `fixture:${fixture.id}`,
  };
  const service = new ThreadKeeperService({
    observationRegistry: new InMemoryObservationReferenceRegistry(),
    evidenceResolver: availableResolver(),
    nowMs: deterministicClock(),
  });
  const observation = {
    observationId: `observation:hai-010:${fixture.id}`,
    eventType: 'continuity.synthetic-comparison',
    sourceSystem: 'hai-010',
    observedAt: manifest.executionBoundary.fixedExecutionTimestamp,
    scopeBinding,
    currentStateRefs: stateRefs,
    evidenceRefs: [evidenceRef],
    actorRef: 'actor:hai-010:synthetic-harness',
    authorityRef: SYNTHETIC_AUTHORITY.evidenceRef,
    policyRef: SYNTHETIC_AUTHORITY.policyRef,
    sensitivity: 'internal',
    retentionClass: 'durable',
  };
  const receipt = await service.observe(observation);
  assert.equal(receipt.disposition, 'accepted');
  const assessment = await service.assess({
    observation,
    receipt,
    checkpointId: null,
    acceptedBaselinePresent: false,
    checkpointIntegrityValid: true,
    checkpointAuthorityValid: true,
    predecessorStatus: 'valid',
    authoritativeConflict: false,
    authorizedChange: false,
    materialChange: false,
    incompatibilityProven: false,
  });
  const proposalId = `checkpoint:hai-010:${fixture.id}`;
  const proposal = service.proposeCheckpoint({
    proposalId,
    scopeSemanticKey: receipt.scopeSemanticKey,
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: manifest.executionBoundary.fixedExecutionTimestamp,
    proposedByRef: 'actor:hai-010:synthetic-harness',
    policyRef: SYNTHETIC_AUTHORITY.policyRef,
    state: {
      objectiveRefs: stateRefs,
      decisionRefs: correctionRefs,
      commitmentRefs: unresolvedRefs,
      obligationRefs: unresolvedRefs,
      contextRefs: stateRefs,
      evidenceRefs: [evidenceRef],
      sourceRefs: [evidenceRef],
      sensitivity: 'internal',
      retentionClass: 'durable',
    },
  });
  const acceptedAt = '2026-10-30T16:40:06.000Z';
  const acceptance = service.acceptCheckpoint(proposal, null, SYNTHETIC_AUTHORITY, acceptedAt);
  assert.equal(acceptance.accepted, true);
  const unresolvedCases = fixture.referenceState.unresolvedItemIds.map((itemId, index) => ({
    caseId: `case-hai-010-${fixture.id.toLowerCase()}-${index + 1}`,
    caseKey: `case:hai-010:${fixture.id}:${itemId}`,
    state: 'ROUTED',
    latestTransitionId: `transition:hai-010:${fixture.id}:${index + 1}`,
    lastTransitionAt: '2026-10-30T16:40:06.500Z',
  }));
  const canonicalHandoff = {
    version: 'continuity-handoff-v1',
    scopeSemanticKey: receipt.scopeSemanticKey,
    currentCheckpoint: {
      checkpointId: proposal.proposalId,
      parentCheckpointId: proposal.parentCheckpointId,
      persistenceSeq: '1',
      acceptedAt: acceptance.acceptedAt,
      acceptedByRef: acceptance.acceptedByRef,
      authorityEvidenceRef: acceptance.authorityEvidenceRef,
      policyRef: acceptance.policyRef ?? null,
      stateDigest: proposal.stateDigest,
      proposalDigest: proposal.digest,
    },
    lineage: { checkpointIds: [proposal.proposalId], depth: 1 },
    unresolvedCases,
  };
  const handoff = {
    ...canonicalHandoff,
    continuityDigest: fingerprintCanonicalValue(canonicalHandoff),
    consumer: {
      consumerRef: 'consumer:hai-010:synthetic-comparison',
      providerRef: 'provider:comind-threadkeeper',
      actorRef: 'actor:hai-010:synthetic-harness',
      authorityMode: 'requires_independent_validation',
      resolvedAt: '2026-10-30T16:40:07.000Z',
    },
  };
  const capsule = createContinuityCapsule({
    handoff,
    references: {
      objectiveRefs: stateRefs,
      decisionRefs: correctionRefs,
      assumptionRefs: [],
      obligationRefs: unresolvedRefs,
      prohibitedActionRefs: ['prohibition:hai-010:no-authority-inheritance'],
      openQuestionRefs: unresolvedRefs,
      evidenceRefs: [`evidence:hai-010:fixture:${fixture.id}:${digest}`],
    },
    sensitivity: 'internal',
    retentionClass: 'durable',
    issuedAt: '2026-10-30T16:40:08.000Z',
    expiresAt: '2026-10-31T16:40:08.000Z',
  });
  const capsuleVerified = verifyContinuityCapsule(capsule, '2026-10-30T16:40:09.000Z');
  assert.equal(capsuleVerified, true);
  const precondition = createContinuityPrecondition(capsule);
  const preconditionResult = validateContinuityPrecondition(precondition, handoff, '2026-10-30T16:40:09.000Z');
  assert.deepEqual(preconditionResult, { valid: true, status: 'valid' });
  const fidelity = validateContinuityCapsuleFidelity(capsule, structuredClone(capsule));
  assert.equal(fidelity.status, 'PASS');

  return Object.freeze({
    implementation: 'CoMind ThreadKeeper plus continuity capsule',
    executionMode: 'actual_pure_runtime_synthetic_fixture_refs',
    fixtureInputRefs: {
      stateRefs,
      correctionRefs,
      unresolvedRefs,
      evidenceRef: structuredClone(evidenceRef),
      note: 'These references are derived from frozen fixture ground truth. The semantic values are fixture inputs, not ThreadKeeper-generated facts.',
    },
    systemProduced: {
      observationDisposition: receipt.disposition,
      observationDigest: receipt.observationDigest,
      scopeSemanticKey: receipt.scopeSemanticKey,
      assessmentClassification: assessment.classification,
      assessmentReasonCodes: assessment.reasonCodes,
      checkpointAccepted: acceptance.accepted,
      checkpointDigest: proposal.digest,
      checkpointStateDigest: proposal.stateDigest,
      handoffContinuityDigest: handoff.continuityDigest,
      capsuleVerified,
      capsuleDigest: capsule.capsuleDigest,
      preconditionStatus: preconditionResult.status,
      fidelityStatus: fidelity.status,
      unresolvedCaseRefs: capsule.unresolvedCaseRefs,
      authorityMode: capsule.authority.mode,
      authorityInheritance: capsule.authority.inheritance,
    },
    authority: {
      kind: 'synthetic_external_test_authority',
      humanAuthorityClaimed: false,
      evidenceRef: SYNTHETIC_AUTHORITY.evidenceRef,
      policyRef: SYNTHETIC_AUTHORITY.policyRef,
    },
  });
}
