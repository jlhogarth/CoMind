import { fingerprintCanonicalValue } from './checkpoint.js';
import {
  ContinuityCapsule,
  verifyContinuityCapsule,
} from './capsule.js';

export const CONTINUITY_COMPATIBILITY_MANIFEST_VERSION = 'continuity-compatibility-manifest-v1' as const;
export const CONTINUITY_COMPATIBILITY_RULESET_VERSION = 'continuity-compatibility-ruleset-v1' as const;
export const CONTINUITY_COMPATIBILITY_REPORT_VERSION = 'continuity-compatibility-report-v1' as const;
export const CONTINUITY_AS_OF_RECONSTRUCTION_VERSION = 'continuity-as-of-reconstruction-v1' as const;

const MAX_CONTRACTS = 256;
const MAX_RULES = 1024;
const MAX_REFS = 256;
const MAX_REF_LENGTH = 1024;

export type ContinuityContractKind =
  | 'rulebook'
  | 'policy'
  | 'schema'
  | 'tool'
  | 'provider'
  | 'runtime';

export type ContinuityCompatibilityDisposition =
  | 'CONTINUITY_COMPATIBLE'
  | 'REVALIDATION_REQUIRED'
  | 'MIGRATION_REQUIRED'
  | 'INCOMPATIBLE';

export interface ContinuityContractReference {
  contractKind: ContinuityContractKind;
  contractRef: string;
  versionRef: string;
  required: boolean;
  evidenceRefs: string[];
  sourceRef: string;
}

export interface ContinuityCompatibilityManifest {
  version: typeof CONTINUITY_COMPATIBILITY_MANIFEST_VERSION;
  scopeSemanticKey: string;
  checkpointId: string;
  recordedAt: string;
  contracts: ContinuityContractReference[];
  manifestDigest: string;
}

export interface CreateContinuityCompatibilityManifestInput {
  scopeSemanticKey: string;
  checkpointId: string;
  recordedAt: string;
  contracts: ContinuityContractReference[];
}

export interface ContinuityCompatibilityRule {
  ruleId: string;
  contractKind: ContinuityContractKind;
  contractRef: string;
  fromVersionRef: string;
  toVersionRef: string;
  disposition: ContinuityCompatibilityDisposition;
  assertionMode: 'explicit_evidence';
  evidenceRefs: string[];
  actionRefs: string[];
  sourceRef: string;
  observedAt: string;
  status: 'current' | 'retired';
}

export interface ContinuityCompatibilityRuleset {
  version: typeof CONTINUITY_COMPATIBILITY_RULESET_VERSION;
  rules: ContinuityCompatibilityRule[];
  rulesetDigest: string;
}

export type ContinuityCompatibilityReason =
  | 'UNCHANGED_CONTRACT'
  | 'EXPLICIT_COMPATIBILITY_RULE'
  | 'CHANGED_WITHOUT_RULE'
  | 'REQUIRED_CONTRACT_MISSING'
  | 'OPTIONAL_CONTRACT_REMOVED'
  | 'NEW_REQUIRED_CONTRACT'
  | 'NEW_OPTIONAL_CONTRACT';

export interface ContinuityContractCompatibilityResult {
  contractKind: ContinuityContractKind;
  contractRef: string;
  sourceVersionRef: string | null;
  currentVersionRef: string | null;
  disposition: ContinuityCompatibilityDisposition;
  reason: ContinuityCompatibilityReason;
  ruleId: string | null;
  evidenceRefs: string[];
  actionRefs: string[];
}

export interface ContinuityCompatibilityReport {
  version: typeof CONTINUITY_COMPATIBILITY_REPORT_VERSION;
  scopeSemanticKey: string;
  sourceCheckpointId: string;
  currentCheckpointId: string;
  disposition: ContinuityCompatibilityDisposition;
  results: ContinuityContractCompatibilityResult[];
  sourceManifestDigest: string;
  currentManifestDigest: string;
  rulesetDigest: string;
  reportDigest: string;
}

