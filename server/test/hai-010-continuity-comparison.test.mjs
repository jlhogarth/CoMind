import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelemetryEnvelope,
  scoreObservation,
  stableStringify,
} from '../../scripts/hai_009_continuity_pilot.mjs';
import {
  executeHai010Comparison,
  loadHai010Manifest,
  validateHai010Manifest,
  verifyFrozenHai009,
} from '../../scripts/hai_010_continuity_comparison.mjs';
import {
  assertNoMemoryGovernanceLeakage,
  executeGovernedContinuity,
  sanitizeMemoryOnlyProof,
} from './support/hai-010-continuity-adapter.mjs';

function memoryProof() {
  return {
    preflight: {
      ok: true,
      preflight: {
        databaseName: 'comind_ci',
        sessionUser: 'chist_history_login',
        currentUser: 'comind_conversation_history_reader',
      },
    },
    show: {
      provenanceLayer: 'source_evidence',
      sourceConversationId: 'native-history-1',
      rawSourceHash: '1'.repeat(64),
      normalizedHash: '2'.repeat(64),
      topologyHash: '5'.repeat(64),
      nodes: [
        {
          sourceNodeId: 'node-1',
          sourceMessageId: 'msg-1',
          role: 'user',
          contentType: 'text',
          contentText: 'Preserve conversation continuity and history.',
          onActiveBranch: true,
          rawNodeHash: '3'.repeat(64),
          normalizedMessageHash: '4'.repeat(64),
        },
        {
          sourceNodeId: 'node-2',
          sourceMessageId: 'msg-2',
          role: 'assistant',
          contentType: 'text',
          contentText: 'Capture first. Interpret second. Promote deliberately.',
          onActiveBranch: true,
          rawNodeHash: '6'.repeat(64),
          normalizedMessageHash: '7'.repeat(64),
        },
      ],
      attachments: [{ sourceReference: 'must-not-leak' }],
      reconciliation: { result: 'exact_match', evidence: 'must-not-leak' },
      derived: { provenanceLayer: 'derived_evidence', analytics: [{ value: 'must-not-leak' }], promotionCandidates: [] },
    },
  };
}

function containsCompositeScore(value) {
  if (Array.isArray(value)) return value.some(containsCompositeScore);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => /^(overallScore|globalScore|maturityScore|haiScore)$/i.test(key) || containsCompositeScore(child));
}

test('HAI-010 pins the accepted HAI-009 manifest and scorer byte identities', () => {
  const manifest = loadHai010Manifest();
  const verified = verifyFrozenHai009(manifest);
  assert.equal(verified.actualManifestHash, 'b15611028f4b87b2ad4be60f46a4b3a0731b6e075b54d018238f16626d80cf5d');
  assert.equal(verified.actualScorerHash, '6e0d1c9747645d6063148da77ad35c093af2261986872319ce0440006cd9f438');
  assert.deepEqual(validateHai010Manifest(manifest, verified.hai009), []);
});

test('all HAI-010 authority, privacy, provider, schema, Production, and Phase B boundaries remain false', () => {
  const manifest = loadHai010Manifest();
  for (const key of ['realParticipantDataAllowed','privateUserDataAllowed','paidProviderAllowed','productionMutationAllowed','schemaMutationAllowed','phaseBActivated']) {
    assert.equal(manifest.executionBoundary[key], false, key);
  }
});

