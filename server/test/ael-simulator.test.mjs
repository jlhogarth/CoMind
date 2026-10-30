import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateAelScenario } from '../dist/ael/index.js';

function scenario(seed = 'alpha-seed') {
  return {
    scenarioId: 'AEL-002-multisource-test',
    seed,
    baseTime: '2026-10-30T16:00:00.000Z',
    tenantId: 'comind-test',
    projectId: 'COMIND',
    captureAuthorityRef: 'authorization:ael-002:synthetic',
    classification: 'INTERNAL',
    retentionProfileRef: 'EPHEMERAL',
    residencyProfileRef: 'COMIND-TEST-US',
    lifecycleState: 'transient',
    sources: [
      {
        sourceKey: 'dashcam-front',
        sourceKind: 'camera',
        modality: 'video',
        eventCount: 4,
        cadenceMs: 1000,
        clockOffsetMs: 20,
        clockUncertaintyMs: 50,
        missingSequences: [2],
        duplicateSequences: [1],
      },
      {
        sourceKey: 'navigation-primary',
        sourceKind: 'navigation',
        modality: 'navigation',
        eventCount: 3,
        cadenceMs: 1500,
        startOffsetMs: 250,
        clockOffsetMs: -15,
        clockUncertaintyMs: 10,
        missingSequences: [],
        duplicateSequences: [],
      },
    ],
  };
}

test('AEL simulator is deterministic for the same scenario and seed', () => {
  const first = simulateAelScenario(scenario());
  const second = simulateAelScenario(scenario());
  assert.deepEqual(first, second);
  assert.equal(first.diagnostics.sourceCount, 2);
});

test('AEL simulator represents missingness as diagnostics and duplicates as identical deliveries', () => {
  const result = simulateAelScenario(scenario());
  assert.equal(result.events.length, 7);
  assert.equal(result.diagnostics.uniqueEventCount, 6);
  assert.equal(result.diagnostics.deliveryCount, 7);
  assert.equal(result.diagnostics.gaps.length, 1);
  assert.equal(result.diagnostics.duplicates.length, 1);

  const gap = result.diagnostics.gaps[0];
  assert.equal(gap.sourceKey, 'dashcam-front');
  assert.equal(gap.missingSequence, 2);
  const gapSourceEvents = result.events.filter((event) => event.sourceId === gap.sourceId);
  assert.equal(gapSourceEvents.some((event) => event.sourceSequence === 2), false);

  const duplicate = result.diagnostics.duplicates[0];
  const deliveries = result.events.filter((event) => event.eventId === duplicate.eventId);
  assert.equal(deliveries.length, 2);
  assert.deepEqual(deliveries[0], deliveries[1]);
  assert.equal(deliveries[0].sourceEventId, duplicate.sourceEventId);
});

test('AEL simulator changes generated event identity with seed while keeping source identity stable', () => {
  const first = simulateAelScenario(scenario('alpha-seed'));
  const second = simulateAelScenario(scenario('beta-seed'));
  assert.notDeepEqual(first, second);

  const firstSources = [...new Set(first.events.map((event) => event.sourceId))].sort();
  const secondSources = [...new Set(second.events.map((event) => event.sourceId))].sort();
  assert.deepEqual(firstSources, secondSources);
  assert.notEqual(first.events[0].eventId, second.events[0].eventId);
});

test('AEL simulator preserves configured clock uncertainty without fabricating exact time', () => {
  const result = simulateAelScenario(scenario());
  const dashcam = result.events.filter((event) => event.sourceKind === 'camera');
  assert.ok(dashcam.length > 0);
  for (const event of dashcam) {
    assert.equal(event.clockUncertaintyMs, 50);
    const delta = Date.parse(event.occurredAtStart) - Date.parse(event.observedAt);
    assert.ok(delta >= -30 && delta <= 70);
  }
});

test('AEL simulator rejects impossible missing/duplicate configuration and credential material', () => {
  const impossible = scenario();
  impossible.sources[0].missingSequences = [1];
  impossible.sources[0].duplicateSequences = [1];
  assert.throws(() => simulateAelScenario(impossible), /both missing and duplicate/i);

  const secret = scenario();
  secret.sources[0].providerRef = 'Bearer abcdefghijklmnopqrstuvwxyz123456';
  assert.throws(() => simulateAelScenario(secret), /credential material/i);
});
