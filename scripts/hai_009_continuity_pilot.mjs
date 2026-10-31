#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

export const CONDITION_IDS = ['FRESH_SESSION', 'MEMORY_ONLY', 'GOVERNED_CONTINUITY'];
export const PRIMARY_METRICS = [
  'resume_accuracy',
  'correction_persistence_rate',
  'stale_assumption_persistence_rate',
  'unresolved_commitment_recovery_rate',
  'provenance_coverage',
  'context_reconstruction_effort',
];
export const SECONDARY_METRICS = [
  'relevance_precision',
  'relevance_recall',
  'contradiction_rate',
  'instrumentation_completeness',
];

const OBSERVATION_FIELDS = [
  'historyMode', 'governanceAnnotationsPresent', 'resumedItemIds', 'currentValues',
  'staleItemIds', 'unresolvedRecoveredIds', 'provenanceByItem',
  'retainedHistoryItemIds', 'reconstructionTurns', 'contradictionItemIds', 'expectedScores',
];

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values) {
  return Array.isArray(values) && values.every(nonEmptyString) && new Set(values).size === values.length;
}

function roundMetric(value) {
  if (value === null) return null;
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : roundMetric(numerator / denominator);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Object(value) {
  return `sha256:${crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

export function telemetryCompleteness(envelope, requiredFields) {
  if (!isObject(envelope) || !Array.isArray(requiredFields) || requiredFields.length === 0) return null;
  const present = requiredFields.filter(
    (field) => Object.hasOwn(envelope, field) && envelope[field] !== null && envelope[field] !== undefined,
  ).length;
  return ratio(present, requiredFields.length);
}

export function buildTelemetryEnvelope(manifest, fixture, conditionId) {
  const observation = fixture.observations[conditionId];
  const conditionIndex = CONDITION_IDS.indexOf(conditionId);
  const sourceRefs = [...new Set(Object.values(observation.provenanceByItem).flat())].sort();
  return {
    protocolId: manifest.protocolId,
    protocolVersion: manifest.protocolVersion,
    fixtureId: fixture.id,
    fixtureVersion: fixture.fixtureVersion,
    condition: conditionId,
    syntheticActorId: 'synthetic:hai009:actor:001',
    sessionId: `session:${fixture.id.toLowerCase()}`,
    taskId: `task:${fixture.id.toLowerCase()}:resume`,
    trialId: `trial:${fixture.id.toLowerCase()}:${conditionId.toLowerCase()}`,
    timestamp: `2026-10-30T14:3${conditionIndex + 1}:00Z`,
    sequence: conditionIndex + 1,
    systemVersion: 'hai-009-synthetic-harness-v1',
    modelProvider: 'none-deterministic',
    modelVersion: 'none',
    policyVersion: 'hai-009-continuity-policy-v1',
    toolchainVersion: 'node-24-contract',
    continuityStateVersion: fixture.referenceStateHash,
    authorityProfile: 'C0_SYNTHETIC_READ_ONLY',
    eventType: 'trial_observation_scored',
    sourceRefs,
    correctionLinks: fixture.referenceState.corrections.map((item) => item.sourceRef),
    expectedOutcomeRef: `fixture:${fixture.id}:reference:${fixture.referenceStateHash}`,
    observedOutcomeRef: `fixture:${fixture.id}:observation:${conditionId}`,
    instrumentationQuality: 'complete',
    evidenceRef: `repo:config/hai-009-continuity-pilot.v1.json#${fixture.id}/${conditionId}`,
  };
}

