#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONDITION_IDS,
  PRIMARY_METRICS,
  buildTelemetryEnvelope,
  loadManifest as loadHai009Manifest,
  scoreObservation,
  stableStringify,
  validateManifest as validateHai009Manifest,
} from './hai_009_continuity_pilot.mjs';
import {
  executeFreshSession,
  executeGovernedContinuity,
  sanitizeMemoryOnlyProof,
} from '../server/test/support/hai-010-continuity-adapter.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256Bytes(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Value(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function loadHai010Manifest(filePath = 'config/hai-010-continuity-comparison.v1.json') {
  const absolute = path.resolve(repoRoot, filePath);
  return readJson(absolute);
}

export function verifyFrozenHai009(hai010, options = {}) {
  const manifestPath = path.resolve(repoRoot, hai010.frozenHai009.manifestPath);
  const scorerPath = path.resolve(repoRoot, hai010.frozenHai009.scorerPath);
  const actualManifestHash = sha256Bytes(manifestPath);
  const actualScorerHash = sha256Bytes(scorerPath);
  if (actualManifestHash !== hai010.frozenHai009.manifestSha256) {
    throw new Error(`Frozen HAI-009 manifest hash mismatch: ${actualManifestHash}`);
  }
  if (actualScorerHash !== hai010.frozenHai009.scorerSha256) {
    throw new Error(`Frozen HAI-009 scorer hash mismatch: ${actualScorerHash}`);
  }
  const hai009 = options.hai009 ?? loadHai009Manifest(hai010.frozenHai009.manifestPath);
  const errors = validateHai009Manifest(hai009);
  if (errors.length > 0) throw new Error(`Frozen HAI-009 manifest invalid: ${errors.join('; ')}`);
  if (hai009.protocolId !== hai010.frozenHai009.protocolId || hai009.protocolVersion !== hai010.frozenHai009.protocolVersion) {
    throw new Error('Frozen HAI-009 identity mismatch');
  }
  return { hai009, actualManifestHash, actualScorerHash };
}

