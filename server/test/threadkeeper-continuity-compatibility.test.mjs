import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createContinuityCompatibilityManifest,
  createContinuityCompatibilityRuleset,
  evaluateContinuityCompatibility,
  reconstructContinuityAsOf,
  reconstructContinuityAtCheckpoint,
  verifyContinuityCompatibilityManifest,
  verifyContinuityCompatibilityRuleset,
} from '../dist/continuity/compatibility.js';
import { createContinuityCapsule } from '../dist/continuity/capsule.js';
import { fingerprintCanonicalValue } from '../dist/continuity/checkpoint.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

function contract(kind, ref, version, overrides = {}) {
  return {
    contractKind: kind,
    contractRef: ref,
    versionRef: version,
    required: overrides.required ?? true,
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${kind}:${ref}:${version}`],
    sourceRef: overrides.sourceRef ?? `source:${kind}:${ref}`,
  };
}

function manifest(checkpointId, contracts, overrides = {}) {
  return createContinuityCompatibilityManifest({
    scopeSemanticKey: overrides.scopeSemanticKey ?? 'plan:tk010:test',
    checkpointId,
    recordedAt: overrides.recordedAt ?? '2026-10-29T17:30:00.000Z',
    contracts,
  });
}

function rule(id, kind, ref, from, to, disposition, overrides = {}) {
  return {
    ruleId: id,
    contractKind: kind,
    contractRef: ref,
    fromVersionRef: from,
    toVersionRef: to,
    disposition,
    assertionMode: overrides.assertionMode ?? 'explicit_evidence',
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:rule:${id}`],
    actionRefs: overrides.actionRefs ?? (
      disposition === 'MIGRATION_REQUIRED' || disposition === 'REVALIDATION_REQUIRED'
        ? [`action:${id}`]
        : []
    ),
    sourceRef: overrides.sourceRef ?? `source:rule:${id}`,
    observedAt: overrides.observedAt ?? '2026-10-29T17:31:00.000Z',
    status: overrides.status ?? 'current',
  };
}

function makeHandoff({ checkpointId, parentCheckpointId = null, acceptedAt, lineage, scope = 'plan:tk010:history' }) {
  const canonical = {
    version: 'continuity-handoff-v1',
    scopeSemanticKey: scope,
    currentCheckpoint: {
      checkpointId,
      parentCheckpointId,
      persistenceSeq: String(lineage.length),
      acceptedAt,
      acceptedByRef: 'actor:founder',
      authorityEvidenceRef: 'authority:tk010',
      policyRef: 'policy:continuity',
      stateDigest: HEX_A,
      proposalDigest: HEX_B,
    },
    lineage: { checkpointIds: lineage, depth: lineage.length },
    unresolvedCases: [],
  };
  return {
    ...canonical,
    continuityDigest: fingerprintCanonicalValue(canonical),
    consumer: {
      consumerRef: 'consumer:tk010:test',
      providerRef: 'provider:test',
      actorRef: 'actor:test',
      authorityMode: 'requires_independent_validation',
      resolvedAt: acceptedAt,
    },
  };
}

function capsule({ checkpointId, parentCheckpointId = null, acceptedAt, issuedAt, expiresAt, lineage, suffix }) {
  return createContinuityCapsule({
    handoff: makeHandoff({ checkpointId, parentCheckpointId, acceptedAt, lineage }),
    references: {
      objectiveRefs: [`objective:${suffix}`],
      decisionRefs: [`decision:${suffix}`],
      assumptionRefs: [`assumption:${suffix}`],
      obligationRefs: [`obligation:${suffix}`],
      prohibitedActionRefs: [`prohibition:${suffix}`],
      openQuestionRefs: [`question:${suffix}`],
      evidenceRefs: [`evidence:${suffix}`],
    },
    authorityEvidenceRefs: [`authority:consumer:${suffix}`],
    policyRefs: [`policy:propagation:${suffix}`],
    sensitivity: 'confidential',
    retentionClass: 'durable',
    issuedAt,
    expiresAt,
  });
}