export function validateTelemetryEnvelope(manifest, fixture, conditionId, envelope) {
  const errors = [];
  const prefix = `${fixture.id}/${conditionId}`;
  if (!isObject(envelope)) return [`${prefix}: telemetry must be an object`];
  for (const field of manifest.telemetry.requiredFields) {
    if (!Object.hasOwn(envelope, field) || envelope[field] === null || envelope[field] === undefined) {
      errors.push(`${prefix}: telemetry missing required field ${field}`);
    }
  }
  for (const [field, expected] of Object.entries({
    protocolId: manifest.protocolId,
    protocolVersion: manifest.protocolVersion,
    fixtureId: fixture.id,
    fixtureVersion: fixture.fixtureVersion,
    condition: conditionId,
  })) {
    if (envelope[field] !== expected) errors.push(`${prefix}: telemetry.${field} must equal ${JSON.stringify(expected)}`);
  }
  if (!Number.isInteger(envelope.sequence) || envelope.sequence < 1) errors.push(`${prefix}: telemetry.sequence must be positive integer`);
  if (!manifest.telemetry.requiredEventTypes.includes(envelope.eventType)) errors.push(`${prefix}: unsupported telemetry eventType`);
  if (!manifest.telemetry.instrumentationQualityValues.includes(envelope.instrumentationQuality)) errors.push(`${prefix}: invalid instrumentationQuality`);
  if (!Array.isArray(envelope.sourceRefs) || !Array.isArray(envelope.correctionLinks)) errors.push(`${prefix}: sourceRefs and correctionLinks must be arrays`);
  return errors;
}

export function scoreObservation(referenceState, observation, telemetryEnvelope, requiredTelemetryFields) {
  const required = new Set(referenceState.requiredResumeIds);
  const resumed = new Set(observation.resumedItemIds);
  const corrected = referenceState.corrections.filter(
    (item) => observation.currentValues[item.itemId] === item.correctedValue,
  ).length;
  const superseded = new Set(referenceState.supersededItemIds);
  const stale = new Set(observation.staleItemIds);
  const unresolved = new Set(referenceState.unresolvedItemIds);
  const recovered = new Set(observation.unresolvedRecoveredIds);

  let provenanceCorrect = 0;
  for (const [itemId, sourceRef] of Object.entries(referenceState.provenanceRequired)) {
    if ((observation.provenanceByItem[itemId] ?? []).includes(sourceRef)) provenanceCorrect += 1;
  }

  const relevant = new Set(referenceState.relevantHistoryItemIds);
  const retained = new Set(observation.retainedHistoryItemIds);
  const relevantRetained = [...retained].filter((item) => relevant.has(item)).length;

  return {
    resume_accuracy: ratio([...resumed].filter((item) => required.has(item)).length, required.size),
    correction_persistence_rate: ratio(corrected, referenceState.corrections.length),
    stale_assumption_persistence_rate: ratio([...stale].filter((item) => superseded.has(item)).length, superseded.size),
    unresolved_commitment_recovery_rate: ratio([...recovered].filter((item) => unresolved.has(item)).length, unresolved.size),
    provenance_coverage: ratio(provenanceCorrect, Object.keys(referenceState.provenanceRequired).length),
    context_reconstruction_effort: observation.reconstructionTurns,
    relevance_precision: ratio(relevantRetained, retained.size),
    relevance_recall: ratio(relevantRetained, relevant.size),
    contradiction_rate: ratio(new Set(observation.contradictionItemIds).size, required.size),
    instrumentation_completeness: telemetryCompleteness(telemetryEnvelope, requiredTelemetryFields),
  };
}

export function buildPhaseBSchedule(manifest) {
  const phaseB = manifest.phaseBHumanFeasibility;
  const schedule = [];
  for (let slot = 1; slot <= phaseB.provisionalSampleSize; slot += 1) {
    const block = Math.floor((slot - 1) / phaseB.conditionOrderCount);
    const conditionIndex = (slot - 1) % phaseB.conditionOrderCount;
    const scenarioIndex = (conditionIndex + block) % phaseB.scenarioOrders.length;
    schedule.push({
      participantSlot: slot,
      conditionOrder: phaseB.conditionOrders[conditionIndex],
      scenarioOrder: phaseB.scenarioOrders[scenarioIndex],
    });
  }
  return schedule;
}

