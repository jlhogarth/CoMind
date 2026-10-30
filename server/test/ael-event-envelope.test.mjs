import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AEL_SCHEMA_VERSION,
  createAelEventEnvelope,
  parseAelEventEnvelope,
  verifyAelEventEnvelope,
} from '../dist/ael/index.js';

function validBody() {
  return {
    schemaVersion: AEL_SCHEMA_VERSION,
    eventId: '11111111-1111-4111-8111-111111111111',
    sourceId: '22222222-2222-4222-8222-222222222222',
    sourceEventId: '33333333-3333-4333-8333-333333333333',
    sourceKind: 'synthetic',
    modality: 'sensor',
    providerRef: 'synthetic-provider',
    tenantId: 'comind-test',
    projectId: 'COMIND',
    captureAuthorityRef: 'authorization:ael-002:synthetic',
    occurredAtStart: '2026-10-30T16:00:00.000Z',
    occurredAtEnd: '2026-10-30T16:00:00.100Z',
    observedAt: '2026-10-30T16:00:00.125Z',
    ingestedAt: '2026-10-30T16:00:00.150Z',
    clockSource: 'ael.synthetic.clock',
    clockUncertaintyMs: 25,
    sourceSequence: 0,
    correlationId: '44444444-4444-4444-8444-444444444444',
    traceId: '0123456789abcdef0123456789abcdef',
    classification: 'INTERNAL',
    retentionProfileRef: 'EPHEMERAL',
    residencyProfileRef: 'COMIND-TEST-US',
    contentRef: 'synthetic://ael/ael-002/source/0',
    contentHash: 'a'.repeat(64),
    provenance: [],
    generation: {
      kind: 'synthetic',
      scenarioId: 'AEL-002-envelope-test',
      seedFingerprint: 'b'.repeat(64),
      generatorVersion: 'ael-sim-v1',
    },
    lifecycleState: 'transient',
    flags: {
      gap: false,
      duplicate: false,
      corrupted: false,
      partial: false,
    },
  };
}

test('AEL envelope creation is bounded, canonical, and integrity-verifiable', () => {
  const envelope = createAelEventEnvelope(validBody());
  assert.equal(envelope.schemaVersion, AEL_SCHEMA_VERSION);
  assert.match(envelope.envelopeDigest, /^[a-f0-9]{64}$/);
  assert.equal(verifyAelEventEnvelope(envelope), true);
  assert.deepEqual(parseAelEventEnvelope(envelope), envelope);
});

test('AEL envelope detects post-creation tampering', () => {
  const envelope = createAelEventEnvelope(validBody());
  const tampered = structuredClone(envelope);
  tampered.contentRef = 'synthetic://ael/ael-002/source/tampered';
  assert.equal(verifyAelEventEnvelope(tampered), false);
  assert.throws(() => parseAelEventEnvelope(tampered), /integrity mismatch/i);
});

test('AEL envelope rejects an interval whose end precedes its start', () => {
  const body = validBody();
  body.occurredAtEnd = '2026-10-30T15:59:59.999Z';
  assert.throws(() => createAelEventEnvelope(body), /interval end precedes/i);
});

test('AEL envelope rejects unsupported epistemic fields instead of laundering inference into observation', () => {
  const body = { ...validBody(), inference: 'this must not be an AEL observation field' };
  assert.throws(() => createAelEventEnvelope(body));
});

test('AEL envelope rejects invalid classification, uncertainty, content hash, and provenance', () => {
  assert.throws(() => createAelEventEnvelope({ ...validBody(), classification: 'PRIVATE' }));
  assert.throws(() => createAelEventEnvelope({ ...validBody(), clockUncertaintyMs: -1 }));
  assert.throws(() => createAelEventEnvelope({ ...validBody(), contentHash: 'not-a-sha256' }));
  assert.throws(() => createAelEventEnvelope({
    ...validBody(),
    provenance: [{ relation: 'derived_from', sourceId: 'bad-id', sourceEventId: 'also-bad' }],
  }));
});

test('AEL envelope rejects credential material through the canonical continuity guard', () => {
  const body = validBody();
  body.providerRef = 'Bearer abcdefghijklmnopqrstuvwxyz123456';
  assert.throws(() => createAelEventEnvelope(body), /credential material/i);
});
