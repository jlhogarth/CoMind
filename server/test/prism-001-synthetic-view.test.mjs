import assert from 'node:assert/strict';
import test from 'node:test';
import { loadManifest, sha256Object, stableStringify, validateManifest } from '../../scripts/hai_009_continuity_pilot.mjs';
import { projectSyntheticView } from '../../scripts/prism_001_synthetic_view.mjs';

const manifest = loadManifest();
const subjectId = 'synthetic:atlas:subject-a';
const purposeId = 'synthetic:atlas:assistant';
const now = '2026-11-13T00:00:00Z';
const grant = { mockOnly: true, subjectId, purposeId, status: 'granted',
  validFrom: '2026-11-01T00:00:00Z', validUntil: '2026-12-01T00:00:00Z' };
const request = { subjectId, purposeId, mode: 'current', now, asOf: now };

function source(id, changes = {}) {
  const record = { id: `synthetic:atlas:${id}`, subjectId, speakerSubjectId: subjectId,
    speakerRole: 'user', sourceClass: 'explicit', epistemicStatus: 'current',
    itemId: 'launch_date', value: '2026-11-12', sourceRef: 'synthetic:unused',
    validFrom: '2026-11-10T00:00:00Z', validUntil: null, ...changes };
  // HAI source references are test-only fixture identities, not live archive references.
  record.sourceDigest = sha256Object({ sourceRef: record.sourceRef,
    speakerRole: record.speakerRole, speakerSubjectId: record.speakerSubjectId, value: record.value });
  return record;
}

// Reuse the frozen Atlas reference and scoring contract; fixture observations are not runtime results.
const atlas = manifest.fixtures.find((fixture) => fixture.id === 'ATLAS_RELEASE');
const corrected = source('corrected', { sourceRef: atlas.referenceState.provenanceRequired.launch_date });
const old = source('old', { value: '2026-11-05', sourceRef: 'src:atlas:01',
  epistemicStatus: 'superseded', historicalItemId: atlas.referenceState.supersededItemIds[0],
  validFrom: '2026-11-01T00:00:00Z', validUntil: '2026-11-10T00:00:00Z' });

test('frozen HAI-009 manifest and synthetic correction are reused without redefining scores', () => {
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(atlas.referenceStateHash, sha256Object(atlas.referenceState));
  assert.deepEqual(projectSyntheticView({ manifest, records: [old, corrected], grant, request }).eligible,
    [{ itemId: 'launch_date', value: '2026-11-12', sourceRef: corrected.sourceRef,
      viewStatus: 'current', sourceDigest: corrected.sourceDigest }]);
});

test('historical as-of returns old value labeled historical, never as current', () => {
  const historical = { ...request, mode: 'historical', asOf: '2026-11-06T00:00:00Z' };
  assert.deepEqual(projectSyntheticView({ manifest, records: [old, corrected], grant, request: historical }).eligible,
    [{ itemId: 'launch_date', value: '2026-11-05', sourceRef: old.sourceRef,
      viewStatus: 'historical', sourceDigest: old.sourceDigest }]);
});

test('assistant, other subject, inference, simulation, stale value, and false provenance cannot enter current view', () => {
  const bad = [
    source('assistant', { speakerRole: 'assistant' }),
    source('other', { subjectId: 'synthetic:atlas:subject-b', speakerSubjectId: 'synthetic:atlas:subject-b' }),
    source('inferred', { sourceClass: 'inferred', epistemicStatus: 'candidate' }),
    source('simulated', { sourceClass: 'simulated', epistemicStatus: 'candidate' }),
    old,
    { ...corrected, id: 'synthetic:atlas:tampered', sourceDigest: 'sha256:wrong' },
    source('missing-span', { sourceRef: 'synthetic:atlas:missing-span' }),
  ];
  const result = projectSyntheticView({ manifest, records: bad, grant, request });
  assert.deepEqual(result.eligible, []);
  assert.equal(result.rejected.length, bad.length);
});

test('revocation, expiry, wrong purpose, wrong subject, and non-mock grant deny even correct source', () => {
  for (const change of [
    { status: 'revoked' }, { validUntil: now }, { purposeId: 'synthetic:atlas:research' },
    { subjectId: 'synthetic:atlas:subject-b' },
  ]) {
    assert.deepEqual(projectSyntheticView({ manifest, records: [corrected], grant: { ...grant, ...change }, request }).eligible, []);
  }
  assert.throws(() => projectSyntheticView({ manifest, records: [corrected], grant: { ...grant, mockOnly: false }, request }), /mock consent/);
});

test('tampered HAI reference, invalid clocks, duplicate IDs and conflicting current items fail closed', () => {
  const tampered = structuredClone(manifest);
  tampered.fixtures.find((fixture) => fixture.id === 'ATLAS_RELEASE').referenceState.currentValues.launch_date = '2026-11-05';
  assert.throws(() => projectSyntheticView({ manifest: tampered, records: [corrected], grant, request }), /hash mismatch/);
  assert.throws(() => projectSyntheticView({ manifest, records: [corrected], grant, request: { ...request, asOf: '2026-11-14T00:00:00Z' } }), /Invalid synthetic view request/);
  assert.throws(() => projectSyntheticView({ manifest, records: [corrected, corrected], grant, request }), /Duplicate source identity/);
  assert.throws(() => projectSyntheticView({ manifest, records: [corrected, { ...corrected, id: 'synthetic:atlas:duplicate-current' }], grant, request }), /Ambiguous eligible item/);
});

test('exact same inputs replay to identical read-only projection', () => {
  const input = { manifest, records: [old, corrected], grant, request };
  assert.equal(stableStringify(projectSyntheticView(input)), stableStringify(projectSyntheticView(input)));
});
