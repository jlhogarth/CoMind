import test from 'node:test';
import assert from 'node:assert/strict';

import { createCheckpoint } from '../dist/continuity/checkpoint.js';
import { assessContinuity } from '../dist/threadkeeper/assessment.js';
import {
  acceptCheckpointProposal,
  createCheckpointProposal,
  verifyCheckpointProposal,
} from '../dist/threadkeeper/checkpoint.js';
import { recommendRoute } from '../dist/threadkeeper/routing.js';
import { resolveScopeBinding, semanticScopeKey } from '../dist/threadkeeper/scope.js';

const scope = {
  scopeType: 'plan',
  namespace: 'comind.test',
  subjectRef: 'plan:alpha',
};

const evidence = [{ provider: 'test', kind: 'fixture', ref: 'evidence:1' }];

const baseSignals = () => ({
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
});

const assessment = overrides => assessContinuity({
  scopeSemanticKey: semanticScopeKey(scope),
  checkpointId: 'checkpoint:1',
  observationId: 'observation:1',
  evidenceRefs: evidence,
  signals: { ...baseSignals(), ...overrides },
});

const checkpointState = () => ({
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

test('semantic scope keys are deterministic and namespace-sensitive', () => {
  assert.equal(semanticScopeKey(scope), semanticScopeKey({ ...scope }));
  assert.notEqual(semanticScopeKey(scope), semanticScopeKey({ ...scope, namespace: 'other' }));
});

test('scope resolution rejects ambiguous identity instead of guessing', () => {
  assert.throws(
    () => resolveScopeBinding(scope, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]),
    /Ambiguous continuity scope identity/
  );
});

test('scope resolution preserves an exact known scope id', () => {
  const scopeId = '11111111-1111-4111-8111-111111111111';
  const resolved = resolveScopeBinding({ ...scope, scopeId }, [scopeId]);
  assert.equal(resolved.scopeId, scopeId);
});

test('intact continuity requires all deterministic invariants and produces no route', () => {
  const result = assessment({});
  assert.equal(result.classification, 'INTACT');
  assert.deepEqual(result.reasonCodes, ['continuity_invariants_hold']);
  assert.throws(() => recommendRoute(result), /No route required for intact continuity/);
});

test('missing required evidence blocks and routes to evidence request', () => {
  const result = assessment({ requiredEvidenceStatus: 'missing' });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.uncertainty, 1);
  assert.equal(recommendRoute(result).routeCode, 'REQUEST_EVIDENCE');
});

test('ambiguous semantic identity blocks and routes to human review', () => {
  const result = assessment({ scopeStatus: 'ambiguous' });
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(recommendRoute(result).routeCode, 'REQUEST_HUMAN_REVIEW');
});

test('checkpoint integrity failure takes precedence over conflicting evidence', () => {
  const result = assessment({
    requiredEvidenceStatus: 'conflicting',
    checkpointIntegrityValid: false,
  });
  assert.equal(result.classification, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['checkpoint_integrity_invalid']);
});

test('conflicting authoritative evidence remains unresolved after baseline checks', () => {
  const result = assessment({ requiredEvidenceStatus: 'conflicting' });
  assert.equal(result.classification, 'UNRESOLVED_CONFLICT');
  assert.equal(recommendRoute(result).routeCode, 'REQUEST_EPISTEMIC_REVIEW');
});

test('authorized material change is lineage-preserving divergence', () => {
  const result = assessment({ authorizedChange: true, materialChange: true });
  assert.equal(result.classification, 'CHANGED_WITH_LINEAGE');
  const route = recommendRoute(result);
  assert.equal(route.routeCode, 'PROPOSE_AUTHORIZED_DIVERGENCE');
  assert.equal(route.authorityRequired, true);
});

test('broken predecessor lineage is a confirmed continuity break', () => {
  const result = assessment({ predecessorStatus: 'broken' });
  assert.equal(result.classification, 'CONFIRMED_BREAK');
  assert.equal(recommendRoute(result).routeCode, 'REQUEST_GOVERNANCE_REVIEW');
});