export interface ContinuityAsOfState {
  scopeSemanticKey: string;
  checkpointId: string;
  parentCheckpointId: string | null;
  acceptedAt: string;
  capsuleIssuedAt: string;
  capsuleExpiresAt: string;
  capsuleDigest: string;
  continuityDigest: string;
  lineageCheckpointIds: string[];
  unresolvedCaseRefs: string[];
  objectiveRefs: string[];
  decisionRefs: string[];
  assumptionRefs: string[];
  obligationRefs: string[];
  prohibitedActionRefs: string[];
  openQuestionRefs: string[];
  evidenceRefs: string[];
  authorityEvidenceRefs: string[];
  policyRefs: string[];
  sensitivity: ContinuityCapsule['sensitivity'];
  retentionClass: string;
}

export interface ContinuityAsOfReconstruction {
  version: typeof CONTINUITY_AS_OF_RECONSTRUCTION_VERSION;
  status: 'FOUND' | 'NO_ACCEPTED_STATE';
  asOf: string;
  contextUsableAtAsOf: boolean;
  state: ContinuityAsOfState | null;
  reconstructionDigest: string;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REF_LENGTH || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizeRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) throw new Error(`Invalid ${field}`);
  const normalized = values.map((value, index) => {
    requiredText(value, `${field}[${index}]`);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`Duplicate ${field}`);
  return [...normalized].sort();
}

function isContractKind(value: unknown): value is ContinuityContractKind {
  return value === 'rulebook'
    || value === 'policy'
    || value === 'schema'
    || value === 'tool'
    || value === 'provider'
    || value === 'runtime';
}

function isDisposition(value: unknown): value is ContinuityCompatibilityDisposition {
  return value === 'CONTINUITY_COMPATIBLE'
    || value === 'REVALIDATION_REQUIRED'
    || value === 'MIGRATION_REQUIRED'
    || value === 'INCOMPATIBLE';
}

function contractKey(contractKind: ContinuityContractKind, contractRef: string): string {
  return `${contractKind}\u0000${contractRef}`;
}

function ruleKey(rule: ContinuityCompatibilityRule): string {
  return `${contractKey(rule.contractKind, rule.contractRef)}\u0000${rule.fromVersionRef}\u0000${rule.toVersionRef}`;
}

function normalizeContract(contract: ContinuityContractReference): ContinuityContractReference {
  if (!isContractKind(contract.contractKind)) throw new Error('Invalid continuity contract kind');
  requiredText(contract.contractRef, 'continuity contract reference');
  requiredText(contract.versionRef, 'continuity contract version reference');
  requiredText(contract.sourceRef, 'continuity contract source reference');
  if (typeof contract.required !== 'boolean') throw new Error('Invalid continuity contract required flag');
  const evidenceRefs = normalizeRefs(contract.evidenceRefs, 'continuity contract evidence references');
  if (evidenceRefs.length === 0) throw new Error('Continuity contract requires evidence');
  return { ...contract, evidenceRefs };
}

function withoutManifestDigest(
  manifest: ContinuityCompatibilityManifest
): Omit<ContinuityCompatibilityManifest, 'manifestDigest'> {
  const { manifestDigest: _digest, ...payload } = manifest;
  return payload;
}

export function createContinuityCompatibilityManifest(
  input: CreateContinuityCompatibilityManifestInput
): ContinuityCompatibilityManifest {
  requiredText(input.scopeSemanticKey, 'continuity compatibility scope semantic key');
  requiredText(input.checkpointId, 'continuity compatibility checkpoint id');
  if (!Array.isArray(input.contracts) || input.contracts.length > MAX_CONTRACTS) {
    throw new Error('Invalid continuity compatibility contracts');
  }
  const contracts = input.contracts.map(normalizeContract).sort((left, right) =>
    contractKey(left.contractKind, left.contractRef).localeCompare(contractKey(right.contractKind, right.contractRef))
  );
  const keys = contracts.map(contract => contractKey(contract.contractKind, contract.contractRef));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate continuity contract identity');
  const payload: Omit<ContinuityCompatibilityManifest, 'manifestDigest'> = {
    version: CONTINUITY_COMPATIBILITY_MANIFEST_VERSION,
    scopeSemanticKey: input.scopeSemanticKey,
    checkpointId: input.checkpointId,
    recordedAt: normalizeTimestamp(input.recordedAt, 'continuity compatibility recorded timestamp'),
    contracts,
  };
  return Object.freeze({ ...payload, manifestDigest: fingerprintCanonicalValue(payload) });
}

