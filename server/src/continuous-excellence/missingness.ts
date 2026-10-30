import { createHash } from 'node:crypto';
import type { QueryFunction } from '../db.js';

export const CE_MISSINGNESS_SCAN_VERSION = 'ce-003-missingness-v1' as const;

export const CE_SCAN_DIMENSIONS = [
  'dependencies_prerequisites',
  'assumptions_confidence',
  'adjacent_systems',
  'failure_modes',
  'rollback_recovery',
  'security_data_integrity',
  'observability_evidence',
  'usability_accessibility',
  'testing_acceptance',
  'maintenance_ownership_documentation',
  'cost_provider_dependency',
  'authority_approvals',
  'reversibility',
  'reusable_capability',
  'costly_to_reverse_commitments',
  'low_cost_opportunities',
] as const;

export type ScanDimension = (typeof CE_SCAN_DIMENSIONS)[number];
export type ConsequenceLevel = 'low' | 'moderate' | 'high' | 'critical';
export type AuthorityState = 'authorized' | 'requires_approval' | 'unknown';
export type AssessmentStatus = 'satisfied' | 'gap' | 'unknown' | 'not_applicable';
export type AssessmentConfidence = 'verified' | 'mixed' | 'uncertain';
export type FindingType = 'missingness' | 'risk' | 'opportunity' | 'forward_consequence';
export type FindingSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';
export type ScanDecision = 'proceed' | 'proceed_with_attention' | 'blocked';

export interface ScanEvidenceRef {
  sourceSystem: string;
  sourceRef: string;
  summary?: string;
}

