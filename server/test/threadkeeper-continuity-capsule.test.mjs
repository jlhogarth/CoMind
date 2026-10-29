import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createContinuityCapsule,
  createContinuityPrecondition,
  STRICT_CONTINUITY_FIDELITY_POLICY,
  validateContinuityCapsuleFidelity,
  validateContinuityPrecondition,
  verifyContinuityCapsule,
} from '../dist/continuity/capsule.js';
import { fingerprintCanonicalValue } from '../dist/continuity/checkpoint.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);
const CHECKPOINT_A = 'checkpoint:tk008:a';
const CHECKPOINT_B = 'checkpoint:tk008:b';

function handoff(overrides = {}) {
  return {
    version: 'continuity-handoff-v1',
    scopeSemanticKey: 'plan:comind.threadkeeper.tk008',
    currentCheckpoint: {
      checkpointId: CHECKPOINT_A,
      parentCheckpointId: null,
      persistenceSeq: '41',
      acceptedAt: '2026-10-29T12:00:00.000Z',
      acceptedByRef: 'actor:founder',
      authorityEvidenceRef: 'authority:founder:tk008',
      policyRef: 'policy:threadkeeper:continuity',
      stateDigest: HEX_A,
      proposalDigest: HEX_B,
    },
    lineage: {
      checkpointIds: [CHECKPOINT_A],
      depth: 1,
    },
    unresolvedCases: [
      {
        caseId: 'case-tk008-1',
        caseKey: 'case:tk008:1',
        state: 'ROUTED',
        latestTransitionId: 'transition:tk008:1',
        lastTransitionAt: '2026-10-29T12:01:00.000Z',
      },
    ],
    continuityDigest: HEX_C,
    consumer: {
      consumerRef: 'consumer:tk008:test',
      providerRef: 'provider:test',
      actorRef: 'actor:test',
      authorityMode: 'requires_independent_validation',
      resolvedAt: '2026-10-29T12:02:00.000Z',
    },
    ...overrides,
  };
}

const references = {
  objectiveRefs: ['objective:preserve-governed-continuity'],
  decisionRefs: ['decision:tk008:portable-capsule'],
  assumptionRefs: ['assumption:tk008:source-evidence-available'],
  obligationRefs: ['obligation:tk008:revalidate-before-action'],
  prohibitedActionRefs: ['prohibition:tk008:no-authority-inheritance'],
  openQuestionRefs: ['question:tk008:consumer-capability'],
  evidenceRefs: ['evidence:tk008:handoff', 'evidence:tk008:checkpoint'],
};

function capsule(overrides = {}) {
  return createContinuityCapsule({
    handoff: handoff(overrides.handoff),
    references: overrides.references ?? references,
    authorityEvidenceRefs: overrides.authorityEvidenceRefs ?? ['authority:tk008:consumer-must-revalidate'],
    policyRefs: overrides.policyRefs ?? ['policy:tk008:propagation'],
    sensitivity: overrides.sensitivity ?? 'confidential',
    retentionClass: overrides.retentionClass ?? 'durable',
    issuedAt: overrides.issuedAt ?? '2026-10-29T12:03:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-10-30T12:03:00.000Z',
  });
}

function redigest(value) {
  const clone = structuredClone(value);
  delete clone.capsuleDigest;
  return { ...clone, capsuleDigest: fingerprintCanonicalValue(clone) };
}

test('TK-008 capsule is deterministic, reference-oriented, integrity protected, and authority neutral', () => {
  const first = capsule();
  const second = capsule({
    references: {
      ...references,
      evidenceRefs: [...references.evidenceRefs].reverse(),
    },
    authorityEvidenceRefs: ['authority:tk008:consumer-must-revalidate'],
    policyRefs: ['policy:tk008:propagation'],
  });

  assert.equal(first.version, 'continuity-capsule-v1');
  assert.equal(first.currentCheckpoint.checkpointId, CHECKPOINT_A);
  assert.equal(first.continuityDigest, HEX_C);
  assert.equal(first.authority.mode, 'requires_independent_validation');
  assert.equal(first.authority.inheritance, 'forbidden');
  assert.deepEqual(first.unresolvedCaseRefs, ['threadkeeper-case:case-tk008-1']);
  assert.equal(first.capsuleDigest, second.capsuleDigest);
  assert.equal(verifyContinuityCapsule(first, '2026-10-29T13:00:00.000Z'), true);

  const tampered = structuredClone(first);
  tampered.references.decisionRefs = ['decision:attacker:substitution'];
  assert.equal(verifyContinuityCapsule(tampered), false);
});

test('TK-008 capsule rejects credential material, duplicate references, oversized references, and invalid authority handoff', () => {
  assert.throws(() => capsule({
    references: {
      ...references,
      evidenceRefs: ['postgresql://user:supersecretpassword@db.example.invalid:5432/comind'],
    },
  }), /credential material/i);

  assert.throws(() => capsule({
    references: {
      ...references,
      decisionRefs: ['decision:duplicate', 'decision:duplicate'],
    },
  }), /Duplicate decision references/);

  assert.throws(() => capsule({
    references: {
      ...references,
      objectiveRefs: ['x'.repeat(1025)],
    },
  }), /Invalid objective references/);

  assert.throws(() => capsule({
    handoff: {
      consumer: {
        ...handoff().consumer,
        authorityMode: 'inherited',
      },
    },
  }), /independent downstream authority validation/);
});

