import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONDITION_IDS,
  PRIMARY_METRICS,
  buildPhaseBSchedule,
  buildTelemetryEnvelope,
  loadManifest,
  scoreManifest,
  scoreObservation,
  sha256Object,
  stableStringify,
  validateManifest,
  validateTelemetryEnvelope,
} from '../../scripts/hai_009_continuity_pilot.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return structuredClone(value);
}

function manifest() {
  return loadManifest('config/hai-009-continuity-pilot.v1.json', { repoRoot });
}

test('canonical HAI-009 protocol validates fail-closed', () => {
  const value = manifest();
  assert.deepEqual(validateManifest(value), []);
  assert.equal(value.fixtures.length, 3);
  assert.deepEqual(value.conditions.map((condition) => condition.id), CONDITION_IDS);
  assert.equal(value.phaseA.realParticipantDataAllowed, false);
  assert.equal(value.phaseA.privateUserDataAllowed, false);
  assert.equal(value.phaseA.paidProviderAllowed, false);
  assert.equal(value.phaseA.productionMutationAllowed, false);
  assert.equal(value.phaseBHumanFeasibility.activated, false);
  assert.equal(value.evidenceMapping.parallelEvidenceStoreAuthorized, false);
});

test('Phase B counterbalance schedule is exactly balanced without activating the study', () => {
  const value = manifest();
  const schedule = buildPhaseBSchedule(value);
  assert.equal(schedule.length, 24);
  for (const order of value.phaseBHumanFeasibility.conditionOrders) {
    assert.equal(schedule.filter((row) => row.conditionOrder === order).length, 4);
  }
  for (const order of value.phaseBHumanFeasibility.scenarioOrders) {
    assert.equal(schedule.filter((row) => row.scenarioOrder === order).length, 4);
  }
  assert.equal(value.phaseBHumanFeasibility.activated, false);
});

test('fixture reference-state hashes are stable and exact', () => {
  for (const fixture of manifest().fixtures) {
    assert.equal(fixture.referenceStateHash, sha256Object(fixture.referenceState));
  }
});

test('scoring is deterministic and emits separate metrics without a maturity score', () => {
  const value = manifest();
  const first = scoreManifest(value);
  const second = scoreManifest(value);
  assert.equal(stableStringify(first), stableStringify(second));

  for (const result of first) {
    for (const metric of PRIMARY_METRICS) assert.ok(Object.hasOwn(result.scores, metric));
    for (const prohibited of ['overallScore', 'globalScore', 'haiScore', 'maturityScore']) {
      assert.equal(Object.hasOwn(result.scores, prohibited), false);
    }
  }
});

test('fresh-session condition rejects retained prior history leakage', () => {
  const value = clone(manifest());
  value.fixtures[0].observations.FRESH_SESSION.retainedHistoryItemIds = ['src:atlas:02'];
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('fresh-session condition cannot retain prior history')), errors.join('\n'));
});

test('memory-only condition rejects governed annotations', () => {
  const value = clone(manifest());
  value.fixtures[0].observations.MEMORY_ONLY.governanceAnnotationsPresent = true;
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('memory-only condition cannot contain governed annotations')), errors.join('\n'));
});

test('governed condition rejects missing governance annotations', () => {
  const value = clone(manifest());
  value.fixtures[0].observations.GOVERNED_CONTINUITY.governanceAnnotationsPresent = false;
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('governed condition requires governance annotations')), errors.join('\n'));
});

test('tampered ground truth is detected by immutable fixture hash', () => {
  const value = clone(manifest());
  value.fixtures[0].referenceState.currentValues.launch_date = '2099-01-01';
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('referenceStateHash mismatch')), errors.join('\n'));
});

test('missing telemetry cannot be normalized into complete evidence', () => {
  const value = clone(manifest());
  const fixture = value.fixtures[0];
  const envelope = buildTelemetryEnvelope(value, fixture, 'GOVERNED_CONTINUITY');
  delete envelope.evidenceRef;
  const errors = validateTelemetryEnvelope(value, fixture, 'GOVERNED_CONTINUITY', envelope);
  assert.ok(errors.some((message) => message.includes('telemetry missing required field evidenceRef')), errors.join('\n'));
});

test('missing provenance receives zero provenance credit rather than inferred success', () => {
  const value = manifest();
  const fixture = value.fixtures[0];
  const observation = clone(fixture.observations.GOVERNED_CONTINUITY);
  observation.provenanceByItem = {};
  const envelope = buildTelemetryEnvelope(value, fixture, 'GOVERNED_CONTINUITY');
  const scores = scoreObservation(fixture.referenceState, observation, envelope, value.telemetry.requiredFields);
  assert.equal(scores.provenance_coverage, 0);
  assert.equal(scores.resume_accuracy, 1);
});

test('seeded stale assumption is penalized independently of resume coverage', () => {
  const value = manifest();
  const fixture = value.fixtures[0];
  const envelope = buildTelemetryEnvelope(value, fixture, 'MEMORY_ONLY');
  const memoryScores = scoreObservation(
    fixture.referenceState,
    fixture.observations.MEMORY_ONLY,
    envelope,
    value.telemetry.requiredFields,
  );
  assert.equal(memoryScores.resume_accuracy, 0.75);
  assert.equal(memoryScores.stale_assumption_persistence_rate, 1);
  assert.equal(memoryScores.correction_persistence_rate, 0);
});

test('governed synthetic scoring case preserves corrections, unresolved state, and provenance', () => {
  const value = manifest();
  for (const fixture of value.fixtures) {
    const envelope = buildTelemetryEnvelope(value, fixture, 'GOVERNED_CONTINUITY');
    const scores = scoreObservation(
      fixture.referenceState,
      fixture.observations.GOVERNED_CONTINUITY,
      envelope,
      value.telemetry.requiredFields,
    );
    assert.equal(scores.resume_accuracy, 1);
    assert.equal(scores.correction_persistence_rate, 1);
    assert.equal(scores.stale_assumption_persistence_rate, 0);
    assert.equal(scores.unresolved_commitment_recovery_rate, 1);
    assert.equal(scores.provenance_coverage, 1);
    assert.equal(scores.instrumentation_completeness, 1);
  }
});

test('unknown condition cannot be introduced silently', () => {
  const value = clone(manifest());
  value.conditions.push({
    id: 'UNKNOWN_CONDITION',
    historyMode: 'unknown',
    currentnessAware: false,
    correctionAware: false,
    provenanceRequired: false,
    unresolvedStateRequired: false,
    description: 'Invalid adversarial condition.',
  });
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('conditions must be exactly')), errors.join('\n'));
});

test('Phase B cannot be activated by changing the manifest flag', () => {
  const value = clone(manifest());
  value.phaseBHumanFeasibility.activated = true;
  const errors = validateManifest(value);
  assert.ok(errors.some((message) => message.includes('Phase B must remain not activated')), errors.join('\n'));
});

test('production or paid-provider permission fails the HAI-009 contract', () => {
  for (const field of ['productionMutationAllowed', 'paidProviderAllowed', 'realParticipantDataAllowed', 'privateUserDataAllowed']) {
    const value = clone(manifest());
    value.phaseA[field] = true;
    const errors = validateManifest(value);
    assert.ok(errors.some((message) => message.includes(`phaseA.${field} must be false`)), `${field}: ${errors.join('\n')}`);
  }
});