export interface DimensionAssessment {
  dimension: ScanDimension;
  status: AssessmentStatus;
  confidence: AssessmentConfidence;
  rationale: string;
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface AuthorityAssessment {
  state: AuthorityState;
  evidenceRefs: ScanEvidenceRef[];
  approvalRef?: string | null;
}

export interface ScanDependency {
  key: string;
  required: boolean;
  status: 'available' | 'unavailable' | 'unknown';
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface ScanAssumption {
  key: string;
  statement: string;
  material: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface AdjacentSystemImpact {
  system: string;
  affected: boolean;
  impactKnown: boolean;
  owner: string | null;
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface ScanCommitment {
  key: string;
  description: string;
  costLevel: 'low' | 'moderate' | 'high' | 'critical';
  reversibility: 'easy' | 'moderate' | 'hard' | 'irreversible' | 'unknown';
  alternativePreserved: boolean;
  reconsiderationTrigger: string | null;
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface ReuseAssessment {
  status: 'checked_reuse' | 'checked_no_fit' | 'not_checked';
  capabilityRef?: string | null;
  rationale: string;
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface ScanOpportunity {
  key: string;
  description: string;
  material: boolean;
  implementationCost: 'low' | 'moderate' | 'high';
  preservesOption: boolean;
  evidenceRefs: ScanEvidenceRef[];
  nextAction?: string | null;
}

export interface ConsequenceFlags {
  production?: boolean;
  dataMutation?: boolean;
  securityBoundary?: boolean;
  userFacing?: boolean;
  paidProvider?: boolean;
  irreversible?: boolean;
  externalDependency?: boolean;
  longLivedArchitecture?: boolean;
}

export interface MissingnessScanRequest {
  projectId: string;
  taskId: string;
  objective: string;
  proposedAction: string;
  consequenceLevel: ConsequenceLevel;
  substantialWork: boolean;
  authority: AuthorityAssessment;
  sourceSystem: string;
  sourceRef: string;
  observedAt: string;
  actorId?: string | null;
  flags?: ConsequenceFlags;
  assessments?: DimensionAssessment[];
  dependencies?: ScanDependency[];
  assumptions?: ScanAssumption[];
  adjacentSystems?: AdjacentSystemImpact[];
  commitments?: ScanCommitment[];
  reuse?: ReuseAssessment;
  opportunities?: ScanOpportunity[];
}

export interface MissingnessFinding {
  code: string;
  subjectKey: string | null;
  dimension: ScanDimension;
  type: FindingType;
  severity: FindingSeverity;
  blocking: boolean;
  requiresAction: boolean;
  summary: string;
  rationale: string;
  nextAction: string;
  evidenceRefs: ScanEvidenceRef[];
  fingerprint: string;
}

export interface MissingnessScanResult {
  version: typeof CE_MISSINGNESS_SCAN_VERSION;
  scanFingerprint: string;
  consequenceLevel: ConsequenceLevel;
  requiredDimensions: ScanDimension[];
  decision: ScanDecision;
  confidence: AssessmentConfidence;
  proceedAllowed: boolean;
  findings: MissingnessFinding[];
}

export interface PersistedFinding {
  findingFingerprint: string;
  idempotencyKey: string;
  signalId: string;
  replayed: boolean;
}

export interface MissingnessPersistenceResult {
  scanFingerprint: string;
  persisted: PersistedFinding[];
  replayedCount: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIMENSION_ORDER = new Map<ScanDimension, number>(CE_SCAN_DIMENSIONS.map((value, index) => [value, index]));
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};
const CONSEQUENCE_ORDER: Record<ConsequenceLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function boundedString(value: unknown, field: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function assertUuid(value: unknown, field: string): asserts value is string {
  boundedString(value, field, 128);
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${field}`);
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Invalid CE-003 observed timestamp');
  return new Date(parsed).toISOString();
}

function assertEvidenceRefs(refs: unknown, field: string): asserts refs is ScanEvidenceRef[] {
  if (!Array.isArray(refs)) throw new Error(`Invalid ${field}`);
  for (const [index, ref] of refs.entries()) {
    if (!ref || typeof ref !== 'object') throw new Error(`Invalid ${field}[${index}]`);
    const candidate = ref as Partial<ScanEvidenceRef>;
    boundedString(candidate.sourceSystem, `${field}[${index}].sourceSystem`, 256);
    boundedString(candidate.sourceRef, `${field}[${index}].sourceRef`, 4096);
    if (candidate.summary !== undefined) boundedString(candidate.summary, `${field}[${index}].summary`, 4096);
  }
}

function assertUniqueKeys(values: { key: string }[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    boundedString(value.key, `${field}.key`, 512);
    if (seen.has(value.key)) throw new Error(`Duplicate ${field} key: ${value.key}`);
    seen.add(value.key);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(item => canonicalize(item));
    return normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) result[key] = canonicalize(record[key]);
    return result;
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function normalizeEvidenceRefs(refs: ScanEvidenceRef[]): ScanEvidenceRef[] {
  const normalized = refs.map(ref => ({
    sourceSystem: ref.sourceSystem,
    sourceRef: ref.sourceRef,
    ...(ref.summary ? { summary: ref.summary } : {}),
  }));
  const unique = new Map<string, ScanEvidenceRef>();
  for (const ref of normalized) {
    const key = `${ref.sourceSystem}\u0000${ref.sourceRef}\u0000${ref.summary ?? ''}`;
    unique.set(key, ref);
  }
  return [...unique.values()].sort((left, right) => {
    const a = `${left.sourceSystem}\u0000${left.sourceRef}\u0000${left.summary ?? ''}`;
    const b = `${right.sourceSystem}\u0000${right.sourceRef}\u0000${right.summary ?? ''}`;
    return a.localeCompare(b);
  });
}

function consequenceSeverity(level: ConsequenceLevel): FindingSeverity {
  if (level === 'critical') return 'critical';
  if (level === 'high') return 'high';
  return 'moderate';
}

function dimensionLabel(dimension: ScanDimension): string {
  return dimension.replaceAll('_', ' ');
}

function requiredDimensions(request: MissingnessScanRequest): ScanDimension[] {
  const required = new Set<ScanDimension>([
    'dependencies_prerequisites',
    'authority_approvals',
    'reusable_capability',
  ]);
  const level = CONSEQUENCE_ORDER[request.consequenceLevel];
  const flags = request.flags ?? {};

  if (request.substantialWork || level >= CONSEQUENCE_ORDER.moderate) {
    required.add('assumptions_confidence');
    required.add('rollback_recovery');
    required.add('observability_evidence');
    required.add('testing_acceptance');
    required.add('reversibility');
  }
  if (level >= CONSEQUENCE_ORDER.high) {
    required.add('adjacent_systems');
    required.add('failure_modes');
    required.add('security_data_integrity');
    required.add('maintenance_ownership_documentation');
    required.add('cost_provider_dependency');
  }
  if (flags.production || flags.dataMutation || flags.securityBoundary) {
    required.add('security_data_integrity');
    required.add('rollback_recovery');
    required.add('observability_evidence');
    required.add('testing_acceptance');
  }
  if (flags.userFacing) required.add('usability_accessibility');
  if (flags.paidProvider) required.add('cost_provider_dependency');
  if (flags.externalDependency) required.add('dependencies_prerequisites');
  if (flags.dataMutation || flags.irreversible) required.add('reversibility');
  if (flags.irreversible || flags.longLivedArchitecture) required.add('costly_to_reverse_commitments');
  if (flags.longLivedArchitecture) required.add('maintenance_ownership_documentation');

  return [...required].sort((left, right) => (DIMENSION_ORDER.get(left) ?? 0) - (DIMENSION_ORDER.get(right) ?? 0));
}

function validateRequest(request: MissingnessScanRequest): void {
  assertUuid(request.projectId, 'CE-003 project id');
  assertUuid(request.taskId, 'CE-003 task id');
  boundedString(request.objective, 'CE-003 objective', 12000);
  boundedString(request.proposedAction, 'CE-003 proposed action', 12000);
  boundedString(request.sourceSystem, 'CE-003 source system', 256);
  boundedString(request.sourceRef, 'CE-003 source reference', 4096);
  normalizeTimestamp(request.observedAt);
  if (request.actorId !== undefined && request.actorId !== null) assertUuid(request.actorId, 'CE-003 actor id');
  if (!['low', 'moderate', 'high', 'critical'].includes(request.consequenceLevel)) {
    throw new Error('Invalid CE-003 consequence level');
  }
  if (typeof request.substantialWork !== 'boolean') throw new Error('Invalid CE-003 substantial-work flag');
  if (!request.authority || !['authorized', 'requires_approval', 'unknown'].includes(request.authority.state)) {
    throw new Error('Invalid CE-003 authority state');
  }
  assertEvidenceRefs(request.authority.evidenceRefs, 'CE-003 authority evidence');
  if (request.authority.approvalRef !== undefined && request.authority.approvalRef !== null) {
    boundedString(request.authority.approvalRef, 'CE-003 approval reference', 4096);
  }

  const assessmentSeen = new Set<ScanDimension>();
  for (const assessment of request.assessments ?? []) {
    if (!CE_SCAN_DIMENSIONS.includes(assessment.dimension)) throw new Error('Invalid CE-003 scan dimension');
    if (assessmentSeen.has(assessment.dimension)) throw new Error(`Duplicate CE-003 assessment: ${assessment.dimension}`);
    assessmentSeen.add(assessment.dimension);
    if (!['satisfied', 'gap', 'unknown', 'not_applicable'].includes(assessment.status)) {
      throw new Error(`Invalid CE-003 assessment status: ${assessment.dimension}`);
    }
    if (!['verified', 'mixed', 'uncertain'].includes(assessment.confidence)) {
      throw new Error(`Invalid CE-003 assessment confidence: ${assessment.dimension}`);
    }
    boundedString(assessment.rationale, `CE-003 assessment rationale ${assessment.dimension}`, 6000);
    assertEvidenceRefs(assessment.evidenceRefs, `CE-003 assessment evidence ${assessment.dimension}`);
    if (assessment.status === 'satisfied' && assessment.confidence === 'uncertain') {
      throw new Error(`Contradictory CE-003 assessment: ${assessment.dimension}`);
    }
  }

  assertUniqueKeys(request.dependencies ?? [], 'CE-003 dependency');
  for (const dependency of request.dependencies ?? []) {
    if (typeof dependency.required !== 'boolean' || !['available', 'unavailable', 'unknown'].includes(dependency.status)) {
      throw new Error(`Invalid CE-003 dependency: ${dependency.key}`);
    }
    assertEvidenceRefs(dependency.evidenceRefs, `CE-003 dependency evidence ${dependency.key}`);
  }

  assertUniqueKeys(request.assumptions ?? [], 'CE-003 assumption');
  for (const assumption of request.assumptions ?? []) {
    boundedString(assumption.statement, `CE-003 assumption statement ${assumption.key}`, 6000);
    if (typeof assumption.material !== 'boolean' || !['high', 'medium', 'low', 'unknown'].includes(assumption.confidence)) {
      throw new Error(`Invalid CE-003 assumption: ${assumption.key}`);
    }
    assertEvidenceRefs(assumption.evidenceRefs, `CE-003 assumption evidence ${assumption.key}`);
  }

  const adjacentSeen = new Set<string>();
  for (const impact of request.adjacentSystems ?? []) {
    boundedString(impact.system, 'CE-003 adjacent system', 512);
    if (adjacentSeen.has(impact.system)) throw new Error(`Duplicate CE-003 adjacent system: ${impact.system}`);
    adjacentSeen.add(impact.system);
    if (typeof impact.affected !== 'boolean' || typeof impact.impactKnown !== 'boolean') {
      throw new Error(`Invalid CE-003 adjacent-system flags: ${impact.system}`);
    }
    if (impact.owner !== null) boundedString(impact.owner, `CE-003 adjacent-system owner ${impact.system}`, 512);
    assertEvidenceRefs(impact.evidenceRefs, `CE-003 adjacent-system evidence ${impact.system}`);
  }

  assertUniqueKeys(request.commitments ?? [], 'CE-003 commitment');
  for (const commitment of request.commitments ?? []) {
    boundedString(commitment.description, `CE-003 commitment description ${commitment.key}`, 6000);
    if (!['low', 'moderate', 'high', 'critical'].includes(commitment.costLevel)
        || !['easy', 'moderate', 'hard', 'irreversible', 'unknown'].includes(commitment.reversibility)
        || typeof commitment.alternativePreserved !== 'boolean') {
      throw new Error(`Invalid CE-003 commitment: ${commitment.key}`);
    }
    if (commitment.reconsiderationTrigger !== null) {
      boundedString(commitment.reconsiderationTrigger, `CE-003 reconsideration trigger ${commitment.key}`, 4096);
    }
    assertEvidenceRefs(commitment.evidenceRefs, `CE-003 commitment evidence ${commitment.key}`);
  }

  if (request.reuse) {
    if (!['checked_reuse', 'checked_no_fit', 'not_checked'].includes(request.reuse.status)) {
      throw new Error('Invalid CE-003 reuse status');
    }
    boundedString(request.reuse.rationale, 'CE-003 reuse rationale', 6000);
    assertEvidenceRefs(request.reuse.evidenceRefs, 'CE-003 reuse evidence');
    if (request.reuse.status === 'checked_reuse' && !request.reuse.capabilityRef) {
      throw new Error('CE-003 checked reuse requires a capability reference');
    }
    if (request.reuse.capabilityRef !== undefined && request.reuse.capabilityRef !== null) {
      boundedString(request.reuse.capabilityRef, 'CE-003 reuse capability reference', 4096);
    }
  }

  assertUniqueKeys(request.opportunities ?? [], 'CE-003 opportunity');
  for (const opportunity of request.opportunities ?? []) {
    boundedString(opportunity.description, `CE-003 opportunity description ${opportunity.key}`, 6000);
    if (typeof opportunity.material !== 'boolean'
        || !['low', 'moderate', 'high'].includes(opportunity.implementationCost)
        || typeof opportunity.preservesOption !== 'boolean') {
      throw new Error(`Invalid CE-003 opportunity: ${opportunity.key}`);
    }
    assertEvidenceRefs(opportunity.evidenceRefs, `CE-003 opportunity evidence ${opportunity.key}`);
  }
}

function effectiveAssessment(
  request: MissingnessScanRequest,
  explicit: Map<ScanDimension, DimensionAssessment>,
  dimension: ScanDimension,
): DimensionAssessment | null {
  const direct = explicit.get(dimension);
  if (direct) return direct;

  if (dimension === 'authority_approvals') {
    if (request.authority.state === 'authorized') {
      return {
        dimension,
        status: 'satisfied',
        confidence: request.authority.evidenceRefs.length > 0 ? 'verified' : 'mixed',
        rationale: 'Continuation authority is explicitly authorized.',
        evidenceRefs: request.authority.evidenceRefs,
      };
    }
    return {
      dimension,
      status: request.authority.state === 'unknown' ? 'unknown' : 'gap',
      confidence: request.authority.state === 'unknown' ? 'uncertain' : 'verified',
      rationale: request.authority.state === 'unknown'
        ? 'Authority has not been established.'
        : 'The proposed action requires approval before execution.',
      evidenceRefs: request.authority.evidenceRefs,
      nextAction: request.authority.state === 'unknown' ? 'Establish the governing authority.' : 'Obtain the required approval.',
    };
  }

  if (dimension === 'dependencies_prerequisites' && request.dependencies !== undefined) {
    const required = request.dependencies.filter(item => item.required);
    const unavailable = required.filter(item => item.status === 'unavailable');
    const unknown = required.filter(item => item.status === 'unknown');
    return {
      dimension,
      status: unavailable.length > 0 ? 'gap' : unknown.length > 0 ? 'unknown' : 'satisfied',
      confidence: unknown.length > 0 ? 'uncertain' : 'verified',
      rationale: required.length === 0
        ? 'No required dependencies were declared.'
        : `${required.length} required dependency record(s) were evaluated.`,
      evidenceRefs: required.flatMap(item => item.evidenceRefs),
    };
  }

  if (dimension === 'assumptions_confidence' && request.assumptions !== undefined) {
    const material = request.assumptions.filter(item => item.material);
    const weak = material.filter(item => item.confidence === 'low' || item.confidence === 'unknown' || item.evidenceRefs.length === 0);
    return {
      dimension,
      status: weak.length > 0 ? 'gap' : material.length === 0 ? 'not_applicable' : 'satisfied',
      confidence: weak.some(item => item.confidence === 'unknown') ? 'uncertain' : weak.length > 0 ? 'mixed' : 'verified',
      rationale: material.length === 0
        ? 'No material assumptions were declared.'
        : `${material.length} material assumption record(s) were evaluated.`,
      evidenceRefs: material.flatMap(item => item.evidenceRefs),
    };
  }

  if (dimension === 'adjacent_systems' && request.adjacentSystems !== undefined) {
    const affected = request.adjacentSystems.filter(item => item.affected);
    const unresolved = affected.filter(item => !item.impactKnown || !item.owner);
    return {
      dimension,
      status: unresolved.length > 0 ? 'gap' : affected.length === 0 ? 'not_applicable' : 'satisfied',
      confidence: unresolved.length > 0 ? 'mixed' : 'verified',
      rationale: affected.length === 0
        ? 'No adjacent systems were declared affected.'
        : `${affected.length} affected adjacent system record(s) were evaluated.`,
      evidenceRefs: affected.flatMap(item => item.evidenceRefs),
    };
  }

  if (dimension === 'reusable_capability' && request.reuse) {
    return {
      dimension,
      status: request.reuse.status === 'not_checked' ? 'gap' : 'satisfied',
      confidence: request.reuse.evidenceRefs.length > 0 ? 'verified' : 'mixed',
      rationale: request.reuse.rationale,
      evidenceRefs: request.reuse.evidenceRefs,
      nextAction: request.reuse.nextAction,
    };
  }

  if (dimension === 'costly_to_reverse_commitments' && request.commitments !== undefined) {
    const material = request.commitments.filter(item =>
      item.costLevel === 'high'
      || item.costLevel === 'critical'
      || item.reversibility === 'hard'
      || item.reversibility === 'irreversible'
      || item.reversibility === 'unknown');
    const weak = material.filter(item => !item.alternativePreserved || !item.reconsiderationTrigger);
    return {
      dimension,
      status: weak.length > 0 ? 'gap' : material.length === 0 ? 'not_applicable' : 'satisfied',
      confidence: material.some(item => item.reversibility === 'unknown') ? 'uncertain' : 'verified',
      rationale: material.length === 0
        ? 'No costly-to-reverse commitment was declared.'
        : `${material.length} costly-to-reverse commitment record(s) were evaluated.`,
      evidenceRefs: material.flatMap(item => item.evidenceRefs),
    };
  }

  return null;
}

function makeFinding(
  scanFingerprint: string,
  input: Omit<MissingnessFinding, 'fingerprint' | 'evidenceRefs'> & { evidenceRefs?: ScanEvidenceRef[] },
): MissingnessFinding {
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs ?? []);
  const fingerprint = sha256({
    version: CE_MISSINGNESS_SCAN_VERSION,
    scanFingerprint,
    code: input.code,
    subjectKey: input.subjectKey,
    dimension: input.dimension,
    type: input.type,
    severity: input.severity,
    blocking: input.blocking,
    requiresAction: input.requiresAction,
    summary: input.summary,
    rationale: input.rationale,
    nextAction: input.nextAction,
    evidenceRefs,
  });
  return { ...input, evidenceRefs, fingerprint };
}

export function scanMissingness(request: MissingnessScanRequest): MissingnessScanResult {
  validateRequest(request);
  const observedAt = normalizeTimestamp(request.observedAt);
  const normalizedRequest = { ...request, observedAt };
  const scanFingerprint = sha256({ version: CE_MISSINGNESS_SCAN_VERSION, request: normalizedRequest });
  const required = requiredDimensions(request);
  const explicit = new Map((request.assessments ?? []).map(item => [item.dimension, item]));
  const findings: MissingnessFinding[] = [];
  const dimensionSpecific = new Set<ScanDimension>();
  const add = (input: Omit<MissingnessFinding, 'fingerprint' | 'evidenceRefs'> & { evidenceRefs?: ScanEvidenceRef[] }): void => {
    findings.push(makeFinding(scanFingerprint, input));
    dimensionSpecific.add(input.dimension);
  };
  const severity = consequenceSeverity(request.consequenceLevel);

  if (request.authority.state === 'unknown') {
    add({
      code: 'AUTHORITY_UNKNOWN',
      subjectKey: null,
      dimension: 'authority_approvals',
      type: 'risk',
      severity: request.consequenceLevel === 'critical' ? 'critical' : 'high',
      blocking: true,
      requiresAction: true,
      summary: 'Authority for the proposed action is unknown.',
      rationale: 'CE-003 cannot infer permission from context, confidence, or apparent usefulness.',
      nextAction: 'Establish the governing authority before proceeding.',
      evidenceRefs: request.authority.evidenceRefs,
    });
  } else if (request.authority.state === 'requires_approval') {
    add({
      code: 'AUTHORITY_APPROVAL_REQUIRED',
      subjectKey: request.authority.approvalRef ?? null,
      dimension: 'authority_approvals',
      type: 'forward_consequence',
      severity: request.consequenceLevel === 'critical' ? 'critical' : 'high',
      blocking: true,
      requiresAction: true,
      summary: 'The proposed action crosses an explicit approval boundary.',
      rationale: 'The scan may identify the boundary but cannot grant the missing authority.',
      nextAction: 'Obtain and record the required approval before execution.',
      evidenceRefs: request.authority.evidenceRefs,
    });
  }

  for (const dependency of request.dependencies ?? []) {
    if (!dependency.required || dependency.status === 'available') continue;
    add({
      code: dependency.status === 'unavailable' ? 'DEPENDENCY_UNAVAILABLE' : 'DEPENDENCY_UNKNOWN',
      subjectKey: dependency.key,
      dimension: 'dependencies_prerequisites',
      type: 'missingness',
      severity,
      blocking: required.includes('dependencies_prerequisites'),
      requiresAction: true,
      summary: `Required dependency ${dependency.key} is ${dependency.status}.`,
      rationale: 'A required dependency cannot be treated as available without authoritative evidence.',
      nextAction: dependency.nextAction ?? `Resolve dependency ${dependency.key} before relying on it.`,
      evidenceRefs: dependency.evidenceRefs,
    });
  }

  for (const assumption of request.assumptions ?? []) {
    if (!assumption.material) continue;
    if (assumption.confidence === 'high' || assumption.confidence === 'medium') {
      if (assumption.evidenceRefs.length > 0) continue;
    }
    const blocking = CONSEQUENCE_ORDER[request.consequenceLevel] >= CONSEQUENCE_ORDER.high;
    add({
      code: assumption.evidenceRefs.length === 0 ? 'ASSUMPTION_UNPROVEN' : 'ASSUMPTION_WEAK',
      subjectKey: assumption.key,
      dimension: 'assumptions_confidence',
      type: 'missingness',
      severity: blocking ? 'high' : 'moderate',
      blocking,
      requiresAction: true,
      summary: `Material assumption ${assumption.key} is not adequately supported.`,
      rationale: assumption.statement,
      nextAction: assumption.nextAction ?? `Validate or explicitly bound assumption ${assumption.key}.`,
      evidenceRefs: assumption.evidenceRefs,
    });
  }

  for (const impact of request.adjacentSystems ?? []) {
    if (!impact.affected || (impact.impactKnown && impact.owner)) continue;
    const blocking = CONSEQUENCE_ORDER[request.consequenceLevel] >= CONSEQUENCE_ORDER.high;
    add({
      code: 'ADJACENT_IMPACT_UNRESOLVED',
      subjectKey: impact.system,
      dimension: 'adjacent_systems',
      type: 'forward_consequence',
      severity: blocking ? 'high' : 'moderate',
      blocking,
      requiresAction: true,
      summary: `Affected adjacent system ${impact.system} lacks a resolved impact or owner.`,
      rationale: 'A known adjacent effect should not become an unowned downstream surprise.',
      nextAction: impact.nextAction ?? `Resolve the impact and accountable owner for ${impact.system}.`,
      evidenceRefs: impact.evidenceRefs,
    });
  }

  for (const commitment of request.commitments ?? []) {
    const costly = commitment.costLevel === 'high' || commitment.costLevel === 'critical';
    const hardToReverse = commitment.reversibility === 'hard'
      || commitment.reversibility === 'irreversible'
      || commitment.reversibility === 'unknown';
    if (!costly && !hardToReverse) continue;
    if (commitment.alternativePreserved && commitment.reconsiderationTrigger) continue;
    const blocking = request.consequenceLevel === 'critical' || commitment.reversibility === 'irreversible';
    add({
      code: 'COMMITMENT_OPTIONALITY_WEAK',
      subjectKey: commitment.key,
      dimension: 'costly_to_reverse_commitments',
      type: 'forward_consequence',
      severity: commitment.reversibility === 'irreversible' || commitment.costLevel === 'critical' ? 'critical' : 'high',
      blocking,
      requiresAction: true,
      summary: `Commitment ${commitment.key} does not preserve enough optionality.`,
      rationale: commitment.description,
      nextAction: commitment.nextAction ?? 'Preserve a viable alternative and define an evidence-based reconsideration trigger before cementing the commitment.',
      evidenceRefs: commitment.evidenceRefs,
    });
  }

  if (request.reuse?.status === 'not_checked') {
    const blocking = request.substantialWork || CONSEQUENCE_ORDER[request.consequenceLevel] >= CONSEQUENCE_ORDER.moderate;
    add({
      code: 'REUSE_NOT_CHECKED',
      subjectKey: null,
      dimension: 'reusable_capability',
      type: 'missingness',
      severity: blocking ? 'high' : 'moderate',
      blocking,
      requiresAction: true,
      summary: 'Existing reusable capability has not been checked.',
      rationale: request.reuse.rationale,
      nextAction: request.reuse.nextAction ?? 'Search existing CoMind capabilities and adapt or extend them before creating a parallel mechanism.',
      evidenceRefs: request.reuse.evidenceRefs,
    });
  }

  for (const opportunity of request.opportunities ?? []) {
    if (!opportunity.material || opportunity.implementationCost !== 'low' || !opportunity.preservesOption) continue;
    add({
      code: 'LOW_COST_OPTION_PRESERVATION',
      subjectKey: opportunity.key,
      dimension: 'low_cost_opportunities',
      type: 'opportunity',
      severity: 'moderate',
      blocking: false,
      requiresAction: true,
      summary: `Low-cost option ${opportunity.key} is worth preserving now.`,
      rationale: opportunity.description,
      nextAction: opportunity.nextAction ?? 'Preserve the option now if it does not materially delay the primary objective.',
      evidenceRefs: opportunity.evidenceRefs,
    });
  }

  for (const dimension of required) {
    const assessment = effectiveAssessment(request, explicit, dimension);
    if (!assessment) {
      add({
        code: 'REQUIRED_DIMENSION_UNASSESSED',
        subjectKey: dimension,
        dimension,
        type: 'missingness',
        severity,
        blocking: true,
        requiresAction: true,
        summary: `Required scan dimension ${dimensionLabel(dimension)} has not been assessed.`,
        rationale: `The ${request.consequenceLevel} consequence policy requires this dimension before the proposed action can be treated as ready.`,
        nextAction: `Assess ${dimensionLabel(dimension)} with explicit evidence or a justified not-applicable disposition.`,
      });
      continue;
    }

    if ((assessment.status === 'satisfied' || assessment.status === 'not_applicable')
        && assessment.evidenceRefs.length === 0) {
      add({
        code: 'REQUIRED_DIMENSION_PROVENANCE_MISSING',
        subjectKey: dimension,
        dimension,
        type: 'missingness',
        severity,
        blocking: true,
        requiresAction: true,
        summary: `Required scan dimension ${dimensionLabel(dimension)} lacks supporting provenance.`,
        rationale: assessment.rationale,
        nextAction: assessment.nextAction ?? `Attach authoritative evidence for ${dimensionLabel(dimension)}.`,
      });
      continue;
    }

    if ((assessment.status === 'gap' || assessment.status === 'unknown') && !dimensionSpecific.has(dimension)) {
      add({
        code: assessment.status === 'unknown' ? 'REQUIRED_DIMENSION_UNKNOWN' : 'REQUIRED_DIMENSION_GAP',
        subjectKey: dimension,
        dimension,
        type: 'missingness',
        severity,
        blocking: true,
        requiresAction: true,
        summary: `Required scan dimension ${dimensionLabel(dimension)} is ${assessment.status}.`,
        rationale: assessment.rationale,
        nextAction: assessment.nextAction ?? `Resolve ${dimensionLabel(dimension)} before proceeding.`,
        evidenceRefs: assessment.evidenceRefs,
      });
    }
  }

  const unique = new Map<string, MissingnessFinding>();
  for (const finding of findings) unique.set(finding.fingerprint, finding);
  const ordered = [...unique.values()].sort((left, right) => {
    if (left.blocking !== right.blocking) return left.blocking ? -1 : 1;
    const severityDelta = SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
    if (severityDelta !== 0) return severityDelta;
    const dimensionDelta = (DIMENSION_ORDER.get(left.dimension) ?? 0) - (DIMENSION_ORDER.get(right.dimension) ?? 0);
    if (dimensionDelta !== 0) return dimensionDelta;
    const codeDelta = left.code.localeCompare(right.code);
    if (codeDelta !== 0) return codeDelta;
    return (left.subjectKey ?? '').localeCompare(right.subjectKey ?? '');
  });

  const blocking = ordered.some(item => item.blocking);
  const decision: ScanDecision = blocking ? 'blocked' : ordered.length > 0 ? 'proceed_with_attention' : 'proceed';
  const confidence: AssessmentConfidence = blocking
    ? ordered.some(item => item.code.includes('UNKNOWN') || item.code.includes('UNASSESSED')) ? 'uncertain' : 'mixed'
    : ordered.length > 0 ? 'mixed' : 'verified';

  return {
    version: CE_MISSINGNESS_SCAN_VERSION,
    scanFingerprint,
    consequenceLevel: request.consequenceLevel,
    requiredDimensions: required,
    decision,
    confidence,
    proceedAllowed: !blocking,
    findings: ordered,
  };
}

export async function persistMissingnessFindings(
  query: QueryFunction,
  request: MissingnessScanRequest,
  result: MissingnessScanResult,
): Promise<MissingnessPersistenceResult> {
  validateRequest(request);
  if (result.version !== CE_MISSINGNESS_SCAN_VERSION) throw new Error('Unsupported CE-003 scan result version');
  const recomputed = scanMissingness(request);
  if (recomputed.scanFingerprint !== result.scanFingerprint
      || sha256(recomputed.findings) !== sha256(result.findings)) {
    throw new Error('CE-003 scan result does not match the supplied request');
  }

  const persisted: PersistedFinding[] = [];
  for (const finding of result.findings) {
    const idempotencyKey = `ce-003:${result.scanFingerprint}:${finding.fingerprint}`;
    const existing = await query<{ signal_id: string }>(
      `SELECT signal_id::text AS signal_id
         FROM comind.cm_ce_signal
        WHERE project_id=$1::uuid AND idempotency_key=$2
        LIMIT 1`,
      [request.projectId, idempotencyKey],
    );
    if (existing.rows[0]) {
      persisted.push({
        findingFingerprint: finding.fingerprint,
        idempotencyKey,
        signalId: existing.rows[0].signal_id,
        replayed: true,
      });
      continue;
    }

    const signalType = finding.type === 'opportunity' ? 'opportunity' : 'missingness';
    const inserted = await query<{ signal_id: string }>(
      `SELECT comind.record_ce_signal(
         $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::jsonb,
         'continuous_excellence',$9,$10,$11::timestamptz
       )::text AS signal_id`,
      [
        request.projectId,
        request.taskId,
        request.actorId ?? null,
        signalType,
        finding.severity,
        finding.requiresAction,
        finding.summary,
        JSON.stringify({
          ceVersion: CE_MISSINGNESS_SCAN_VERSION,
          scanFingerprint: result.scanFingerprint,
          decision: result.decision,
          finding,
          originatingSource: { system: request.sourceSystem, ref: request.sourceRef },
        }),
        request.sourceRef,
        idempotencyKey,
        normalizeTimestamp(request.observedAt),
      ],
    );
    const signalId = inserted.rows[0]?.signal_id;
    if (!signalId) throw new Error(`CE-003 signal persistence returned no identifier for ${finding.code}`);
    persisted.push({ findingFingerprint: finding.fingerprint, idempotencyKey, signalId, replayed: false });
  }

  return {
    scanFingerprint: result.scanFingerprint,
    persisted,
    replayedCount: persisted.filter(item => item.replayed).length,
  };
}