export function verifyContinuityCompatibilityManifest(
  manifest: ContinuityCompatibilityManifest
): boolean {
  try {
    if (!manifest || manifest.version !== CONTINUITY_COMPATIBILITY_MANIFEST_VERSION) return false;
    const rebuilt = createContinuityCompatibilityManifest(manifest);
    return rebuilt.manifestDigest === manifest.manifestDigest
      && fingerprintCanonicalValue(withoutManifestDigest(manifest)) === manifest.manifestDigest;
  } catch {
    return false;
  }
}

function normalizeRule(rule: ContinuityCompatibilityRule): ContinuityCompatibilityRule {
  requiredText(rule.ruleId, 'continuity compatibility rule id');
  if (!isContractKind(rule.contractKind)) throw new Error('Invalid continuity compatibility rule contract kind');
  requiredText(rule.contractRef, 'continuity compatibility rule contract reference');
  requiredText(rule.fromVersionRef, 'continuity compatibility rule source version');
  requiredText(rule.toVersionRef, 'continuity compatibility rule target version');
  if (rule.fromVersionRef === rule.toVersionRef) throw new Error('Compatibility rule requires a version transition');
  if (!isDisposition(rule.disposition)) throw new Error('Invalid continuity compatibility rule disposition');
  if (rule.assertionMode !== 'explicit_evidence') throw new Error('Compatibility rules require explicit evidence');
  requiredText(rule.sourceRef, 'continuity compatibility rule source reference');
  const evidenceRefs = normalizeRefs(rule.evidenceRefs, 'continuity compatibility rule evidence references');
  if (evidenceRefs.length === 0) throw new Error('Compatibility rule requires evidence');
  const actionRefs = normalizeRefs(rule.actionRefs, 'continuity compatibility rule action references');
  if ((rule.disposition === 'MIGRATION_REQUIRED' || rule.disposition === 'REVALIDATION_REQUIRED')
      && actionRefs.length === 0) {
    throw new Error('Migration/revalidation rule requires an action reference');
  }
  if (rule.status !== 'current' && rule.status !== 'retired') throw new Error('Invalid compatibility rule status');
  return {
    ...rule,
    evidenceRefs,
    actionRefs,
    observedAt: normalizeTimestamp(rule.observedAt, 'continuity compatibility rule observed timestamp'),
  };
}

function withoutRulesetDigest(
  ruleset: ContinuityCompatibilityRuleset
): Omit<ContinuityCompatibilityRuleset, 'rulesetDigest'> {
  const { rulesetDigest: _digest, ...payload } = ruleset;
  return payload;
}

export function createContinuityCompatibilityRuleset(
  rules: readonly ContinuityCompatibilityRule[]
): ContinuityCompatibilityRuleset {
  if (!Array.isArray(rules) || rules.length > MAX_RULES) throw new Error('Invalid continuity compatibility rules');
  const normalized = rules.map(normalizeRule).sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  if (new Set(normalized.map(rule => rule.ruleId)).size !== normalized.length) {
    throw new Error('Duplicate continuity compatibility rule id');
  }
  const activeRuleKeys = normalized.filter(rule => rule.status === 'current').map(ruleKey);
  if (new Set(activeRuleKeys).size !== activeRuleKeys.length) {
    throw new Error('Ambiguous active compatibility rule transition');
  }
  const payload: Omit<ContinuityCompatibilityRuleset, 'rulesetDigest'> = {
    version: CONTINUITY_COMPATIBILITY_RULESET_VERSION,
    rules: normalized,
  };
  return Object.freeze({ ...payload, rulesetDigest: fingerprintCanonicalValue(payload) });
}

