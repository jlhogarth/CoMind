import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InMemoryThreadKeeperObservability,
} from '../dist/threadkeeper/observability.js';
import {
  InMemoryObservationReferenceRegistry,
  ThreadKeeperService,
} from '../dist/threadkeeper/service.js';
import { semanticScopeKey } from '../dist/threadkeeper/scope.js';

const binding = {
  scopeType: 'plan',
  namespace: 'comind.tk005.service',
  subjectRef: 'plan:service-proof',
};

function observation(overrides = {}) {
  return {
    observationId: 'observation:service:1',
    eventType: 'continuity.changed',
    sourceSystem: 'conversation_history',
    observedAt: '2026-10-27T00:00:00.000Z',
    scopeBinding: binding,
    currentStateRefs: ['state:1'],
    evidenceRefs: [{ provider: 'conversation_history', kind: 'message', ref: 'message:1' }],
    sensitivity: 'internal',
    retentionClass: 'durable',
    ...overrides,
  };
}

function assessmentInput(receipt, obs, overrides = {}) {
  return {
    observation: obs,
    receipt,
    checkpointId: 'checkpoint:1',
    acceptedBaselinePresent: true,
    checkpointIntegrityValid: true,
    checkpointAuthorityValid: true,
    predecessorStatus: 'valid',
    authoritativeConflict: false,
    authorizedChange: false,
    materialChange: false,
    incompatibilityProven: false,
    ...overrides,
  };
}

function availableResolver(onResolve = () => {}) {
  return {
    async resolve(ref) {
      onResolve(ref);
      return { status: 'available', ref: structuredClone(ref) };
    },
  };
}

function deterministicClock() {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
}

function service(options = {}) {
  const metrics = options.metrics ?? new InMemoryThreadKeeperObservability();
  const registry = options.registry ?? new InMemoryObservationReferenceRegistry();
  const instance = new ThreadKeeperService({
    observationRegistry: registry,
    evidenceResolver: options.resolver ?? availableResolver(),
    observability: metrics,
    nowMs: options.nowMs ?? deterministicClock(),
  });
  return { instance, metrics, registry };
}

test('observation receipts are idempotent by semantic identity and reject conflicting reuse', async () => {
  const { instance, metrics } = service();
  const firstInput = observation();
  const first = await instance.observe(firstInput);
  assert.equal(first.disposition, 'accepted');
  assert.equal(first.scopeSemanticKey, semanticScopeKey(binding));
  assert.match(first.observationDigest, /^[a-f0-9]{64}$/);

  const duplicate = await instance.observe(structuredClone(firstInput));
  assert.equal(duplicate.disposition, 'duplicate');
  assert.equal(duplicate.observationDigest, first.observationDigest);

  const conflict = await instance.observe(observation({ currentStateRefs: ['state:conflicting'] }));
  assert.equal(conflict.disposition, 'rejected');
  assert.deepEqual(conflict.reasonCodes, ['observation_integrity_conflict']);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.observations.accepted, 1);
  assert.equal(snapshot.observations.duplicate, 1);
  assert.equal(snapshot.observations.rejected, 1);
  assert.equal(snapshot.latencies.observation_validation.length, 3);
});