export function validateHai010Manifest(hai010, hai009) {
  const errors = [];
  if (hai010.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (hai010.protocolId !== 'HAI-010-CONTINUITY-COMPARISON-v1') errors.push('unexpected protocolId');
  if (hai010.protocolVersion !== '1.0.0') errors.push('unexpected protocolVersion');
  if (hai010.issue !== 417) errors.push('issue must be 417');
  if (hai010.frozenHai009?.immutable !== true) errors.push('HAI-009 must be immutable');
  const ids = hai010.conditions?.map(item => item.id) ?? [];
  if (JSON.stringify(ids) !== JSON.stringify(CONDITION_IDS)) errors.push('condition IDs drifted from HAI-009');
  if (JSON.stringify(hai010.fixtures) !== JSON.stringify(hai009.fixtures.map(item => item.id))) errors.push('fixture IDs drifted from HAI-009');
  const boundary = hai010.executionBoundary ?? {};
  for (const key of ['realParticipantDataAllowed','privateUserDataAllowed','paidProviderAllowed','productionMutationAllowed','schemaMutationAllowed','phaseBActivated']) {
    if (boundary[key] !== false) errors.push(`${key} must remain false`);
  }
  if (hai010.mechanismEvidencePolicy?.globalCompositeScoreAllowed !== false) errors.push('global composite score must remain forbidden');
  if (hai010.acceptance?.singleHaiMaturityScoreAllowed !== false) errors.push('single HAI maturity score must remain forbidden');
  if (hai010.acceptance?.expectedTrialCount !== 9) errors.push('expected trial count must be 9');
  if (hai010.metricSource !== 'frozen_hai009_synthetic_observation_contract') errors.push('metric source drifted');
  return errors;
}

export function loadMemoryOnlyProof(showPath, preflightPath) {
  if (!showPath || !preflightPath) throw new Error('MEMORY_ONLY proof paths are required');
  if (!fs.existsSync(showPath) || !fs.existsSync(preflightPath)) throw new Error('MEMORY_ONLY proof files are missing');
  return { show: readJson(showPath), preflight: readJson(preflightPath) };
}

export async function executeHai010Comparison({ hai010, hai009, memoryProof }) {
  const validationErrors = validateHai010Manifest(hai010, hai009);
  if (validationErrors.length > 0) throw new Error(`HAI-010 manifest invalid: ${validationErrors.join('; ')}`);
  const memoryEvidence = sanitizeMemoryOnlyProof(memoryProof.show, memoryProof.preflight, hai010);
  const trials = [];
  for (const fixture of hai009.fixtures) {
    for (const condition of CONDITION_IDS) {
      const telemetry = buildTelemetryEnvelope(hai009, fixture, condition);
      const metricObservation = fixture.observations[condition];
      const scores = scoreObservation(fixture.referenceState, metricObservation, telemetry, hai009.telemetry.requiredFields);
      let mechanismEvidence;
      if (condition === 'FRESH_SESSION') mechanismEvidence = executeFreshSession(fixture);
      else if (condition === 'MEMORY_ONLY') mechanismEvidence = memoryEvidence;
      else mechanismEvidence = await executeGovernedContinuity(fixture, hai010);
      trials.push({
        fixtureId: fixture.id,
        fixtureVersion: fixture.fixtureVersion,
        condition,
        metricSource: hai010.metricSource,
        metricObservationDigest: sha256Value(metricObservation),
        scores,
        mechanismEvidence,
      });
    }
  }
  if (trials.length !== hai010.acceptance.expectedTrialCount) throw new Error('HAI-010 trial count mismatch');
  const result = {
    status: 'PASS',
    protocolId: hai010.protocolId,
    protocolVersion: hai010.protocolVersion,
    issue: hai010.issue,
    domain: hai010.domain,
    executionTimestamp: hai010.executionBoundary.fixedExecutionTimestamp,
    frozenHai009: {
      protocolId: hai010.frozenHai009.protocolId,
      protocolVersion: hai010.frozenHai009.protocolVersion,
      manifestSha256: hai010.frozenHai009.manifestSha256,
      scorerSha256: hai010.frozenHai009.scorerSha256,
    },
    boundaries: structuredClone(hai010.executionBoundary),
    primaryMetrics: [...PRIMARY_METRICS],
    trialCount: trials.length,
    trials,
    nonClaims: [
      'Synthetic HAI-010 results do not establish human benefit.',
      'HAI-009 semantic observations are frozen synthetic contract cases, not system-generated user outcomes.',
      'ThreadKeeper mechanism success does not by itself establish semantic correctness.',
      'The generic isolated Conversation History reader proof establishes retained-content access, not HAI semantic efficacy.',
      'Phase B remains inactive.',
    ],
  };
  const serialized = stableStringify(result);
  if (/"(?:overallScore|globalScore|maturityScore|haiScore)"\s*:/.test(serialized)) throw new Error('Composite HAI score is forbidden');
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
}

if (isCliEntry()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const hai010 = loadHai010Manifest(args.manifest ?? 'config/hai-010-continuity-comparison.v1.json');
    const { hai009, actualManifestHash, actualScorerHash } = verifyFrozenHai009(hai010);
    const memoryProof = loadMemoryOnlyProof(args['memory-show'], args['memory-preflight']);
    const result = await executeHai010Comparison({ hai010, hai009, memoryProof });
    const outputPath = path.resolve(repoRoot, args.out ?? 'artifacts/hai-010-synthetic-execution.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: result.status,
      protocolId: result.protocolId,
      trialCount: result.trialCount,
      outputPath: path.relative(repoRoot, outputPath),
      frozenHai009ManifestHash: actualManifestHash,
      frozenHai009ScorerHash: actualScorerHash,
      phaseBActivated: result.boundaries.phaseBActivated,
      productionMutationAllowed: result.boundaries.productionMutationAllowed,
      paidProviderAllowed: result.boundaries.paidProviderAllowed,
      privateUserDataAllowed: result.boundaries.privateUserDataAllowed,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', protocolId: 'HAI-010-CONTINUITY-COMPARISON-v1', error: error.message }, null, 2));
    process.exit(1);
  }
}