export function verifyContinuityCompatibilityRuleset(ruleset: ContinuityCompatibilityRuleset): boolean {
  try {
    if (!ruleset || ruleset.version !== CONTINUITY_COMPATIBILITY_RULESET_VERSION) return false;
    const rebuilt = createContinuityCompatibilityRuleset(ruleset.rules);
    return rebuilt.rulesetDigest === ruleset.rulesetDigest
      && fingerprintCanonicalValue(withoutRulesetDigest(ruleset)) === ruleset.rulesetDigest;
  } catch {
    return false;
  }
}

const DISPOSITION_RANK: Record<ContinuityCompatibilityDisposition, number> = {
  CONTINUITY_COMPATIBLE: 0,
  REVALIDATION_REQUIRED: 1,
  MIGRATION_REQUIRED: 2,
  INCOMPATIBLE: 3,
};

function maxDisposition(
  left: ContinuityCompatibilityDisposition,
  right: ContinuityCompatibilityDisposition
): ContinuityCompatibilityDisposition {
  return DISPOSITION_RANK[right] > DISPOSITION_RANK[left] ? right : left;
}

function uniqueSortedRefs(...sets: readonly string[][]): string[] {
  return [...new Set(sets.flat())].sort();
}

export function evaluateContinuityCompatibility(
  source: ContinuityCompatibilityManifest,
  current: ContinuityCompatibilityManifest,
  ruleset: ContinuityCompatibilityRuleset
): ContinuityCompatibilityReport {
  if (!verifyContinuityCompatibilityManifest(source)
      || !verifyContinuityCompatibilityManifest(current)
      || !verifyContinuityCompatibilityRuleset(ruleset)) {
    throw new Error('Invalid continuity compatibility input');
  }
  if (source.scopeSemanticKey !== current.scopeSemanticKey) {
    throw new Error('Compatibility manifests refer to different continuity scopes');
  }

  const sourceMap = new Map(source.contracts.map(contract => [
    contractKey(contract.contractKind, contract.contractRef), contract,
  ]));
  const currentMap = new Map(current.contracts.map(contract => [
    contractKey(contract.contractKind, contract.contractRef), contract,
  ]));
  const activeRules = new Map(ruleset.rules.filter(rule => rule.status === 'current').map(rule => [ruleKey(rule), rule]));
  const results: ContinuityContractCompatibilityResult[] = [];

  for (const sourceContract of source.contracts) {
    const key = contractKey(sourceContract.contractKind, sourceContract.contractRef);
    const currentContract = currentMap.get(key);
    if (!currentContract) {
      results.push({
        contractKind: sourceContract.contractKind,
        contractRef: sourceContract.contractRef,
        sourceVersionRef: sourceContract.versionRef,
        currentVersionRef: null,
        disposition: sourceContract.required ? 'INCOMPATIBLE' : 'REVALIDATION_REQUIRED',
        reason: sourceContract.required ? 'REQUIRED_CONTRACT_MISSING' : 'OPTIONAL_CONTRACT_REMOVED',
        ruleId: null,
        evidenceRefs: [...sourceContract.evidenceRefs],
        actionRefs: [],
      });
      continue;
    }
    if (sourceContract.versionRef === currentContract.versionRef) {
      results.push({
        contractKind: sourceContract.contractKind,
        contractRef: sourceContract.contractRef,
        sourceVersionRef: sourceContract.versionRef,
        currentVersionRef: currentContract.versionRef,
        disposition: 'CONTINUITY_COMPATIBLE',
        reason: 'UNCHANGED_CONTRACT',
        ruleId: null,
        evidenceRefs: uniqueSortedRefs(sourceContract.evidenceRefs, currentContract.evidenceRefs),
        actionRefs: [],
      });
      continue;
    }
    const transitionKey = `${key}\u0000${sourceContract.versionRef}\u0000${currentContract.versionRef}`;
    const rule = activeRules.get(transitionKey);
    if (!rule) {
      results.push({
        contractKind: sourceContract.contractKind,
        contractRef: sourceContract.contractRef,
        sourceVersionRef: sourceContract.versionRef,
        currentVersionRef: currentContract.versionRef,
        disposition: 'REVALIDATION_REQUIRED',
        reason: 'CHANGED_WITHOUT_RULE',
        ruleId: null,
        evidenceRefs: uniqueSortedRefs(sourceContract.evidenceRefs, currentContract.evidenceRefs),
        actionRefs: [],
      });
      continue;
    }
    results.push({
      contractKind: sourceContract.contractKind,
      contractRef: sourceContract.contractRef,
      sourceVersionRef: sourceContract.versionRef,
      currentVersionRef: currentContract.versionRef,
      disposition: rule.disposition,
      reason: 'EXPLICIT_COMPATIBILITY_RULE',
      ruleId: rule.ruleId,
      evidenceRefs: uniqueSortedRefs(sourceContract.evidenceRefs, currentContract.evidenceRefs, rule.evidenceRefs),
      actionRefs: [...rule.actionRefs],
    });
  }

  for (const currentContract of current.contracts) {
    const key = contractKey(currentContract.contractKind, currentContract.contractRef);
    if (sourceMap.has(key)) continue;
    results.push({
      contractKind: currentContract.contractKind,
      contractRef: currentContract.contractRef,
      sourceVersionRef: null,
      currentVersionRef: currentContract.versionRef,
      disposition: currentContract.required ? 'REVALIDATION_REQUIRED' : 'CONTINUITY_COMPATIBLE',
      reason: currentContract.required ? 'NEW_REQUIRED_CONTRACT' : 'NEW_OPTIONAL_CONTRACT',
      ruleId: null,
      evidenceRefs: [...currentContract.evidenceRefs],
      actionRefs: [],
    });
  }

  results.sort((left, right) => contractKey(left.contractKind, left.contractRef)
    .localeCompare(contractKey(right.contractKind, right.contractRef)));
  let disposition: ContinuityCompatibilityDisposition = 'CONTINUITY_COMPATIBLE';
  for (const result of results) disposition = maxDisposition(disposition, result.disposition);

  const payload: Omit<ContinuityCompatibilityReport, 'reportDigest'> = {
    version: CONTINUITY_COMPATIBILITY_REPORT_VERSION,
    scopeSemanticKey: source.scopeSemanticKey,
    sourceCheckpointId: source.checkpointId,
    currentCheckpointId: current.checkpointId,
    disposition,
    results,
    sourceManifestDigest: source.manifestDigest,
    currentManifestDigest: current.manifestDigest,
    rulesetDigest: ruleset.rulesetDigest,
  };
  return Object.freeze({ ...payload, reportDigest: fingerprintCanonicalValue(payload) });
}

