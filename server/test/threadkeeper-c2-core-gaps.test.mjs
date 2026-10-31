import test from 'node:test';
import assert from 'node:assert/strict';

import { assessContinuity } from '../dist/threadkeeper/assessment.js';
import {
  acceptCheckpointProposal,
  createCheckpointProposal,
} from '../dist/threadkeeper/checkpoint.js';
import { validateCheckpointLineage } from '../dist/threadkeeper/lineage.js';
import {
  recommendRoute,
  THREADKEEPER_ROUTE_POLICY_VERSION,
} from '../dist/threadkeeper/routing.js';
import { semanticScopeKey } from '../dist/threadkeeper/scope.js';

const scope = {
  scopeType: 'plan',
  namespace: 'comind.tk005.core',
  subjectRef: 'plan:c2-evidence',
};

const evidence = [{ provider: 'test', kind: 'fixture', ref: 'evidence:tk005' }];

const signals = overrides => ({
  scopeStatus: 'valid',
  requiredEvidenceStatus: 'available',
  acceptedBaselinePresent: true,
  checkpointIntegrityValid: true,
  checkpointAuthorityValid: true,
  predecessorStatus: 'valid',
  authoritativeConflict: false,
  authorizedChange: false,
  materialChange: false,
  incompatibilityProven: false,
  ...overrides,
});

const state = () => ({
  objectiveRefs: ['objective:1'],
  decisionRefs: ['decision:1'],
  commitmentRefs: [],
  obligationRefs: ['obligation:1'],
  contextRefs: ['context:1'],
  evidenceRefs: evidence,
  sourceRefs: [{ provider: 'test', kind: 'source', ref: 'source:1' }],
  sensitivity: 'internal',
  retentionClass: 'durable',
});

function proposal(proposalId = 'proposal:tk005') {
  return createCheckpointProposal({
    proposalId,
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-27T00:00:00.000Z',
    proposedByRef: 'actor:test',
    state: state(),
  });
}

test('equivalent checkpoint proposals produce deterministic state and proposal digests', () => {
  const first = proposal('proposal:deterministic');
  const reorderedState = {
    retentionClass: 'durable',
    sourceRefs: [{ kind: 'source', provider: 'test', ref: 'source:1' }],
    evidenceRefs: [{ kind: 'fixture', provider: 'test', ref: 'evidence:tk005' }],
    contextRefs: ['context:1'],
    obligationRefs: ['obligation:1'],
    commitmentRefs: [],
    decisionRefs: ['decision:1'],
    objectiveRefs: ['objective:1'],
    sensitivity: 'internal',
  };
  const second = createCheckpointProposal({
    proposalId: 'proposal:deterministic',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-27T00:00:00.000Z',
    proposedByRef: 'actor:test',
    state: reorderedState,
  });
  assert.equal(second.stateDigest, first.stateDigest);
  assert.equal(second.digest, first.digest);
});

test('invalid external authority fails checkpoint acceptance explicitly', () => {
  const result = acceptCheckpointProposal(proposal('proposal:invalid-authority'), null, {
    valid: false,
    source: 'external',
    actorRef: 'founder:test',
    evidenceRef: 'authority:revoked',
  }, '2026-10-27T00:01:00.000Z');
  assert.deepEqual(result, { accepted: false, reasonCode: 'authority_validation_failed' });
});

test('missing accepted baseline blocks assessment', () => {
  const result = assessContinuity({
    scopeSemanticKey: semanticScopeKey(scope),
    checkpointId: null,
    observationId: 'observation:missing-baseline',
    evidenceRefs: evidence,
    signals: signals({ acceptedBaselinePresent: false }),
  });
  assert.equal(result.classification, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['accepted_baseline_missing']);
  assert.deepEqual(result.breakTypes, ['context_loss']);
});

test('route recommendation preserves the reviewed static policy version', () => {
  const result = assessContinuity({
    scopeSemanticKey: semanticScopeKey(scope),
    checkpointId: 'checkpoint:1',
    observationId: 'observation:route-policy',
    evidenceRefs: evidence,
    signals: signals({ materialChange: true }),
  });
  const route = recommendRoute(result);
  assert.equal(route.routeCode, 'REQUEST_HELPER_ANALYSIS');
  assert.equal(route.policyVersion, THREADKEEPER_ROUTE_POLICY_VERSION);
  assert.equal(route.policyVersion, 'tk-route-v1');
});

test('lineage validation accepts one linear chain and fails closed on broken or cyclic history', () => {
  const valid = [
    { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: null },
    { checkpoint_id: 'checkpoint:child', parent_checkpoint_id: 'checkpoint:root' },
    { checkpoint_id: 'checkpoint:leaf', parent_checkpoint_id: 'checkpoint:child' },
  ];
  assert.deepEqual(validateCheckpointLineage(valid), valid);

  assert.throws(() => validateCheckpointLineage([
    { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: null },
    { checkpoint_id: 'checkpoint:broken', parent_checkpoint_id: 'checkpoint:missing' },
  ]), /lineage is broken/);

  assert.throws(() => validateCheckpointLineage([
    { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: null },
    { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: 'checkpoint:root' },
  ]), /cycle or duplicate/);
});

test('checkpoint state rejects raw unmodeled payload fields instead of copying them', () => {
  const rawState = {
    ...state(),
    rawTranscript: 'SENSITIVE_CANARY_SHOULD_NEVER_PERSIST',
  };
  assert.throws(() => createCheckpointProposal({
    proposalId: 'proposal:raw-payload',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-27T00:00:00.000Z',
    proposedByRef: 'actor:test',
    state: rawState,
  }), /Unsupported checkpoint state field/);
});

test('evidence references reject embedded raw payload fields', () => {
  const rawState = state();
  rawState.evidenceRefs = [{
    provider: 'conversation_history',
    kind: 'message',
    ref: 'message:1',
    rawContent: 'SENSITIVE_CANARY_SHOULD_NEVER_PERSIST',
  }];
  assert.throws(() => createCheckpointProposal({
    proposalId: 'proposal:raw-evidence',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-27T00:00:00.000Z',
    proposedByRef: 'actor:test',
    state: rawState,
  }), /Unsupported evidence reference field/);
});