test('TK-010 manifests are deterministic, evidence-backed, and tamper evident', () => {
  const first = manifest('cp:1', [
    contract('schema', 'schema:archive', '17.1'),
    contract('rulebook', 'rulebook:core', 'v7'),
  ]);
  const second = manifest('cp:1', [
    contract('rulebook', 'rulebook:core', 'v7'),
    contract('schema', 'schema:archive', '17.1'),
  ]);
  assert.equal(first.manifestDigest, second.manifestDigest);
  assert.equal(verifyContinuityCompatibilityManifest(first), true);

  const tampered = structuredClone(first);
  tampered.contracts[0].versionRef = 'attacker-version';
  assert.equal(verifyContinuityCompatibilityManifest(tampered), false);

  assert.throws(() => manifest('cp:1', [
    contract('schema', 'schema:archive', '17.1'),
    contract('schema', 'schema:archive', '17.2'),
  ]), /Duplicate continuity contract identity/);
  assert.throws(() => manifest('cp:1', [
    contract('schema', 'schema:archive', '17.1', { evidenceRefs: [] }),
  ]), /requires evidence/);
});

test('TK-010 never infers compatibility from version strings', () => {
  const source = manifest('cp:1', [
    contract('rulebook', 'rulebook:core', 'v7'),
    contract('schema', 'schema:archive', '17.1'),
  ]);
  const current = manifest('cp:2', [
    contract('rulebook', 'rulebook:core', 'v8'),
    contract('schema', 'schema:archive', '17.1'),
  ]);
  const report = evaluateContinuityCompatibility(source, current, createContinuityCompatibilityRuleset([]));
  assert.equal(report.disposition, 'REVALIDATION_REQUIRED');
  assert.equal(report.results.find(item => item.contractRef === 'rulebook:core').reason, 'CHANGED_WITHOUT_RULE');
  assert.equal(report.results.find(item => item.contractRef === 'schema:archive').disposition, 'CONTINUITY_COMPATIBLE');
});

test('TK-010 explicit evidence rules can establish compatibility, migration, or incompatibility', () => {
  const source = manifest('cp:1', [
    contract('rulebook', 'rulebook:core', 'v7'),
    contract('schema', 'schema:runtime', '1'),
    contract('tool', 'tool:handoff', '3'),
  ]);
  const current = manifest('cp:2', [
    contract('rulebook', 'rulebook:core', 'v8'),
    contract('schema', 'schema:runtime', '2'),
    contract('tool', 'tool:handoff', '4'),
  ]);
  const ruleset = createContinuityCompatibilityRuleset([
    rule('r-compatible', 'rulebook', 'rulebook:core', 'v7', 'v8', 'CONTINUITY_COMPATIBLE'),
    rule('r-migrate', 'schema', 'schema:runtime', '1', '2', 'MIGRATION_REQUIRED'),
    rule('r-incompatible', 'tool', 'tool:handoff', '3', '4', 'INCOMPATIBLE'),
  ]);
  const report = evaluateContinuityCompatibility(source, current, ruleset);
  assert.equal(report.disposition, 'INCOMPATIBLE');
  assert.equal(report.results.find(item => item.contractRef === 'rulebook:core').disposition, 'CONTINUITY_COMPATIBLE');
  assert.equal(report.results.find(item => item.contractRef === 'schema:runtime').disposition, 'MIGRATION_REQUIRED');
  assert.deepEqual(report.results.find(item => item.contractRef === 'schema:runtime').actionRefs, ['action:r-migrate']);
  assert.equal(report.results.find(item => item.contractRef === 'tool:handoff').disposition, 'INCOMPATIBLE');
});