function assertCapsuleHistory(capsules: readonly ContinuityCapsule[]): void {
  if (!Array.isArray(capsules) || capsules.length === 0 || capsules.length > MAX_CONTRACTS) {
    throw new Error('As-of reconstruction requires 1-256 continuity capsules');
  }
  const scope = capsules[0]?.scopeSemanticKey;
  const checkpointIds = new Set<string>();
  for (let index = 0; index < capsules.length; index += 1) {
    const capsule = capsules[index];
    if (!verifyContinuityCapsule(capsule)) throw new Error(`Invalid continuity capsule at index ${index}`);
    if (capsule.scopeSemanticKey !== scope) throw new Error('As-of history contains multiple continuity scopes');
    if (checkpointIds.has(capsule.currentCheckpoint.checkpointId)) {
      throw new Error('As-of history contains duplicate checkpoints');
    }
    checkpointIds.add(capsule.currentCheckpoint.checkpointId);
    if (index === 0) continue;
    const prior = capsules[index - 1];
    if (capsule.currentCheckpoint.parentCheckpointId !== prior.currentCheckpoint.checkpointId) {
      throw new Error('As-of history is not a direct accepted checkpoint lineage');
    }
    if (Date.parse(capsule.currentCheckpoint.acceptedAt) <= Date.parse(prior.currentCheckpoint.acceptedAt)
        || Date.parse(capsule.issuedAt) < Date.parse(prior.issuedAt)) {
      throw new Error('As-of history is not chronologically increasing');
    }
  }
}