function validateReferenceState(fixture, errors) {
  const prefix = fixture.id ?? '<fixture>';
  const reference = fixture.referenceState;
  if (!isObject(reference)) {
    errors.push(`${prefix}: referenceState must be object`);
    return;
  }
  for (const field of ['requiredResumeIds', 'corrections', 'supersededItemIds', 'unresolvedItemIds', 'relevantHistoryItemIds', 'irrelevantHistoryItemIds']) {
    if (!Array.isArray(reference[field])) errors.push(`${prefix}: referenceState.${field} must be array`);
  }
  for (const field of ['requiredResumeIds', 'supersededItemIds', 'unresolvedItemIds', 'relevantHistoryItemIds', 'irrelevantHistoryItemIds']) {
    if (!uniqueStrings(reference[field])) errors.push(`${prefix}: ${field} must contain unique non-empty strings`);
  }
  if (!isObject(reference.currentValues)) errors.push(`${prefix}: currentValues must be object`);
  if (!isObject(reference.provenanceRequired)) errors.push(`${prefix}: provenanceRequired must be object`);
  if (!Array.isArray(reference.corrections) || reference.corrections.length === 0) {
    errors.push(`${prefix}: at least one correction is required`);
  } else {
    for (const correction of reference.corrections) {
      if (!isObject(correction) || !nonEmptyString(correction.itemId) || !nonEmptyString(correction.supersededValue)
        || !nonEmptyString(correction.correctedValue) || !nonEmptyString(correction.sourceRef)) {
        errors.push(`${prefix}: malformed correction`);
        continue;
      }
      if (!reference.requiredResumeIds.includes(correction.itemId)) errors.push(`${prefix}: correction item not resumable: ${correction.itemId}`);
      if (reference.currentValues[correction.itemId] !== correction.correctedValue) errors.push(`${prefix}: corrected value mismatch for ${correction.itemId}`);
    }
  }
  for (const itemId of reference.unresolvedItemIds ?? []) {
    if (!reference.requiredResumeIds?.includes(itemId)) errors.push(`${prefix}: unresolved item not resumable: ${itemId}`);
  }
  for (const [itemId, sourceRef] of Object.entries(reference.provenanceRequired ?? {})) {
    if (!reference.requiredResumeIds?.includes(itemId)) errors.push(`${prefix}: provenance item not resumable: ${itemId}`);
    if (!nonEmptyString(sourceRef)) errors.push(`${prefix}: provenance source missing for ${itemId}`);
  }
  const relevant = new Set(reference.relevantHistoryItemIds ?? []);
  for (const itemId of reference.irrelevantHistoryItemIds ?? []) {
    if (relevant.has(itemId)) errors.push(`${prefix}: history item both relevant and irrelevant: ${itemId}`);
  }
  const expectedHash = sha256Object(reference);
  if (fixture.referenceStateHash !== expectedHash) errors.push(`${prefix}: referenceStateHash mismatch, expected ${expectedHash}`);
}