test('MEMORY_ONLY sanitizer exposes retained messages only and strips governed or derived fields', () => {
  const manifest = loadHai010Manifest();
  const proof = memoryProof();
  const sanitized = sanitizeMemoryOnlyProof(proof.show, proof.preflight, manifest);
  assert.equal(sanitized.readerRoleVerified, true);
  assert.equal(sanitized.privateDataUsed, false);
  assert.equal(sanitized.retainedMessages.length, 2);
  assert.equal(sanitized.retainedMessages[0].contentText, 'Preserve conversation continuity and history.');
  const serialized = JSON.stringify(sanitized);
  for (const forbidden of ['rawSourceHash','normalizedHash','topologyHash','attachments','reconciliation','derived','provenanceLayer']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(assertNoMemoryGovernanceLeakage(sanitized, manifest.mechanismEvidencePolicy.memoryOnlyForbiddenKeys), true);
});

test('MEMORY_ONLY governance leakage fails closed', () => {
  const manifest = loadHai010Manifest();
  assert.throws(
    () => assertNoMemoryGovernanceLeakage({ retainedMessages: [], checkpointId: 'checkpoint:forbidden' }, manifest.mechanismEvidencePolicy.memoryOnlyForbiddenKeys),
    /governance leakage/,
  );
  assert.throws(
    () => assertNoMemoryGovernanceLeakage({ retainedMessages: [], governance: { current: true } }, manifest.mechanismEvidencePolicy.memoryOnlyForbiddenKeys),
    /governance leakage/,
  );
});

test('GOVERNED_CONTINUITY exercises actual ThreadKeeper and capsule mechanisms for all frozen fixtures', async () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  for (const fixture of hai009.fixtures) {
    const evidence = await executeGovernedContinuity(fixture, manifest);
    assert.equal(evidence.systemProduced.observationDisposition, 'accepted');
    assert.equal(evidence.systemProduced.checkpointAccepted, true);
    assert.equal(evidence.systemProduced.capsuleVerified, true);
    assert.equal(evidence.systemProduced.preconditionStatus, 'valid');
    assert.equal(evidence.systemProduced.fidelityStatus, 'PASS');
    assert.equal(evidence.systemProduced.authorityMode, 'requires_independent_validation');
    assert.equal(evidence.systemProduced.authorityInheritance, 'forbidden');
    assert.equal(evidence.authority.kind, 'synthetic_external_test_authority');
    assert.equal(evidence.authority.humanAuthorityClaimed, false);
  }
});

test('HAI-010 executes exactly 9 distinct condition trials and produces no composite score', async () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  const result = await executeHai010Comparison({ hai010: manifest, hai009, memoryProof: memoryProof() });
  assert.equal(result.trialCount, 9);
  assert.deepEqual([...new Set(result.trials.map(item => item.condition))], ['FRESH_SESSION','MEMORY_ONLY','GOVERNED_CONTINUITY']);
  assert.equal(containsCompositeScore(result), false);
  for (const fixture of hai009.fixtures) {
    assert.equal(result.trials.filter(item => item.fixtureId === fixture.id).length, 3);
  }
});

test('condition mechanisms remain behaviorally distinct', async () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  const result = await executeHai010Comparison({ hai010: manifest, hai009, memoryProof: memoryProof() });
  const atlas = result.trials.filter(item => item.fixtureId === 'ATLAS_RELEASE');
  const fresh = atlas.find(item => item.condition === 'FRESH_SESSION').mechanismEvidence;
  const memory = atlas.find(item => item.condition === 'MEMORY_ONLY').mechanismEvidence;
  const governed = atlas.find(item => item.condition === 'GOVERNED_CONTINUITY').mechanismEvidence;
  assert.equal(fresh.executionMode, 'no_retained_state');
  assert.equal(memory.executionMode, 'actual_isolated_synthetic_postgresql');
  assert.equal(governed.executionMode, 'actual_pure_runtime_synthetic_fixture_refs');
  assert.notEqual(stableStringify(fresh), stableStringify(memory));
  assert.notEqual(stableStringify(memory), stableStringify(governed));
});

test('identical evidence replays byte-identically for HAI-010 receipts', async () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  const first = await executeHai010Comparison({ hai010: manifest, hai009, memoryProof: memoryProof() });
  const second = await executeHai010Comparison({ hai010: manifest, hai009, memoryProof: memoryProof() });
  assert.equal(stableStringify(first), stableStringify(second));
});

test('missing provenance receives zero provenance credit through the unchanged HAI-009 scorer', () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  const fixture = hai009.fixtures[0];
  const observation = structuredClone(fixture.observations.GOVERNED_CONTINUITY);
  observation.provenanceByItem = {};
  const telemetry = buildTelemetryEnvelope(hai009, fixture, 'GOVERNED_CONTINUITY');
  const scores = scoreObservation(fixture.referenceState, observation, telemetry, hai009.telemetry.requiredFields);
  assert.equal(scores.provenance_coverage, 0);
});

test('synthetic Test authority is never represented as human authority', async () => {
  const manifest = loadHai010Manifest();
  const { hai009 } = verifyFrozenHai009(manifest);
  const evidence = await executeGovernedContinuity(hai009.fixtures[0], manifest);
  assert.equal(evidence.authority.kind, 'synthetic_external_test_authority');
  assert.equal(evidence.authority.humanAuthorityClaimed, false);
  assert.equal(JSON.stringify(evidence).includes('human_authority'), false);
});