test('ambiguous scope identity is quarantined and counted without heuristic merge', async () => {
  const { instance, metrics } = service();
  const result = await instance.observe(observation(), [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);
  assert.equal(result.disposition, 'quarantined');
  assert.deepEqual(result.reasonCodes, ['scope_identity_ambiguous']);
  assert.equal(metrics.snapshot().scopeIdentityCollisions, 1);
  assert.equal(metrics.snapshot().observations.quarantined, 1);
});

test('unmodeled observation payload fields are rejected before registration', async () => {
  const { instance, metrics } = service();
  await assert.rejects(
    () => instance.observe(observation({ rawTranscript: 'SENSITIVE_CANARY_SHOULD_NEVER_PERSIST' })),
    /Unsupported continuity observation field/,
  );
  assert.equal(metrics.snapshot().observations.rejected, 1);
});

test('missing required provenance blocks assessment instead of assuming continuity', async () => {
  const { instance, metrics } = service();
  const obs = observation({ observationId: 'observation:missing-provenance', evidenceRefs: [] });
  const receipt = await instance.observe(obs);
  const result = await instance.assess(assessmentInput(receipt, obs));
  assert.equal(result.classification, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['required_evidence_missing']);
  assert.equal(metrics.snapshot().assessmentsMissingEvidence, 1);
});

test('evidence resolver outage remains unverifiable and records no fabricated result', async () => {
  const metrics = new InMemoryThreadKeeperObservability();
  const { instance } = service({
    metrics,
    resolver: {
      async resolve() {
        throw new Error('dependency timeout');
      },
    },
  });
  const obs = observation({ observationId: 'observation:resolver-timeout' });
  const receipt = await instance.observe(obs);
  const result = await instance.assess(assessmentInput(receipt, obs));
  assert.equal(result.classification, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['required_evidence_unverifiable']);
  assert.equal(metrics.snapshot().evidenceResolverFailures, 1);
  assert.equal(metrics.snapshot().assessmentsMissingEvidence, 1);
});

test('evidence resolvers receive only opaque references and cannot substitute another reference', async () => {
  const seen = [];
  const { instance, metrics } = service({
    resolver: {
      async resolve(ref) {
        seen.push(structuredClone(ref));
        return {
          status: 'available',
          ref: { ...ref, ref: 'message:substituted' },
        };
      },
    },
  });
  const obs = observation({ observationId: 'observation:opaque-ref' });
  const receipt = await instance.observe(obs);
  const result = await instance.assess(assessmentInput(receipt, obs));
  assert.deepEqual(seen, [{ provider: 'conversation_history', kind: 'message', ref: 'message:1' }]);
  assert.equal(result.classification, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['required_evidence_unverifiable']);
  assert.equal(metrics.snapshot().evidenceResolverFailures, 1);
});

test('Conversation History and Foundry are consumed read-only as evidence references', async () => {
  const resolved = [];
  let sourceMutationCalls = 0;
  const { instance } = service({
    resolver: availableResolver(ref => resolved.push(structuredClone(ref))),
  });
  const obs = observation({
    observationId: 'observation:boundary-refs',
    evidenceRefs: [
      { provider: 'conversation_history', kind: 'message', ref: 'message:42' },
      { provider: 'foundry', kind: 'execution_outcome', ref: 'outcome:77' },
    ],
  });
  const receipt = await instance.observe(obs);
  const result = await instance.assess(assessmentInput(receipt, obs));
  assert.equal(result.classification, 'INTACT');
  assert.deepEqual(resolved, obs.evidenceRefs);
  assert.equal(sourceMutationCalls, 0);
  assert.equal(JSON.stringify(result).includes('rawTranscript'), false);
});

test('route recommendations never execute Helper Matrix, SEAL, or Agent Communication', async () => {
  let helperExecutions = 0;
  let sealExecutions = 0;
  let transportInvocations = 0;
  const { instance, metrics } = service();
  const scopeSemanticKey = semanticScopeKey(binding);

  const helperRoute = instance.route({
    classification: 'SUSPECTED_BREAK',
    reasonCodes: ['material_change_without_sufficient_authority_or_explanation'],
    breakTypes: ['unexplained_plan_divergence'],
    confidence: 0.75,
    uncertainty: 0.5,
    scopeSemanticKey,
    checkpointId: 'checkpoint:1',
    observationId: 'observation:helper-route',
    evidenceRefs: [],
    assessorVersion: 'tk-assessor-v1',
  });
  assert.equal(helperRoute.routeCode, 'REQUEST_HELPER_ANALYSIS');

  const sealRoute = instance.route({
    classification: 'SUSPECTED_BREAK',
    reasonCodes: ['governed_revision_candidate'],
    breakTypes: ['stale_assumption'],
    confidence: 0.9,
    uncertainty: 0.2,
    scopeSemanticKey,
    checkpointId: 'checkpoint:1',
    observationId: 'observation:seal-route',
    evidenceRefs: [],
    assessorVersion: 'tk-assessor-v1',
  });
  assert.equal(sealRoute.routeCode, 'REQUEST_SEAL_REVIEW');

  assert.equal(helperExecutions, 0);
  assert.equal(sealExecutions, 0);
  assert.equal(transportInvocations, 0);
  assert.equal(metrics.snapshot().routes.REQUEST_HELPER_ANALYSIS, 1);
  assert.equal(metrics.snapshot().routes.REQUEST_SEAL_REVIEW, 1);
});

test('repeated route cycles escalate to governed review instead of looping', () => {
  const { instance, metrics } = service();
  const assessment = {
    classification: 'SUSPECTED_BREAK',
    reasonCodes: ['material_change_without_sufficient_authority_or_explanation'],
    breakTypes: ['unexplained_plan_divergence'],
    confidence: 0.75,
    uncertainty: 0.5,
    scopeSemanticKey: semanticScopeKey(binding),
    checkpointId: 'checkpoint:1',
    observationId: 'observation:route-cycle',
    evidenceRefs: [],
    assessorVersion: 'tk-assessor-v1',
  };
  const prior = [
    { routeCode: 'REQUEST_HELPER_ANALYSIS', policyVersion: 'tk-route-v1', reasonCodes: [], authorityRequired: false },
    { routeCode: 'REQUEST_HELPER_ANALYSIS', policyVersion: 'tk-route-v1', reasonCodes: [], authorityRequired: false },
  ];
  const route = instance.route(assessment, prior);
  assert.equal(route.routeCode, 'REQUEST_GOVERNANCE_REVIEW');
  assert.ok(route.reasonCodes.includes('repeated_route_cycle'));
  assert.equal(route.authorityRequired, true);
  assert.equal(metrics.snapshot().repeatedRouteCycles, 1);
});

test('unavailable destination or unproven success remains unresolved', () => {
  const { instance, metrics } = service();
  assert.deepEqual(instance.routeOutcome({
    destinationAvailable: false,
    destinationReportedSuccess: false,
  }), {
    state: 'UNRESOLVED',
    reasonCodes: ['route_destination_unavailable'],
  });
  assert.deepEqual(instance.routeOutcome({
    destinationAvailable: true,
    destinationReportedSuccess: true,
  }), {
    state: 'UNRESOLVED',
    reasonCodes: ['authoritative_completion_evidence_missing'],
  });
  assert.deepEqual(instance.routeOutcome({
    destinationAvailable: true,
    destinationReportedSuccess: true,
    authoritativeCompletionEvidenceRef: 'foundry:outcome:authoritative',
  }), {
    state: 'RESOLVED',
    reasonCodes: ['authoritative_completion_evidence_present'],
    resolutionRef: 'foundry:outcome:authoritative',
  });
  assert.equal(metrics.snapshot().casesUnresolved, 2);
});

test('checkpoint proposal and acceptance observability records bounded categorical outcomes', () => {
  const metrics = new InMemoryThreadKeeperObservability();
  const { instance } = service({ metrics });
  const proposal = instance.proposeCheckpoint({
    proposalId: 'proposal:service',
    scopeSemanticKey: semanticScopeKey(binding),
    parentCheckpointId: null,
    currentAcceptedCheckpointId: null,
    proposedAt: '2026-10-27T00:00:00.000Z',
    proposedByRef: 'actor:test',
    state: {
      objectiveRefs: ['objective:1'],
      decisionRefs: [],
      commitmentRefs: [],
      obligationRefs: [],
      contextRefs: [],
      evidenceRefs: [{ provider: 'test', kind: 'fixture', ref: 'evidence:1' }],
      sourceRefs: [],
      sensitivity: 'internal',
      retentionClass: 'durable',
    },
  });
  const denied = instance.acceptCheckpoint(proposal, null, {
    valid: false,
    source: 'external',
    actorRef: 'founder:test',
    evidenceRef: 'authority:revoked',
  }, '2026-10-27T00:01:00.000Z');
  assert.equal(denied.accepted, false);

  const accepted = instance.acceptCheckpoint(proposal, null, {
    valid: true,
    source: 'external',
    actorRef: 'founder:test',
    evidenceRef: 'authority:valid',
  }, '2026-10-27T00:01:00.000Z');
  assert.equal(accepted.accepted, true);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.checkpointProposals, 1);
  assert.equal(snapshot.checkpointAcceptances.authority_failure, 1);
  assert.equal(snapshot.checkpointAcceptances.accepted, 1);
  assert.equal(snapshot.latencies.checkpoint_proposal.length, 1);
  assert.equal(snapshot.latencies.checkpoint_acceptance.length, 2);
});

