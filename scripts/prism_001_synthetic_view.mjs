import { sha256Object } from './hai_009_continuity_pilot.mjs';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10) ? time : null;
}

function synthetic(value) {
  return typeof value === 'string' && /^synthetic:[a-z0-9:._-]+$/.test(value);
}

// Local synthetic proof only. A grant here is a fixture, never a RuleBook/PM decision.
export function projectSyntheticView({ manifest, records, grant, request }) {
  if (!object(manifest) || manifest.protocolId !== 'HAI-009-CONTINUITY-PILOT-v1'
    || !Array.isArray(manifest.fixtures)) throw new Error('HAI-009 protocol unavailable');
  const fixture = manifest.fixtures.find((candidate) => candidate.id === 'ATLAS_RELEASE');
  if (!fixture || fixture.referenceStateHash !== sha256Object(fixture.referenceState)) {
    throw new Error('HAI-009 Atlas reference hash mismatch');
  }
  if (!object(request) || !synthetic(request.subjectId) || !synthetic(request.purposeId)
    || !['current', 'historical'].includes(request.mode)
    || instant(request.now) === null || instant(request.asOf) === null
    || instant(request.asOf) > instant(request.now)) throw new Error('Invalid synthetic view request');
  if (!object(grant) || grant.mockOnly !== true || !synthetic(grant.subjectId)
    || !synthetic(grant.purposeId) || instant(grant.validFrom) === null
    || instant(grant.validUntil) === null || !['granted', 'revoked'].includes(grant.status)) {
    throw new Error('Invalid mock consent grant');
  }
  if (!Array.isArray(records) || records.some((record) => !object(record) || !synthetic(record.id)
    || !synthetic(record.subjectId) || !synthetic(record.speakerSubjectId)
    || !(synthetic(record.sourceRef) || /^src:atlas:\d\d$/.test(record.sourceRef)) || typeof record.itemId !== 'string'
    || typeof record.value !== 'string' || !['user', 'assistant', 'other'].includes(record.speakerRole)
    || !['explicit', 'inferred', 'simulated'].includes(record.sourceClass)
    || !['current', 'superseded', 'candidate'].includes(record.epistemicStatus)
    || instant(record.validFrom) === null || (record.validUntil !== null && instant(record.validUntil) === null)
    || typeof record.sourceDigest !== 'string')) throw new Error('Invalid synthetic source record');
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error('Duplicate source identity');

  const consentAllowed = grant.status === 'granted'
    && grant.subjectId === request.subjectId && grant.purposeId === request.purposeId
    && instant(grant.validFrom) <= instant(request.now) && instant(request.now) < instant(grant.validUntil);
  const at = instant(request.asOf);
  const eligible = [];
  const rejected = [];
  for (const record of records) {
    const expectedCurrent = fixture.referenceState.provenanceRequired[record.itemId];
    const correction = fixture.referenceState.corrections.find((item) => item.itemId === record.itemId);
    const digest = sha256Object({ sourceRef: record.sourceRef, speakerRole: record.speakerRole,
      speakerSubjectId: record.speakerSubjectId, value: record.value });
    const common = consentAllowed && record.subjectId === request.subjectId
      && record.speakerSubjectId === request.subjectId && record.speakerRole === 'user'
      && record.sourceClass === 'explicit' && record.sourceDigest === digest
      && at >= instant(record.validFrom)
      && (record.validUntil === null || at < instant(record.validUntil));
    const current = request.mode === 'current' && record.epistemicStatus === 'current'
      && expectedCurrent === record.sourceRef
      && fixture.referenceState.currentValues[record.itemId] === record.value;
    const historical = request.mode === 'historical' && record.epistemicStatus === 'superseded'
      && correction?.supersededValue === record.value
      && fixture.referenceState.supersededItemIds.includes(record.historicalItemId)
      && record.sourceRef !== expectedCurrent;
    if (common && (current || historical)) {
      eligible.push({ itemId: record.itemId, value: record.value, sourceRef: record.sourceRef,
        viewStatus: current ? 'current' : 'historical', sourceDigest: record.sourceDigest });
    } else {
      rejected.push(record.id);
    }
  }
  if (new Set(eligible.map((entry) => entry.itemId)).size !== eligible.length) {
    throw new Error('Ambiguous eligible item');
  }
  return { fixtureId: fixture.id, referenceStateHash: fixture.referenceStateHash,
    mode: request.mode, eligible: eligible.sort((a, b) => a.itemId.localeCompare(b.itemId)), rejected: rejected.sort() };
}