export function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return ['manifest must be JSON object'];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (manifest.protocolId !== 'HAI-009-CONTINUITY-PILOT-v1') errors.push('unexpected protocolId');
  if (manifest.protocolVersion !== '1.0.0') errors.push('protocolVersion must equal 1.0.0');
  if (manifest.lane !== 'HAI-009') errors.push('lane must equal HAI-009');
  if (manifest.issue !== 408) errors.push('issue must equal 408');
  if (manifest.domain !== 'continuity') errors.push('domain must equal continuity');

  for (const key of ['realParticipantDataAllowed', 'privateUserDataAllowed', 'paidProviderAllowed', 'productionMutationAllowed']) {
    if (manifest.phaseA?.[key] !== false) errors.push(`phaseA.${key} must be false`);
  }
  if (!nonEmptyString(manifest.phaseA?.claimBoundary)) errors.push('phaseA.claimBoundary required');

  const ids = (manifest.conditions ?? []).map((item) => item.id);
  if (stableStringify(ids) !== stableStringify(CONDITION_IDS)) errors.push(`conditions must be exactly ${CONDITION_IDS.join(', ')}`);
  const conditionById = new Map((manifest.conditions ?? []).map((item) => [item.id, item]));
  const shapes = {
    FRESH_SESSION: ['none', false, false, false, false],
    MEMORY_ONLY: ['retained_unfiltered', false, false, false, false],
    GOVERNED_CONTINUITY: ['governed_state', true, true, true, true],
  };
  for (const [id, expected] of Object.entries(shapes)) {
    const c = conditionById.get(id);
    if (!c) continue;
    const actual = [c.historyMode, c.currentnessAware, c.correctionAware, c.provenanceRequired, c.unresolvedStateRequired];
    if (stableStringify(actual) !== stableStringify(expected)) errors.push(`${id}: condition contract mismatch`);
  }

  for (const metric of [...PRIMARY_METRICS, ...SECONDARY_METRICS]) {
    const d = manifest.metricDefinitions?.[metric];
    if (!isObject(d) || !nonEmptyString(d.direction) || !nonEmptyString(d.definition)) errors.push(`metric definition missing: ${metric}`);
  }
  if (!uniqueStrings(manifest.telemetry?.requiredFields)) errors.push('telemetry.requiredFields must be unique non-empty strings');
  if (manifest.evidenceMapping?.parallelEvidenceStoreAuthorized !== false) errors.push('parallel evidence store must remain unauthorized');

  const phaseB = manifest.phaseBHumanFeasibility;
  if (!isObject(phaseB) || phaseB.activated !== false) errors.push('Phase B must remain not activated');
  if (phaseB?.provisionalSampleSize !== 24) errors.push('Phase B provisional sample size must equal 24');
  if (phaseB?.conditionOrderCount !== 6 || phaseB?.participantsPerOrder !== 4) errors.push('Phase B must use 6 condition orders with 4 slots each');
  if (!uniqueStrings(phaseB?.conditionOrders) || phaseB.conditionOrders.length !== 6) errors.push('Phase B requires 6 unique condition orders');
  if (!uniqueStrings(phaseB?.scenarioOrders) || phaseB.scenarioOrders.length !== 6) errors.push('Phase B requires 6 unique scenario orders');
  if (isObject(phaseB)) {
    const schedule = buildPhaseBSchedule(manifest);
    for (const order of phaseB.conditionOrders ?? []) {
      if (schedule.filter((row) => row.conditionOrder === order).length !== 4) errors.push(`condition order is not balanced four times: ${order}`);
    }
    for (const order of phaseB.scenarioOrders ?? []) {
      if (schedule.filter((row) => row.scenarioOrder === order).length !== 4) errors.push(`scenario order is not balanced four times: ${order}`);
    }
  }

  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== manifest.acceptance?.requiredFixtureCount) {
    errors.push(`fixtures must contain exactly ${manifest.acceptance?.requiredFixtureCount ?? 0} scenarios`);
    return errors;
  }

  const fixtureIds = new Set();
  for (const fixture of manifest.fixtures) {
    if (!nonEmptyString(fixture.id)) {
      errors.push('fixture id required');
      continue;
    }
    if (fixtureIds.has(fixture.id)) errors.push(`duplicate fixture id: ${fixture.id}`);
    fixtureIds.add(fixture.id);
    if (!nonEmptyString(fixture.title)) errors.push(`${fixture.id}: title required`);
    if (fixture.fixtureVersion !== '1.0.0') errors.push(`${fixture.id}: fixtureVersion must equal 1.0.0`);
    validateReferenceState(fixture, errors);
    if (!isObject(fixture.observations)) {
      errors.push(`${fixture.id}: observations must be object`);
      continue;
    }
    if (stableStringify(Object.keys(fixture.observations)) !== stableStringify(CONDITION_IDS)) errors.push(`${fixture.id}: all three observations required in canonical order`);

    for (const conditionId of CONDITION_IDS) {
      const observation = fixture.observations[conditionId];
      if (!isObject(observation)) {
        errors.push(`${fixture.id}/${conditionId}: observation required`);
        continue;
      }
      for (const field of OBSERVATION_FIELDS) if (!Object.hasOwn(observation, field)) errors.push(`${fixture.id}/${conditionId}: missing observation field ${field}`);
      const condition = conditionById.get(conditionId);
      if (observation.historyMode !== condition?.historyMode) errors.push(`${fixture.id}/${conditionId}: historyMode leaks or mismatches condition contract`);
      if (conditionId === 'FRESH_SESSION' && observation.retainedHistoryItemIds?.length !== 0) errors.push(`${fixture.id}/${conditionId}: fresh-session condition cannot retain prior history`);
      if (conditionId === 'FRESH_SESSION' && Object.keys(observation.provenanceByItem ?? {}).length !== 0) errors.push(`${fixture.id}/${conditionId}: fresh-session condition cannot carry prior provenance state`);
      if (conditionId === 'MEMORY_ONLY' && observation.governanceAnnotationsPresent !== false) errors.push(`${fixture.id}/${conditionId}: memory-only condition cannot contain governed annotations`);
      if (conditionId === 'GOVERNED_CONTINUITY' && observation.governanceAnnotationsPresent !== true) errors.push(`${fixture.id}/${conditionId}: governed condition requires governance annotations`);
      for (const field of ['resumedItemIds', 'staleItemIds', 'unresolvedRecoveredIds', 'retainedHistoryItemIds', 'contradictionItemIds']) {
        if (!uniqueStrings(observation[field])) errors.push(`${fixture.id}/${conditionId}: ${field} must contain unique non-empty strings`);
      }
      if (!isObject(observation.currentValues) || !isObject(observation.provenanceByItem)) errors.push(`${fixture.id}/${conditionId}: currentValues/provenanceByItem must be objects`);
      if (!Number.isInteger(observation.reconstructionTurns) || observation.reconstructionTurns < 0) errors.push(`${fixture.id}/${conditionId}: reconstructionTurns must be non-negative integer`);

      const envelope = buildTelemetryEnvelope(manifest, fixture, conditionId);
      errors.push(...validateTelemetryEnvelope(manifest, fixture, conditionId, envelope));
      const scores = scoreObservation(fixture.referenceState, observation, envelope, manifest.telemetry.requiredFields);
      if (stableStringify(scores) !== stableStringify(observation.expectedScores)) errors.push(`${fixture.id}/${conditionId}: expectedScores do not match deterministic scorer`);
      if (scores.instrumentation_completeness !== manifest.acceptance.requiredTelemetryCompleteness) errors.push(`${fixture.id}/${conditionId}: required telemetry completeness not met`);
      for (const prohibited of ['overallScore', 'globalScore', 'haiScore', 'maturityScore']) {
        if (Object.hasOwn(scores, prohibited)) errors.push(`${fixture.id}/${conditionId}: prohibited composite score ${prohibited}`);
      }
    }
  }

  if (manifest.acceptance?.singleHaiMaturityScoreAllowed !== false) errors.push('single HAI maturity score must remain prohibited');
  if (manifest.acceptance?.allPrimaryMetricsSeparate !== true) errors.push('primary metrics must remain separate');
  return errors;
}

