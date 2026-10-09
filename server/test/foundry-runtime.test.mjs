import assert from 'node:assert/strict';
import test from 'node:test';

const {
  FoundryAdapterRegistry,
  FoundryRuntimeError,
  FoundryRuntimeOrchestrator,
  authorityAllows,
  canonicalJson,
  completeFoundryDeliberation,
  grantScopeAllows,
  sha256Fingerprint,
  validateDeliberationEventInput,
} = await import('../dist/foundry-runtime.js');

test('Foundry authority ordering allows only requests at or below the ceiling', () => {
  assert.equal(authorityAllows('C2', 'C0'), true);
  assert.equal(authorityAllows('C2', 'C2'), true);
  assert.equal(authorityAllows('C1', 'C2'), false);
  assert.equal(authorityAllows('C3', 'C4'), false);
});

test('Foundry canonical JSON and request fingerprints are key-order stable', () => {
  assert.equal(canonicalJson({ b: 2, a: { z: 3, y: 1 } }), '{"a":{"y":1,"z":3},"b":2}');
  assert.equal(
    sha256Fingerprint({ b: 2, a: 1 }),
    sha256Fingerprint({ a: 1, b: 2 })
  );
  assert.match(sha256Fingerprint({ a: 1 }), /^[0-9a-f]{64}$/);
});

test('Foundry grant scope accepts only the bounded target_refs contract', () => {
  assert.equal(grantScopeAllows({}, 'jlhogarth/CoMind'), true);
  assert.equal(
    grantScopeAllows({ target_refs: ['jlhogarth/CoMind'] }, 'jlhogarth/CoMind'),
    true
  );
  assert.equal(
    grantScopeAllows({ target_refs: ['jlhogarth/Other'] }, 'jlhogarth/CoMind'),
    false
  );
  assert.equal(grantScopeAllows({ repository: 'jlhogarth/CoMind' }, 'jlhogarth/CoMind'), false);
  assert.equal(grantScopeAllows({ target_refs: [] }, 'jlhogarth/CoMind'), false);
});

test('Foundry adapter registry rejects unknown and duplicate adapters', async () => {
  const registry = new FoundryAdapterRegistry();
  registry.register('fake_local', async () => ({ status: 'succeeded', summary: 'ok' }));
  assert.equal(typeof registry.resolve('fake_local'), 'function');
  assert.throws(
    () => registry.resolve('missing'),
    (error) => error instanceof FoundryRuntimeError && error.code === 'unknown_adapter'
  );
  assert.throws(
    () => registry.register('fake_local', async () => ({ status: 'succeeded', summary: 'other' })),
    (error) => error instanceof FoundryRuntimeError && error.code === 'duplicate_adapter'
  );
});

test('Foundry Issue #73 blocks C3 and C4 before database access', async () => {
  let queried = false;
  const registry = new FoundryAdapterRegistry();
  registry.register('fake_local', async () => ({ status: 'succeeded', summary: 'ok' }));
  const orchestrator = new FoundryRuntimeOrchestrator(async () => {
    queried = true;
    return { rows: [] };
  }, registry);

  await assert.rejects(
    orchestrator.execute({
      profileId: '11111111-1111-4111-8111-111111111111',
      capabilityCode: 'fake.execute',
      authorizationDecisionId: '22222222-2222-4222-8222-222222222222',
      authorityLevel: 'C3',
      environment: 'isolated',
      targetKind: 'repository',
      targetRef: 'jlhogarth/CoMind',
      idempotencyKey: 'issue73-c3-blocked',
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'authority_blocked'
  );
  assert.equal(queried, false);
});

test('Foundry Issue #73 blocks non-isolated execution before database access', async () => {
  let queried = false;
  const registry = new FoundryAdapterRegistry();
  const orchestrator = new FoundryRuntimeOrchestrator(async () => {
    queried = true;
    return { rows: [] };
  }, registry);

  await assert.rejects(
    orchestrator.execute({
      profileId: '11111111-1111-4111-8111-111111111111',
      capabilityCode: 'fake.execute',
      authorizationDecisionId: '22222222-2222-4222-8222-222222222222',
      authorityLevel: 'C2',
      environment: 'staging',
      targetKind: 'repository',
      targetRef: 'jlhogarth/CoMind',
      idempotencyKey: 'issue73-staging-blocked',
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'environment_blocked'
  );
  assert.equal(queried, false);
});

test('Foundry deliberation enforces two rounds and one arbitration pass', () => {
  assert.doesNotThrow(() => validateDeliberationEventInput({
    deliberationId: '11111111-1111-4111-8111-111111111111',
    participantId: '22222222-2222-4222-8222-222222222222',
    eventType: 'proposal',
    claim: 'proposal',
    roundNumber: 1,
    arbitrationPass: 0,
  }));

  assert.throws(
    () => validateDeliberationEventInput({
      deliberationId: '11111111-1111-4111-8111-111111111111',
      participantId: '22222222-2222-4222-8222-222222222222',
      eventType: 'verification_note',
      claim: 'round three',
      roundNumber: 3,
      arbitrationPass: 0,
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'deliberation_round_exceeded'
  );

  assert.throws(
    () => validateDeliberationEventInput({
      deliberationId: '11111111-1111-4111-8111-111111111111',
      participantId: '22222222-2222-4222-8222-222222222222',
      eventType: 'verification_note',
      claim: 'second arbitration',
      roundNumber: 2,
      arbitrationPass: 2,
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'deliberation_arbitration_exceeded'
  );
});

test('Foundry deliberation treats participant silence as a closure blocker', async () => {
  const query = async (text) => {
    if (text.includes('cm_foundry_deliberation_participant')) {
      return {
        rows: [
          { participant_id: 'p1', role: 'planner' },
          { participant_id: 'p2', role: 'verifier' },
        ],
      };
    }
    if (text.includes('cm_foundry_deliberation_event')) {
      return { rows: [{ participant_id: 'p1', event_type: 'decision' }] };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  await assert.rejects(
    completeFoundryDeliberation(query, {
      deliberationId: '11111111-1111-4111-8111-111111111111',
      outcome: 'accepted',
      summary: 'Should not close while verifier is silent.',
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'deliberation_silence'
  );
});

test('Foundry deliberation requires qualified acceptance when dissent is recorded', async () => {
  const query = async (text) => {
    if (text.includes('cm_foundry_deliberation_participant')) {
      return { rows: [{ participant_id: 'p1', role: 'planner' }] };
    }
    if (text.includes('cm_foundry_deliberation_event')) {
      return {
        rows: [
          { participant_id: 'p1', event_type: 'decision' },
          { participant_id: 'p1', event_type: 'dissent' },
        ],
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  await assert.rejects(
    completeFoundryDeliberation(query, {
      deliberationId: '11111111-1111-4111-8111-111111111111',
      outcome: 'accepted',
      summary: 'Dissent exists.',
    }),
    (error) => error instanceof FoundryRuntimeError && error.code === 'dissent_requires_qualified_outcome'
  );
});