test('observability snapshot cannot contain sensitive evidence or identity payloads', async () => {
  const metrics = new InMemoryThreadKeeperObservability();
  const { instance } = service({ metrics });
  const obs = observation({
    observationId: 'observation:metric-canary',
    evidenceRefs: [{ provider: 'conversation_history', kind: 'message', ref: 'SENSITIVE_CANARY_REF' }],
  });
  const receipt = await instance.observe(obs);
  await instance.assess(assessmentInput(receipt, obs));
  const serialized = JSON.stringify(metrics.snapshot());
  assert.equal(serialized.includes('SENSITIVE_CANARY_REF'), false);
  assert.equal(serialized.includes(obs.observationId), false);
  assert.equal(serialized.includes(binding.subjectRef), false);
});

test('context retrieval and lineage validation are read-only adapters with bounded latency telemetry', async () => {
  const metrics = new InMemoryThreadKeeperObservability();
  const { instance } = service({ metrics });
  const context = await instance.getContext({
    async getContext(key) {
      return { scopeSemanticKey: key, acceptedCheckpointRef: 'checkpoint:1' };
    },
  }, semanticScopeKey(binding));
  assert.equal(context.acceptedCheckpointRef, 'checkpoint:1');
  assert.equal(metrics.snapshot().latencies.context_retrieval.length, 1);

  const lineage = await instance.getLineage({
    async getLineage() {
      return [
        { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: null },
        { checkpoint_id: 'checkpoint:child', parent_checkpoint_id: 'checkpoint:root' },
      ];
    },
  }, semanticScopeKey(binding));
  assert.equal(lineage.length, 2);

  await assert.rejects(() => instance.getLineage({
    async getLineage() {
      return [
        { checkpoint_id: 'checkpoint:root', parent_checkpoint_id: null },
        { checkpoint_id: 'checkpoint:broken', parent_checkpoint_id: 'checkpoint:missing' },
      ];
    },
  }, semanticScopeKey(binding)), /lineage is broken/);
});