test('TK-008 precondition validates current continuity and fails closed on stale, expired, substituted, and weakened state', () => {
  const source = capsule();
  const precondition = createContinuityPrecondition(source);

  assert.deepEqual(
    validateContinuityPrecondition(precondition, handoff(), '2026-10-29T13:00:00.000Z'),
    { valid: true, status: 'valid' }
  );

  const staleHandoff = handoff({
    currentCheckpoint: {
      ...handoff().currentCheckpoint,
      checkpointId: CHECKPOINT_B,
      parentCheckpointId: CHECKPOINT_A,
    },
    lineage: { checkpointIds: [CHECKPOINT_A, CHECKPOINT_B], depth: 2 },
  });
  assert.deepEqual(
    validateContinuityPrecondition(precondition, staleHandoff, '2026-10-29T13:00:00.000Z'),
    { valid: false, status: 'stale_checkpoint' }
  );

  assert.deepEqual(
    validateContinuityPrecondition(
      precondition,
      handoff({ continuityDigest: HEX_A }),
      '2026-10-29T13:00:00.000Z'
    ),
    { valid: false, status: 'continuity_digest_mismatch' }
  );

  assert.deepEqual(
    validateContinuityPrecondition(precondition, handoff(), '2026-10-30T12:03:00.000Z'),
    { valid: false, status: 'expired' }
  );

  assert.deepEqual(
    validateContinuityPrecondition(
      precondition,
      handoff({ scopeSemanticKey: 'plan:other-scope' }),
      '2026-10-29T13:00:00.000Z'
    ),
    { valid: false, status: 'scope_mismatch' }
  );

  assert.deepEqual(
    validateContinuityPrecondition(
      precondition,
      handoff({
        consumer: {
          ...handoff().consumer,
          authorityMode: 'inherited',
        },
      }),
      '2026-10-29T13:00:00.000Z'
    ),
    { valid: false, status: 'authority_contract_mismatch' }
  );

  const tamperedPrecondition = { ...precondition, expectedCheckpointId: CHECKPOINT_B };
  assert.deepEqual(
    validateContinuityPrecondition(tamperedPrecondition, handoff(), '2026-10-29T13:00:00.000Z'),
    { valid: false, status: 'integrity_mismatch' }
  );
});

test('TK-008 strict fidelity passes equivalent capsules and detects lost protected semantics', () => {
  const source = capsule();
  const equivalent = capsule({
    references: {
      objectiveRefs: [...references.objectiveRefs],
      decisionRefs: [...references.decisionRefs],
      assumptionRefs: [...references.assumptionRefs],
      obligationRefs: [...references.obligationRefs],
      prohibitedActionRefs: [...references.prohibitedActionRefs],
      openQuestionRefs: [...references.openQuestionRefs],
      evidenceRefs: [...references.evidenceRefs].reverse(),
    },
    issuedAt: '2026-10-29T12:04:00.000Z',
    expiresAt: '2026-10-30T12:03:00.000Z',
  });

  assert.deepEqual(
    validateContinuityCapsuleFidelity(source, equivalent, STRICT_CONTINUITY_FIDELITY_POLICY),
    { status: 'PASS', preserved: true, reasons: [] }
  );

  const degraded = capsule({
    references: {
      ...references,
      decisionRefs: [],
      obligationRefs: [],
      prohibitedActionRefs: [],
      openQuestionRefs: [],
      evidenceRefs: ['evidence:tk008:handoff'],
    },
  });
  const report = validateContinuityCapsuleFidelity(source, degraded);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.preserved, false);
  assert.ok(report.reasons.includes('decision_reference_lost'));
  assert.ok(report.reasons.includes('obligation_reference_lost'));
  assert.ok(report.reasons.includes('prohibition_reference_lost'));
  assert.ok(report.reasons.includes('open_question_reference_lost'));
  assert.ok(report.reasons.includes('evidence_reference_lost'));
});

test('TK-008 fidelity detects scope/checkpoint substitution, lineage drift, sensitivity/retention weakening, and expiry extension', () => {
  const source = capsule();
  const replacementHandoff = handoff({
    scopeSemanticKey: 'plan:substituted-scope',
    currentCheckpoint: {
      ...handoff().currentCheckpoint,
      checkpointId: CHECKPOINT_B,
      parentCheckpointId: CHECKPOINT_A,
    },
    lineage: { checkpointIds: [CHECKPOINT_A, CHECKPOINT_B], depth: 2 },
    continuityDigest: HEX_A,
  });
  const replacement = createContinuityCapsule({
    handoff: replacementHandoff,
    references,
    authorityEvidenceRefs: ['authority:tk008:consumer-must-revalidate'],
    policyRefs: ['policy:tk008:propagation'],
    sensitivity: 'public',
    retentionClass: 'transient',
    issuedAt: '2026-10-29T12:04:00.000Z',
    expiresAt: '2026-11-01T12:03:00.000Z',
  });

  const report = validateContinuityCapsuleFidelity(source, replacement);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.reasons.includes('scope_substituted'));
  assert.ok(report.reasons.includes('checkpoint_substituted'));
  assert.ok(report.reasons.includes('continuity_digest_changed'));
  assert.ok(report.reasons.includes('lineage_changed'));
  assert.ok(report.reasons.includes('sensitivity_weakened'));
  assert.ok(report.reasons.includes('retention_changed'));
  assert.ok(report.reasons.includes('expiry_extended'));
});

test('TK-008 fidelity rejects authority weakening even if an attacker recomputes a digest', () => {
  const source = capsule();
  const weakened = structuredClone(source);
  weakened.authority.mode = 'inherited';
  weakened.authority.inheritance = 'allowed';
  const attackerRedigested = redigest(weakened);

  const report = validateContinuityCapsuleFidelity(source, attackerRedigested);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.reasons.includes('candidate_integrity_invalid'));
});