export function loadManifest(manifestPath = 'config/hai-009-continuity-pilot.v1.json', options = {}) {
  const root = options.repoRoot ? path.resolve(options.repoRoot) : repoRoot;
  const absolute = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(root, manifestPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

export function scoreManifest(manifest) {
  return manifest.fixtures.flatMap((fixture) => CONDITION_IDS.map((condition) => {
    const envelope = buildTelemetryEnvelope(manifest, fixture, condition);
    return {
      fixtureId: fixture.id,
      condition,
      telemetry: envelope,
      scores: scoreObservation(fixture.referenceState, fixture.observations[condition], envelope, manifest.telemetry.requiredFields),
    };
  }));
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
}

if (isCliEntry()) {
  const manifestPath = process.argv[2] ?? 'config/hai-009-continuity-pilot.v1.json';
  let manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', protocolId: 'HAI-009-CONTINUITY-PILOT-v1', manifestPath, errors: [`unable to load manifest: ${error.message}`] }, null, 2));
    process.exit(1);
  }
  const errors = validateManifest(manifest);
  const result = {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    protocolId: manifest.protocolId,
    protocolVersion: manifest.protocolVersion,
    issue: manifest.issue,
    domain: manifest.domain,
    fixtureCount: manifest.fixtures?.length ?? 0,
    conditionCount: manifest.conditions?.length ?? 0,
    phaseBActivated: manifest.phaseBHumanFeasibility?.activated ?? null,
    productionMutationAllowed: manifest.phaseA?.productionMutationAllowed ?? null,
    paidProviderAllowed: manifest.phaseA?.paidProviderAllowed ?? null,
    realParticipantDataAllowed: manifest.phaseA?.realParticipantDataAllowed ?? null,
    phaseBSchedule: errors.length === 0 ? buildPhaseBSchedule(manifest) : [],
    scores: errors.length === 0 ? scoreManifest(manifest) : [],
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exit(1);
}
