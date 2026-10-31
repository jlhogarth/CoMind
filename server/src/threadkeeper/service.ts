import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import { assessContinuity } from './assessment.js';
import {
  acceptCheckpointProposal,
  createCheckpointProposal,
} from './checkpoint.js';
import { validateCheckpointLineage, type CheckpointLineageNode } from './lineage.js';
import {
  NoopThreadKeeperObservability,
  type ThreadKeeperObservability,
} from './observability.js';
import { recommendRoute, THREADKEEPER_ROUTE_POLICY_VERSION } from './routing.js';
import { resolveScopeBinding } from './scope.js';
import type {
  AssessmentSignals,
  AuthorityValidationResult,
  CheckpointAcceptanceResult,
  CheckpointProposal,
  CheckpointProposalInput,
  ContinuityAssessment,
  ContinuityObservation,
  EvidenceRef,
  RouteRecommendation,
} from './types.js';

const MAX_OBSERVATION_BYTES = 65536;
const OBSERVATION_KEYS = new Set([
  'observationId', 'eventType', 'sourceSystem', 'observedAt', 'scopeBinding',
  'priorCheckpointRef', 'currentStateRefs', 'findingType', 'findingSeverity',
  'confidence', 'uncertainty', 'evidenceRefs', 'actorRef', 'authorityRef',
  'policyRef', 'correlationId', 'causationRef', 'traceId', 'spanId',
  'sensitivity', 'retentionClass',
]);
const EVIDENCE_REF_KEYS = new Set(['provider', 'kind', 'ref', 'version', 'digest', 'sensitivity']);

export type EvidenceResolutionStatus = 'available' | 'missing' | 'unverifiable' | 'conflicting';

export interface EvidenceResolution {
  status: EvidenceResolutionStatus;
  ref: EvidenceRef;
}

export interface EvidenceResolver {
  resolve(ref: EvidenceRef): Promise<EvidenceResolution>;
}

export interface ObservationReceipt {
  observationId: string;
  scopeSemanticKey: string;
  observationDigest: string;
  disposition: 'accepted' | 'duplicate' | 'rejected' | 'quarantined';
  reasonCodes: string[];
}

export interface ObservationReferenceRegistry {
  register(input: {
    observationId: string;
    scopeSemanticKey: string;
    observationDigest: string;
  }): Promise<'accepted' | 'duplicate' | 'conflict'>;
}

export class InMemoryObservationReferenceRegistry implements ObservationReferenceRegistry {
  #digests = new Map<string, string>();

  async register(input: {
    observationId: string;
    scopeSemanticKey: string;
    observationDigest: string;
  }): Promise<'accepted' | 'duplicate' | 'conflict'> {
    const key = `${input.scopeSemanticKey}\u0000${input.observationId}`;
    const existing = this.#digests.get(key);
    if (existing === undefined) {
      this.#digests.set(key, input.observationDigest);
      return 'accepted';
    }
    return existing === input.observationDigest ? 'duplicate' : 'conflict';
  }
}

export interface ThreadKeeperContextReader<TContext> {
  getContext(scopeSemanticKey: string): Promise<TContext | null>;
}

export interface ThreadKeeperLineageReader<TNode extends CheckpointLineageNode> {
  getLineage(scopeSemanticKey: string): Promise<TNode[]>;
}

export interface AssessObservationInput {
  observation: ContinuityObservation;
  receipt: ObservationReceipt;
  checkpointId: string | null;
  acceptedBaselinePresent: boolean;
  checkpointIntegrityValid: boolean;
  checkpointAuthorityValid: boolean;
  predecessorStatus: AssessmentSignals['predecessorStatus'];
  authoritativeConflict: boolean;
  authorizedChange: boolean;
  materialChange: boolean;
  incompatibilityProven: boolean;
}

export interface RouteOutcomeInput {
  destinationAvailable: boolean;
  destinationReportedSuccess: boolean;
  authoritativeCompletionEvidenceRef?: string;
}

export interface RouteOutcome {
  state: 'RESOLVED' | 'UNRESOLVED';
  reasonCodes: string[];
  resolutionRef?: string;
}

function boundedString(value: unknown, field: string, max: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, field: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error(`Unsupported ${field} field`);
}