test('TK-010 missing and new contracts fail conservatively', () => {
  const source = manifest('cp:1', [
    contract('schema', 'schema:required', '1', { required: true }),
    contract('tool', 'tool:optional', '1', { required: false }),
  ]);
  const current = manifest('cp:2', [
    contract('runtime', 'runtime:new-required', '1', { required: true }),
    contract('provider', 'provider:new-optional', '1', { required: false }),
  ]);
  const report = evaluateContinuityCompatibility(source, current, createContinuityCompatibilityRuleset([]));
  assert.equal(report.disposition, 'INCOMPATIBLE');
  assert.equal(report.results.find(item => item.contractRef === 'schema:required').reason, 'REQUIRED_CONTRACT_MISSING');
  assert.equal(report.results.find(item => item.contractRef === 'tool:optional').disposition, 'REVALIDATION_REQUIRED');
  assert.equal(report.results.find(item => item.contractRef === 'runtime:new-required').reason, 'NEW_REQUIRED_CONTRACT');
  assert.equal(report.results.find(item => item.contractRef === 'provider:new-optional').disposition, 'CONTINUITY_COMPATIBLE');
});

test('TK-010 rulesets reject inferred, ambiguous, unevidenced, and unactionable migration rules', () => {
  assert.throws(() => createContinuityCompatibilityRuleset([
    rule('r1', 'schema', 'schema:a', '1', '2', 'CONTINUITY_COMPATIBLE', { assertionMode: 'semantic_guess' }),
  ]), /explicit evidence/i);
  assert.throws(() => createContinuityCompatibilityRuleset([
    rule('r1', 'schema', 'schema:a', '1', '2', 'CONTINUITY_COMPATIBLE'),
    rule('r2', 'schema', 'schema:a', '1', '2', 'MIGRATION_REQUIRED'),
  ]), /Ambiguous active compatibility rule transition/);
  assert.throws(() => createContinuityCompatibilityRuleset([
    rule('r1', 'schema', 'schema:a', '1', '2', 'CONTINUITY_COMPATIBLE', { evidenceRefs: [] }),
  ]), /requires evidence/);
  assert.throws(() => createContinuityCompatibilityRuleset([
    rule('r1', 'schema', 'schema:a', '1', '2', 'MIGRATION_REQUIRED', { actionRefs: [] }),
  ]), /requires an action reference/);

  const valid = createContinuityCompatibilityRuleset([
    rule('retired-a', 'schema', 'schema:a', '1', '2', 'CONTINUITY_COMPATIBLE', { status: 'retired' }),
    rule('current-a', 'schema', 'schema:a', '1', '2', 'MIGRATION_REQUIRED'),
  ]);
  assert.equal(verifyContinuityCompatibilityRuleset(valid), true);
});

test('TK-010 as-of reconstruction returns the latest legitimately issued accepted state', () => {
  const c1 = capsule({
    checkpointId: 'cp:1', acceptedAt: '2026-10-29T10:00:00.000Z', issuedAt: '2026-10-29T10:05:00.000Z',
    expiresAt: '2026-10-29T11:05:00.000Z', lineage: ['cp:1'], suffix: 'one',
  });
  const c2 = capsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T11:00:00.000Z', issuedAt: '2026-10-29T11:10:00.000Z',
    expiresAt: '2026-10-29T12:10:00.000Z', lineage: ['cp:1', 'cp:2'], suffix: 'two',
  });
  const c3 = capsule({
    checkpointId: 'cp:3', parentCheckpointId: 'cp:2', acceptedAt: '2026-10-29T12:00:00.000Z', issuedAt: '2026-10-29T12:05:00.000Z',
    expiresAt: '2026-10-29T13:05:00.000Z', lineage: ['cp:1', 'cp:2', 'cp:3'], suffix: 'three',
  });

  const beforeIssuance = reconstructContinuityAsOf([c1, c2, c3], '2026-10-29T10:02:00.000Z');
  assert.equal(beforeIssuance.status, 'NO_ACCEPTED_STATE');
  assert.equal(beforeIssuance.contextUsableAtAsOf, false);

  const first = reconstructContinuityAsOf([c1, c2, c3], '2026-10-29T10:30:00.000Z');
  assert.equal(first.status, 'FOUND');
  assert.equal(first.state.checkpointId, 'cp:1');
  assert.equal(first.contextUsableAtAsOf, true);
  assert.deepEqual(first.state.obligationRefs, ['obligation:one']);

  const acceptedButNotIssued = reconstructContinuityAsOf([c1, c2, c3], '2026-10-29T11:05:00.000Z');
  assert.equal(acceptedButNotIssued.state.checkpointId, 'cp:1');
  assert.equal(acceptedButNotIssued.contextUsableAtAsOf, false);

  const second = reconstructContinuityAsOf([c1, c2, c3], '2026-10-29T11:30:00.000Z');
  assert.equal(second.state.checkpointId, 'cp:2');
  assert.equal(second.contextUsableAtAsOf, true);

  const historicallyRecoverableButExpired = reconstructContinuityAsOf([c1, c2, c3], '2026-10-29T14:00:00.000Z');
  assert.equal(historicallyRecoverableButExpired.state.checkpointId, 'cp:3');
  assert.equal(historicallyRecoverableButExpired.contextUsableAtAsOf, false);
});