test('unexplained material change is suspected rather than invented as confirmed', () => {
  const result = assessment({ materialChange: true });
  assert.equal(result.classification, 'SUSPECTED_BREAK');
  assert.equal(recommendRoute(result).routeCode, 'REQUEST_HELPER_ANALYSIS');
});

test('proven incompatible material change is confirmed', () => {
  const result = assessment({ materialChange: true, incompatibilityProven: true });
  assert.equal(result.classification, 'CONFIRMED_BREAK');
});

test('checkpoint proposal must descend from the accepted head', () => {
  assert.throws(() => createCheckpointProposal({
    proposalId: 'proposal:1',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: 'checkpoint:old',
    currentAcceptedCheckpointId: 'checkpoint:current',
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'actor:test',
    state: checkpointState(),
  }), /does not descend from the current accepted head/);
});

test('checkpoint proposal reuses ACP credential rejection', () => {
  const state = checkpointState();
  state.contextRefs = ['Bearer abcdefghijklmnopqrstuvwxyz'];
  assert.throws(() => createCheckpointProposal({
    proposalId: 'proposal:secret',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'actor:test',
    state,
  }), /credential material/);
});

test('checkpoint proposal integrity detects tampering', () => {
  const proposal = createCheckpointProposal({
    proposalId: 'proposal:2',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'actor:test',
    state: checkpointState(),
  });
  assert.equal(verifyCheckpointProposal(proposal), true);
  proposal.state.objectiveRefs[0] = 'objective:tampered';
  assert.equal(verifyCheckpointProposal(proposal), false);
});

test('ThreadKeeper cannot self-approve a checkpoint', () => {
  const proposal = createCheckpointProposal({
    proposalId: 'proposal:3',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'threadkeeper',
    state: checkpointState(),
  });
  const accepted = acceptCheckpointProposal(proposal, null, {
    valid: true,
    source: 'threadkeeper',
    actorRef: 'threadkeeper',
    evidenceRef: 'authority:self',
  }, '2026-10-26T20:01:00.000Z');
  assert.deepEqual(accepted, { accepted: false, reasonCode: 'threadkeeper_self_approval_forbidden' });
});

test('checkpoint acceptance rejects a stale head', () => {
  const proposal = createCheckpointProposal({
    proposalId: 'proposal:4',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: 'checkpoint:1',
    currentAcceptedCheckpointId: 'checkpoint:1',
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'actor:test',
    state: checkpointState(),
  });
  const accepted = acceptCheckpointProposal(proposal, 'checkpoint:2', {
    valid: true,
    source: 'external',
    actorRef: 'founder:1',
    evidenceRef: 'authority:1',
  }, '2026-10-26T20:01:00.000Z');
  assert.deepEqual(accepted, { accepted: false, reasonCode: 'checkpoint_acceptance_stale_head' });
});

test('external validated authority can accept the current proposal', () => {
  const proposal = createCheckpointProposal({
    proposalId: 'proposal:5',
    scopeSemanticKey: semanticScopeKey(scope),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-26T20:00:00.000Z',
    proposedByRef: 'actor:test',
    policyRef: 'policy:continuity:v1',
    state: checkpointState(),
  });
  const accepted = acceptCheckpointProposal(proposal, null, {
    valid: true,
    source: 'external',
    actorRef: 'founder:1',
    evidenceRef: 'authority:1',
    policyRef: 'policy:authority:v1',
  }, '2026-10-26T20:01:00.000Z');
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.acceptedByRef, 'founder:1');
});

test('additive ACP integrity exports do not break existing checkpoint creation', () => {
  const checkpoint = createCheckpoint({
    conversationId: 'conv',
    workflowId: 'workflow',
    executionId: 'exec',
    parentCheckpointId: null,
    executionCursor: 'cursor',
    authority: { subjectId: 'system', capabilityIds: [], policyVersion: 'v1' },
    context: { objective: 'test', decisions: [], references: [] },
    provenance: { sourceRefs: [], evidenceRefs: [] },
    pending: [],
  }, '2026-10-26T20:00:00.000Z');
  assert.match(checkpoint.digest, /^[a-f0-9]{64}$/);
  assert.match(checkpoint.stateDigest, /^[a-f0-9]{64}$/);
});