function boundedOptionalNumber(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error(`Invalid ${field}`);
  }
}

function validateEvidenceRef(ref: EvidenceRef): void {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new Error('Invalid evidence reference');
  exactKeys(ref as unknown as Record<string, unknown>, EVIDENCE_REF_KEYS, 'evidence reference');
  boundedString(ref.provider, 'evidence provider', 256);
  boundedString(ref.kind, 'evidence kind', 256);
  boundedString(ref.ref, 'evidence ref', 4096);
  if (ref.version !== undefined) boundedString(ref.version, 'evidence version', 512);
  if (ref.digest !== undefined && !/^[a-f0-9]{64}$/i.test(ref.digest)) throw new Error('Invalid evidence digest');
  if (ref.sensitivity !== undefined) boundedString(ref.sensitivity, 'evidence sensitivity', 128);
}

function validateStringRefs(values: string[], field: string): void {
  if (!Array.isArray(values)) throw new Error(`Invalid ${field}`);
  if (values.length > 256) throw new Error(`Too many ${field}`);
  for (const value of values) boundedString(value, field, 4096);
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field}`);
}

function validateObservation(input: ContinuityObservation): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid continuity observation');
  exactKeys(input as unknown as Record<string, unknown>, OBSERVATION_KEYS, 'continuity observation');
  boundedString(input.observationId, 'observation id', 512);
  boundedString(input.eventType, 'observation event type', 256);
  boundedString(input.sourceSystem, 'observation source system', 256);
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('Invalid observation timestamp');
  resolveScopeBinding(input.scopeBinding);
  if (input.priorCheckpointRef !== undefined) boundedString(input.priorCheckpointRef, 'prior checkpoint reference', 512);
  validateStringRefs(input.currentStateRefs, 'current state reference');
  if (input.findingType !== undefined) boundedString(input.findingType, 'finding type', 256);
  if (input.findingSeverity !== undefined) boundedString(input.findingSeverity, 'finding severity', 128);
  boundedOptionalNumber(input.confidence, 'observation confidence');
  boundedOptionalNumber(input.uncertainty, 'observation uncertainty');
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length > 256) throw new Error('Invalid observation evidence references');
  input.evidenceRefs.forEach(validateEvidenceRef);
  for (const [field, value, max] of [
    ['actor reference', input.actorRef, 512],
    ['authority reference', input.authorityRef, 4096],
    ['policy reference', input.policyRef, 512],
    ['correlation id', input.correlationId, 512],
    ['causation reference', input.causationRef, 512],
    ['trace id', input.traceId, 256],
    ['span id', input.spanId, 256],
  ] as const) {
    if (value !== undefined) boundedString(value, field, max);
  }
  boundedString(input.sensitivity, 'observation sensitivity', 128);
  boundedString(input.retentionClass, 'observation retention class', 128);
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_OBSERVATION_BYTES) {
    throw new Error('Continuity observation exceeds 64 KiB');
  }
}

function evidenceStatus(resolutions: EvidenceResolution[], hadResolverFailure: boolean): EvidenceResolutionStatus {
  if (hadResolverFailure) return 'unverifiable';
  if (resolutions.length === 0) return 'missing';
  if (resolutions.some(item => item.status === 'conflicting')) return 'conflicting';
  if (resolutions.some(item => item.status === 'unverifiable')) return 'unverifiable';
  if (resolutions.some(item => item.status === 'missing')) return 'missing';
  return 'available';
}

function acceptanceMetric(result: CheckpointAcceptanceResult): 'accepted' | 'stale_head' | 'authority_failure' | 'integrity_failure' {
  if (result.accepted) return 'accepted';
  if (result.reasonCode === 'checkpoint_acceptance_stale_head') return 'stale_head';
  if (result.reasonCode === 'checkpoint_proposal_integrity_invalid') return 'integrity_failure';
  return 'authority_failure';
}

export class ThreadKeeperService {
  readonly #observability: ThreadKeeperObservability;
  readonly #registry: ObservationReferenceRegistry;
  readonly #evidenceResolver: EvidenceResolver;
  readonly #nowMs: () => number;

  constructor(input: {
    observationRegistry: ObservationReferenceRegistry;
    evidenceResolver: EvidenceResolver;
    observability?: ThreadKeeperObservability;
    nowMs?: () => number;
  }) {
    this.#registry = input.observationRegistry;
    this.#evidenceResolver = input.evidenceResolver;
    this.#observability = input.observability ?? new NoopThreadKeeperObservability();
    this.#nowMs = input.nowMs ?? (() => performance.now());
  }

  async observe(input: ContinuityObservation, candidateScopeIds: string[] = []): Promise<ObservationReceipt> {
    const started = this.#nowMs();
    try {
      validateObservation(input);
      let scope;
      try {
        scope = resolveScopeBinding(input.scopeBinding, candidateScopeIds);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Ambiguous continuity scope identity')) {
          this.#observability.scopeIdentityCollision();
          this.#observability.observation('quarantined');
          return {
            observationId: input.observationId,
            scopeSemanticKey: '',
            observationDigest: '',
            disposition: 'quarantined',
            reasonCodes: ['scope_identity_ambiguous'],
          };
        }
        throw error;
      }
      const observationDigest = fingerprintCanonicalValue(input);
      const registered = await this.#registry.register({
        observationId: input.observationId,
        scopeSemanticKey: scope.semanticKey,
        observationDigest,
      });
      if (registered === 'conflict') {
        this.#observability.observation('rejected');
        return {
          observationId: input.observationId,
          scopeSemanticKey: scope.semanticKey,
          observationDigest,
          disposition: 'rejected',
          reasonCodes: ['observation_integrity_conflict'],
        };
      }
      this.#observability.observation(registered === 'duplicate' ? 'duplicate' : 'accepted');
      return {
        observationId: input.observationId,
        scopeSemanticKey: scope.semanticKey,
        observationDigest,
        disposition: registered === 'duplicate' ? 'duplicate' : 'accepted',
        reasonCodes: registered === 'duplicate' ? ['observation_duplicate'] : [],
      };
    } catch (error) {
      this.#observability.observation('rejected');
      throw error;
    } finally {
      this.#observability.latency('observation_validation', this.#nowMs() - started);
    }
  }

  async assess(input: AssessObservationInput): Promise<ContinuityAssessment> {
    const started = this.#nowMs();
    try {
      if (!['accepted', 'duplicate'].includes(input.receipt.disposition)) {
        throw new Error('ThreadKeeper cannot assess a rejected or quarantined observation');
      }
      if (input.receipt.observationId !== input.observation.observationId) {
        throw new Error('ThreadKeeper observation receipt identity mismatch');
      }
      const resolutions: EvidenceResolution[] = [];
      let resolverFailure = false;
      for (const ref of input.observation.evidenceRefs) {
        try {
          const resolved = await this.#evidenceResolver.resolve(structuredClone(ref));
          if (!resolved || !['available', 'missing', 'unverifiable', 'conflicting'].includes(resolved.status)) {
            throw new Error('Invalid ThreadKeeper evidence resolution');
          }
          validateEvidenceRef(resolved.ref);
          if (fingerprintCanonicalValue(resolved.ref) !== fingerprintCanonicalValue(ref)) {
            throw new Error('ThreadKeeper evidence resolver changed the opaque reference');
          }
          resolutions.push(resolved);
        } catch {
          resolverFailure = true;
          this.#observability.evidenceResolverFailure();
        }
      }
      const requiredEvidenceStatus = evidenceStatus(resolutions, resolverFailure);
      const result = assessContinuity({
        scopeSemanticKey: input.receipt.scopeSemanticKey,
        checkpointId: input.checkpointId,
        observationId: input.observation.observationId,
        evidenceRefs: structuredClone(input.observation.evidenceRefs),
        signals: {
          scopeStatus: 'valid',
          requiredEvidenceStatus,
          acceptedBaselinePresent: input.acceptedBaselinePresent,
          checkpointIntegrityValid: input.checkpointIntegrityValid,
          checkpointAuthorityValid: input.checkpointAuthorityValid,
          predecessorStatus: input.predecessorStatus,
          authoritativeConflict: input.authoritativeConflict,
          authorizedChange: input.authorizedChange,
          materialChange: input.materialChange,
          incompatibilityProven: input.incompatibilityProven,
        },
        ...(input.observation.traceId ? { traceId: input.observation.traceId } : {}),
      });
      this.#observability.assessment(
        result.classification,
        requiredEvidenceStatus === 'missing' || requiredEvidenceStatus === 'unverifiable',
      );
      if (!input.checkpointIntegrityValid) this.#observability.checkpointAcceptance('integrity_failure');
      if (!input.checkpointAuthorityValid) this.#observability.checkpointAcceptance('authority_failure');
      return result;
    } finally {
      this.#observability.latency('assessment', this.#nowMs() - started);
    }
  }

  route(assessment: ContinuityAssessment, priorRoutes: RouteRecommendation[] = []): RouteRecommendation {
    const recommendation = recommendRoute(assessment);
    const repeated = priorRoutes.length >= 2
      && priorRoutes.slice(-2).every(item => item.routeCode === recommendation.routeCode);
    if (repeated) {
      this.#observability.repeatedRouteCycle();
      const escalated: RouteRecommendation = {
        routeCode: recommendation.routeCode === 'REQUEST_GOVERNANCE_REVIEW'
          ? 'REQUEST_HUMAN_REVIEW'
          : 'REQUEST_GOVERNANCE_REVIEW',
        policyVersion: THREADKEEPER_ROUTE_POLICY_VERSION,
        reasonCodes: [...new Set([...recommendation.reasonCodes, 'repeated_route_cycle'])],
        authorityRequired: true,
      };
      this.#observability.route(escalated.routeCode);
      return escalated;
    }
    this.#observability.route(recommendation.routeCode);
    return recommendation;
  }

  routeOutcome(input: RouteOutcomeInput): RouteOutcome {
    if (!input.destinationAvailable) {
      this.#observability.caseUnresolved();
      return { state: 'UNRESOLVED', reasonCodes: ['route_destination_unavailable'] };
    }
    if (input.destinationReportedSuccess && !input.authoritativeCompletionEvidenceRef) {
      this.#observability.caseUnresolved();
      return { state: 'UNRESOLVED', reasonCodes: ['authoritative_completion_evidence_missing'] };
    }
    if (!input.destinationReportedSuccess) {
      this.#observability.caseUnresolved();
      return { state: 'UNRESOLVED', reasonCodes: ['destination_not_completed'] };
    }
    boundedString(input.authoritativeCompletionEvidenceRef, 'authoritative completion evidence reference', 4096);
    return {
      state: 'RESOLVED',
      reasonCodes: ['authoritative_completion_evidence_present'],
      resolutionRef: input.authoritativeCompletionEvidenceRef,
    };
  }

  proposeCheckpoint(input: CheckpointProposalInput): CheckpointProposal {
    const started = this.#nowMs();
    try {
      const proposal = createCheckpointProposal(input);
      this.#observability.checkpointProposal();
      return proposal;
    } finally {
      this.#observability.latency('checkpoint_proposal', this.#nowMs() - started);
    }
  }

  acceptCheckpoint(
    proposal: CheckpointProposal,
    currentAcceptedCheckpointId: string | null,
    authority: AuthorityValidationResult,
    acceptedAt: string,
  ): CheckpointAcceptanceResult {
    const started = this.#nowMs();
    try {
      const result = acceptCheckpointProposal(proposal, currentAcceptedCheckpointId, authority, acceptedAt);
      this.#observability.checkpointAcceptance(acceptanceMetric(result));
      return result;
    } finally {
      this.#observability.latency('checkpoint_acceptance', this.#nowMs() - started);
    }
  }

  async getContext<TContext>(
    reader: ThreadKeeperContextReader<TContext>,
    scopeSemanticKey: string,
  ): Promise<TContext | null> {
    const started = this.#nowMs();
    try {
      return await reader.getContext(scopeSemanticKey);
    } finally {
      this.#observability.latency('context_retrieval', this.#nowMs() - started);
    }
  }

  async getLineage<TNode extends CheckpointLineageNode>(
    reader: ThreadKeeperLineageReader<TNode>,
    scopeSemanticKey: string,
  ): Promise<TNode[]> {
    const nodes = await reader.getLineage(scopeSemanticKey);
    return validateCheckpointLineage(nodes);
  }
}