test('TK-010 exact-checkpoint reconstruction is read-only and preserves protected references', () => {
  const c1 = capsule({
    checkpointId: 'cp:1', acceptedAt: '2026-10-29T10:00:00.000Z', issuedAt: '2026-10-29T10:05:00.000Z',
    expiresAt: '2026-10-29T11:05:00.000Z', lineage: ['cp:1'], suffix: 'one',
  });
  const c2 = capsule({
    checkpointId: 'cp:2', parentCheckpointId: 'cp:1', acceptedAt: '2026-10-29T11:00:00.000Z', issuedAt: '2026-10-29T11:10:00.000Z',
    expiresAt: '2026-10-29T12:10:00.000Z', lineage: ['cp:1', 'cp:2'], suffix: 'two',
  });
  const result = reconstructContinuityAtCheckpoint([c1, c2], 'cp:2');
  assert.equal(result.status, 'FOUND');
  assert.equal(result.state.checkpointId, 'cp:2');
  assert.deepEqual(result.state.decisionRefs, ['decision:two']);
  assert.deepEqual(result.state.authorityEvidenceRefs, ['authority:consumer:two', 'authority:tk010']);
  assert.equal(Object.isFrozen(result), true);

  const missing = reconstructContinuityAtCheckpoint([c1, c2], 'cp:missing');
  assert.equal(missing.status, 'NO_ACCEPTED_STATE');
  assert.equal(missing.state, null);
  assert.equal(missing.contextUsableAtAsOf, false);
});

test('TK-010 reconstruction rejects tampered, discontinuous, and cross-scope histories', () => {
  const c1 = capsule({
    checkpointId: 'cp:1', acceptedAt: '2026-10-29T10:00:00.000Z', issuedAt: '2026-10-29T10:05:00.000Z',
    expiresAt: '2026-10-29T11:05:00.000Z', lineage: ['cp:1'], suffix: 'one',
  });
  const badLineage = capsule({
    checkpointId: 'cp:3', parentCheckpointId: 'cp:other', acceptedAt: '2026-10-29T11:00:00.000Z', issuedAt: '2026-10-29T11:05:00.000Z',
    expiresAt: '2026-10-29T12:05:00.000Z', lineage: ['cp:other', 'cp:3'], suffix: 'bad',
  });
  assert.throws(() => reconstructContinuityAsOf([c1, badLineage], '2026-10-29T11:30:00.000Z'), /direct accepted checkpoint lineage/);

  const tampered = structuredClone(c1);
  tampered.references.objectiveRefs = ['objective:tampered'];
  assert.throws(() => reconstructContinuityAsOf([tampered], '2026-10-29T10:30:00.000Z'), /Invalid continuity capsule/);

  const otherScope = structuredClone(c1);
  otherScope.scopeSemanticKey = 'plan:other';
  assert.throws(() => reconstructContinuityAsOf([c1, otherScope], '2026-10-29T10:30:00.000Z'), /Invalid continuity capsule|multiple continuity scopes/);
});