function stateFromCapsule(capsule: ContinuityCapsule): ContinuityAsOfState {
  return {
    scopeSemanticKey: capsule.scopeSemanticKey,
    checkpointId: capsule.currentCheckpoint.checkpointId,
    parentCheckpointId: capsule.currentCheckpoint.parentCheckpointId,
    acceptedAt: capsule.currentCheckpoint.acceptedAt,
    capsuleIssuedAt: capsule.issuedAt,
    capsuleExpiresAt: capsule.expiresAt,
    capsuleDigest: capsule.capsuleDigest,
    continuityDigest: capsule.continuityDigest,
    lineageCheckpointIds: [...capsule.lineage.checkpointIds],
    unresolvedCaseRefs: [...capsule.unresolvedCaseRefs],
    objectiveRefs: [...capsule.references.objectiveRefs],
    decisionRefs: [...capsule.references.decisionRefs],
    assumptionRefs: [...capsule.references.assumptionRefs],
    obligationRefs: [...capsule.references.obligationRefs],
    prohibitedActionRefs: [...capsule.references.prohibitedActionRefs],
    openQuestionRefs: [...capsule.references.openQuestionRefs],
    evidenceRefs: [...capsule.references.evidenceRefs],
    authorityEvidenceRefs: [...capsule.authority.authorityEvidenceRefs],
    policyRefs: [...capsule.authority.policyRefs],
    sensitivity: capsule.sensitivity,
    retentionClass: capsule.retentionClass,
  };
}

export function reconstructContinuityAsOf(
  capsules: readonly ContinuityCapsule[],
  asOf: string
): ContinuityAsOfReconstruction {
  assertCapsuleHistory(capsules);
  const normalizedAsOf = normalizeTimestamp(asOf, 'continuity as-of timestamp');
  const asOfMs = Date.parse(normalizedAsOf);
  let selected: ContinuityCapsule | null = null;
  for (const capsule of capsules) {
    if (Date.parse(capsule.currentCheckpoint.acceptedAt) <= asOfMs
        && Date.parse(capsule.issuedAt) <= asOfMs) {
      selected = capsule;
    } else {
      break;
    }
  }

  const state = selected ? stateFromCapsule(selected) : null;
  const payload: Omit<ContinuityAsOfReconstruction, 'reconstructionDigest'> = {
    version: CONTINUITY_AS_OF_RECONSTRUCTION_VERSION,
    status: selected ? 'FOUND' : 'NO_ACCEPTED_STATE',
    asOf: normalizedAsOf,
    contextUsableAtAsOf: selected !== null
      && asOfMs >= Date.parse(selected.issuedAt)
      && asOfMs < Date.parse(selected.expiresAt),
    state,
  };
  return Object.freeze({ ...payload, reconstructionDigest: fingerprintCanonicalValue(payload) });
}

export function reconstructContinuityAtCheckpoint(
  capsules: readonly ContinuityCapsule[],
  checkpointId: string
): ContinuityAsOfReconstruction {
  assertCapsuleHistory(capsules);
  requiredText(checkpointId, 'continuity reconstruction checkpoint id');
  const selected = capsules.find(capsule => capsule.currentCheckpoint.checkpointId === checkpointId) ?? null;
  const state = selected ? stateFromCapsule(selected) : null;
  const asOf = selected ? selected.issuedAt : new Date(0).toISOString();
  const payload: Omit<ContinuityAsOfReconstruction, 'reconstructionDigest'> = {
    version: CONTINUITY_AS_OF_RECONSTRUCTION_VERSION,
    status: selected ? 'FOUND' : 'NO_ACCEPTED_STATE',
    asOf,
    contextUsableAtAsOf: selected !== null,
    state,
  };
  return Object.freeze({ ...payload, reconstructionDigest: fingerprintCanonicalValue(payload) });
}
