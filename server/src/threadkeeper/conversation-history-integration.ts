import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import {
  ContinuityHandoffError,
  resolveContinuityHandoff,
  type ContinuityHandoffEnvelope,
} from '../continuity/handoff.js';
import type { QueryFunction } from '../db.js';
import { verifyCheckpointProposal } from './checkpoint.js';
import {
  getCheckpointLineage,
  getContinuityContext,
  persistAcceptedCheckpoint,
  persistAssessment,
  registerContinuityScope,
  type StoredThreadKeeperAssessment,
  type ThreadKeeperContext,
} from './repository.js';
import {
  ThreadKeeperService,
  type EvidenceResolution,
  type EvidenceResolver,
  type ObservationReceipt,
} from './service.js';
import type {
  AuthorityValidationResult,
  CheckpointProposal,
  ContinuityAssessment,
  ContinuityObservation,
  EvidenceRef,
  ScopeBinding,
} from './types.js';

export const THREADKEEPER_C3_INTEGRATION_VERSION = 'tk-c3-integration-v1';
export const CONVERSATION_HISTORY_PROVIDER = 'comind.conversation-history';
export const CONVERSATION_HISTORY_EVIDENCE_KIND = 'certified-conversation-summary';
export const CONVERSATION_HISTORY_EVIDENCE_VERSION = 'chist-certified-summary-v1';
export const CONVERSATION_HISTORY_READER_ROLE = 'comind_conversation_history_reader';
export const CONVERSATION_HISTORY_SCOPE_NAMESPACE = 'comind.conversation-history';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CertifiedConversationHistorySummary {
  baselineId: string;
  certificationSha256: string;
  importId: string;
  sourceConversationId: string;
  createdAt: string | null;
  updatedAt: string | null;
  rawSourceHash: string;
  normalizedHash: string;
  topologyHash: string;
  nodeCount: number;
  messageCount: number;
  attachmentReferenceCount: number;
}

export interface ConversationHistorySummaryReader {
  read(input: {
    importId: string;
    sourceConversationId: string;
  }): Promise<CertifiedConversationHistorySummary | null>;
}

export type HistoryEvidenceOutcome = 'available' | 'missing' | 'unverifiable' | 'conflicting';
export type HandoffOutcome =
  | 'resolved'
  | 'scope_unavailable'
  | 'checkpoint_unavailable'
  | 'stale_checkpoint'
  | 'lineage_inconsistent'
  | 'error';
export type IntegrationLatencyOperation = 'history_summary_read' | 'integration_assessment' | 'handoff_resolution';

export interface ThreadKeeperC3Observability {
  historyEvidence(outcome: HistoryEvidenceOutcome): void;
  handoff(outcome: HandoffOutcome): void;
  latency(operation: IntegrationLatencyOperation, milliseconds: number): void;
}

export interface ThreadKeeperC3MetricSnapshot {
  historyEvidence: Record<HistoryEvidenceOutcome, number>;
  handoffs: Record<HandoffOutcome, number>;
  latencies: Partial<Record<IntegrationLatencyOperation, number[]>>;
}

function finiteNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid ThreadKeeper C3 latency measurement');
  return value;
}

export class NoopThreadKeeperC3Observability implements ThreadKeeperC3Observability {
  historyEvidence(_outcome: HistoryEvidenceOutcome): void {}
  handoff(_outcome: HandoffOutcome): void {}
  latency(_operation: IntegrationLatencyOperation, _milliseconds: number): void {}
}

export class InMemoryThreadKeeperC3Observability implements ThreadKeeperC3Observability {
  #snapshot: ThreadKeeperC3MetricSnapshot = {
    historyEvidence: { available: 0, missing: 0, unverifiable: 0, conflicting: 0 },
    handoffs: {
      resolved: 0,
      scope_unavailable: 0,
      checkpoint_unavailable: 0,
      stale_checkpoint: 0,
      lineage_inconsistent: 0,
      error: 0,
    },
    latencies: {},
  };

  historyEvidence(outcome: HistoryEvidenceOutcome): void {
    this.#snapshot.historyEvidence[outcome] += 1;
  }

  handoff(outcome: HandoffOutcome): void {
    this.#snapshot.handoffs[outcome] += 1;
  }

  latency(operation: IntegrationLatencyOperation, milliseconds: number): void {
    const values = this.#snapshot.latencies[operation] ?? [];
    values.push(finiteNonNegative(milliseconds));
    this.#snapshot.latencies[operation] = values;
  }

  snapshot(): ThreadKeeperC3MetricSnapshot {
    return structuredClone(this.#snapshot);
  }
}

function boundedString(value: unknown, field: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizedSummary(summary: CertifiedConversationHistorySummary): CertifiedConversationHistorySummary {
  if (!UUID_PATTERN.test(summary.baselineId)) throw new Error('Invalid Conversation History baseline id');
  if (!UUID_PATTERN.test(summary.importId)) throw new Error('Invalid Conversation History import id');
  boundedString(summary.sourceConversationId, 'Conversation History source conversation id', 2048);
  for (const [field, value] of [
    ['Conversation History certification digest', summary.certificationSha256],
    ['Conversation History raw source hash', summary.rawSourceHash],
    ['Conversation History normalized hash', summary.normalizedHash],
    ['Conversation History topology hash', summary.topologyHash],
  ] as const) {
    if (!SHA256_PATTERN.test(value)) throw new Error(`Invalid ${field}`);
  }
  for (const [field, value] of [
    ['Conversation History node count', summary.nodeCount],
    ['Conversation History message count', summary.messageCount],
    ['Conversation History attachment reference count', summary.attachmentReferenceCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field}`);
  }
  if (summary.createdAt !== null) normalizeTimestamp(summary.createdAt, 'Conversation History created timestamp');
  if (summary.updatedAt !== null) normalizeTimestamp(summary.updatedAt, 'Conversation History updated timestamp');
  return structuredClone(summary);
}

function encodedConversationId(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodedConversationId(value: string): string {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  boundedString(decoded, 'encoded Conversation History source conversation id', 2048);
  return decoded;
}

function evidenceUrn(summary: CertifiedConversationHistorySummary): string {
  return `urn:comind:chist:${summary.baselineId}:${summary.importId}:${encodedConversationId(summary.sourceConversationId)}`;
}

function summaryDigest(summary: CertifiedConversationHistorySummary): string {
  return fingerprintCanonicalValue({
    baselineId: summary.baselineId,
    certificationSha256: summary.certificationSha256,
    importId: summary.importId,
    sourceConversationId: summary.sourceConversationId,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    rawSourceHash: summary.rawSourceHash,
    normalizedHash: summary.normalizedHash,
    topologyHash: summary.topologyHash,
    nodeCount: summary.nodeCount,
    messageCount: summary.messageCount,
    attachmentReferenceCount: summary.attachmentReferenceCount,
  });
}

export function buildConversationHistoryEvidenceRef(
  summaryInput: CertifiedConversationHistorySummary,
): EvidenceRef {
  const summary = normalizedSummary(summaryInput);
  return {
    provider: CONVERSATION_HISTORY_PROVIDER,
    kind: CONVERSATION_HISTORY_EVIDENCE_KIND,
    ref: evidenceUrn(summary),
    version: CONVERSATION_HISTORY_EVIDENCE_VERSION,
    digest: summaryDigest(summary),
    sensitivity: 'restricted',
  };
}

function parseEvidenceRef(ref: EvidenceRef): {
  baselineId: string;
  importId: string;
  sourceConversationId: string;
} | null {
  if (ref.provider !== CONVERSATION_HISTORY_PROVIDER
      || ref.kind !== CONVERSATION_HISTORY_EVIDENCE_KIND
      || ref.version !== CONVERSATION_HISTORY_EVIDENCE_VERSION
      || !ref.digest
      || !SHA256_PATTERN.test(ref.digest)) {
    return null;
  }
  const match = /^urn:comind:chist:([0-9a-f-]{36}):([0-9a-f-]{36}):([A-Za-z0-9_-]+)$/i.exec(ref.ref);
  if (!match || !UUID_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[2])) return null;
  try {
    return {
      baselineId: match[1],
      importId: match[2],
      sourceConversationId: decodedConversationId(match[3]),
    };
  } catch {
    return null;
  }
}

/**
 * Build the smallest Conversation History reader needed by ThreadKeeper.
 * The supplied query MUST already execute as the governed
 * comind_conversation_history_reader role. The function verifies that role on
 * every read and selects only certified summary fields; raw conversation and
 * message text are deliberately not selected.
 */
export function createCertifiedConversationHistoryReader(query: QueryFunction): ConversationHistorySummaryReader {
  return {
    async read(input) {
      if (!UUID_PATTERN.test(input.importId)) throw new Error('Invalid Conversation History import id');
      boundedString(input.sourceConversationId, 'Conversation History source conversation id', 2048);

      const identity = await query<{ current_user: string }>('SELECT current_user::text AS current_user');
      if (identity.rows[0]?.current_user !== CONVERSATION_HISTORY_READER_ROLE) {
        throw new Error(`Conversation History integration requires ${CONVERSATION_HISTORY_READER_ROLE}`);
      }

      const result = await query<{
        baseline_id: string;
        certification_sha256: string;
        import_id: string;
        source_conversation_id: string;
        created_at: string | null;
        updated_at: string | null;
        raw_source_hash: string;
        normalized_hash: string;
        topology_hash: string;
        node_count: string;
        message_count: string;
        attachment_reference_count: string;
      }>(
        `SELECT b.baseline_id::text,
                b.certification_sha256::text,
                o.import_id::text,
                o.source_conversation_id,
                o.created_at::text,
                o.updated_at::text,
                o.raw_source_hash::text,
                o.normalized_hash::text,
                o.topology_hash::text,
                o.node_count::text,
                o.message_count::text,
                o.attachment_reference_count::text
           FROM comind.cm_conversation_history_baseline b
           JOIN comind.cm_archive_import i ON i.import_id=b.import_id AND i.status='PASS'
           JOIN comind.cm_archive_conversation_observation o ON o.import_id=b.import_id
          WHERE b.import_id=$1::uuid
            AND o.source_conversation_id=$2`,
        [input.importId, input.sourceConversationId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return normalizedSummary({
        baselineId: row.baseline_id,
        certificationSha256: row.certification_sha256,
        importId: row.import_id,
        sourceConversationId: row.source_conversation_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rawSourceHash: row.raw_source_hash,
        normalizedHash: row.normalized_hash,
        topologyHash: row.topology_hash,
        nodeCount: Number(row.node_count),
        messageCount: Number(row.message_count),
        attachmentReferenceCount: Number(row.attachment_reference_count),
      });
    },
  };
}

export class ConversationHistoryEvidenceResolver implements EvidenceResolver {
  readonly #reader: ConversationHistorySummaryReader;

  constructor(reader: ConversationHistorySummaryReader) {
    this.#reader = reader;
  }

  async resolve(ref: EvidenceRef): Promise<EvidenceResolution> {
    const parsed = parseEvidenceRef(ref);
    if (!parsed) return { status: 'unverifiable', ref: structuredClone(ref) };

    let summary: CertifiedConversationHistorySummary | null;
    try {
      summary = await this.#reader.read({
        importId: parsed.importId,
        sourceConversationId: parsed.sourceConversationId,
      });
    } catch {
      return { status: 'unverifiable', ref: structuredClone(ref) };
    }
    if (!summary) return { status: 'missing', ref: structuredClone(ref) };

    const canonical = buildConversationHistoryEvidenceRef(summary);
    if (summary.baselineId !== parsed.baselineId
        || canonical.ref !== ref.ref
        || canonical.digest !== ref.digest) {
      return { status: 'conflicting', ref: structuredClone(ref) };
    }
    return { status: 'available', ref: structuredClone(ref) };
  }
}

export interface BuildConversationHistoryObservationInput {
  summary: CertifiedConversationHistorySummary;
  scopeId?: string;
  observedAt: string;
  priorCheckpointRef?: string;
  correlationId?: string;
  traceId?: string;
}

export function buildConversationHistoryObservation(
  input: BuildConversationHistoryObservationInput,
): ContinuityObservation {
  const summary = normalizedSummary(input.summary);
  const evidenceRef = buildConversationHistoryEvidenceRef(summary);
  const observedAt = normalizeTimestamp(input.observedAt, 'ThreadKeeper C3 observation timestamp');
  const scopeBinding: ScopeBinding = {
    ...(input.scopeId ? { scopeId: input.scopeId } : {}),
    scopeType: 'conversation',
    namespace: CONVERSATION_HISTORY_SCOPE_NAMESPACE,
    subjectRef: `chatgpt:${summary.sourceConversationId}`,
  };
  const observationId = `tk-c3-chist:${fingerprintCanonicalValue({
    baselineId: summary.baselineId,
    importId: summary.importId,
    sourceConversationId: summary.sourceConversationId,
    evidenceDigest: evidenceRef.digest,
  })}`;

  return {
    observationId,
    eventType: 'conversation_history.certified_summary',
    sourceSystem: 'conversation_history',
    observedAt,
    scopeBinding,
    ...(input.priorCheckpointRef ? { priorCheckpointRef: input.priorCheckpointRef } : {}),
    currentStateRefs: [
      `urn:comind:chist:raw:${summary.rawSourceHash}`,
      `urn:comind:chist:normalized:${summary.normalizedHash}`,
      `urn:comind:chist:topology:${summary.topologyHash}`,
    ],
    evidenceRefs: [evidenceRef],
    actorRef: 'system:conversation-history-reader',
    policyRef: THREADKEEPER_C3_INTEGRATION_VERSION,
    correlationId: input.correlationId ?? `chist-baseline:${summary.baselineId}`,
    causationRef: evidenceRef.ref,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    sensitivity: 'restricted',
    retentionClass: 'durable',
  };
}

export type ConversationIntegrationAssessmentResult =
  | {
      status: 'source_unavailable' | 'source_unverifiable';
      reasonCode: string;
    }
  | {
      status: 'assessed';
      summary: CertifiedConversationHistorySummary;
      evidenceRef: EvidenceRef;
      observation: ContinuityObservation;
      receipt: ObservationReceipt;
      assessment: ContinuityAssessment;
      storedAssessment: StoredThreadKeeperAssessment;
      contextBefore: ThreadKeeperContext;
      materialChange: boolean;
    };

export interface AssessCertifiedConversationInput {
  importId: string;
  sourceConversationId: string;
  observedAt: string;
  authority?: AuthorityValidationResult;
  correlationId?: string;
  traceId?: string;
}

export interface AcceptCertifiedConversationCheckpointInput {
  assessed: Extract<ConversationIntegrationAssessmentResult, { status: 'assessed' }>;
  authority: AuthorityValidationResult;
  proposalId: string;
  proposedAt: string;
  proposedByRef: string;
  acceptedAt: string;
  policyRef?: string;
}

export class ThreadKeeperConversationHistoryIntegration {
  readonly #query: QueryFunction;
  readonly #historyReader: ConversationHistorySummaryReader;
  readonly #service: ThreadKeeperService;
  readonly #observability: ThreadKeeperC3Observability;
  readonly #nowMs: () => number;

  constructor(input: {
    query: QueryFunction;
    historyReader: ConversationHistorySummaryReader;
    service: ThreadKeeperService;
    observability?: ThreadKeeperC3Observability;
    nowMs?: () => number;
  }) {
    this.#query = input.query;
    this.#historyReader = input.historyReader;
    this.#service = input.service;
    this.#observability = input.observability ?? new NoopThreadKeeperC3Observability();
    this.#nowMs = input.nowMs ?? (() => performance.now());
  }

  async assessCertifiedConversation(
    input: AssessCertifiedConversationInput,
  ): Promise<ConversationIntegrationAssessmentResult> {
    const started = this.#nowMs();
    try {
      let summary: CertifiedConversationHistorySummary | null;
      try {
        summary = await this.#historyReader.read({
          importId: input.importId,
          sourceConversationId: input.sourceConversationId,
        });
      } catch {
        this.#observability.historyEvidence('unverifiable');
        return { status: 'source_unverifiable', reasonCode: 'conversation_history_reader_failure' };
      }
      if (!summary) {
        this.#observability.historyEvidence('missing');
        return { status: 'source_unavailable', reasonCode: 'certified_conversation_history_unavailable' };
      }
      this.#observability.historyEvidence('available');

      const binding: ScopeBinding = {
        scopeType: 'conversation',
        namespace: CONVERSATION_HISTORY_SCOPE_NAMESPACE,
        subjectRef: `chatgpt:${summary.sourceConversationId}`,
      };
      const scope = await registerContinuityScope(
        this.#query,
        binding,
        'system:tk006:conversation-history-integration',
        'restricted',
        'durable',
      );
      const context = await getContinuityContext(this.#query, scope.semantic_key);
      if (!context) throw new Error('ThreadKeeper C3 scope disappeared after registration');
      const current = context.acceptedCheckpoint;
      const evidenceRef = buildConversationHistoryEvidenceRef(summary);
      const observation = buildConversationHistoryObservation({
        summary,
        scopeId: scope.scope_id,
        observedAt: input.observedAt,
        ...(current ? { priorCheckpointRef: current.checkpoint_id } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.traceId ? { traceId: input.traceId } : {}),
      });
      const receipt = await this.#service.observe(observation, [scope.scope_id]);

      const priorSource = current?.proposal.state.sourceRefs.find(ref => (
        ref.provider === CONVERSATION_HISTORY_PROVIDER
        && ref.kind === CONVERSATION_HISTORY_EVIDENCE_KIND
      ));
      const materialChange = current !== null
        && (priorSource?.digest !== evidenceRef.digest || priorSource?.ref !== evidenceRef.ref);
      const lineage = await getCheckpointLineage(this.#query, scope.semantic_key);
      let predecessorStatus: 'valid' | 'broken' = 'valid';
      for (let index = 1; index < lineage.length; index += 1) {
        if (lineage[index].parent_checkpoint_id !== lineage[index - 1].checkpoint_id) {
          predecessorStatus = 'broken';
          break;
        }
      }
      if (current && lineage.at(-1)?.checkpoint_id !== current.checkpoint_id) predecessorStatus = 'broken';

      const checkpointIntegrityValid = current === null
        || (verifyCheckpointProposal(current.proposal) && current.proposal.digest === current.digest);
      const checkpointAuthorityValid = current === null
        || (current.accepted_by_ref !== 'threadkeeper'
          && current.accepted_by_ref.trim().length > 0
          && current.authority_evidence_ref.trim().length > 0);
      const authorizedChange = materialChange
        && input.authority?.valid === true
        && input.authority.source === 'external';
      const assessment = await this.#service.assess({
        observation,
        receipt,
        checkpointId: current?.checkpoint_id ?? null,
        acceptedBaselinePresent: current !== null,
        checkpointIntegrityValid,
        checkpointAuthorityValid,
        predecessorStatus,
        authoritativeConflict: false,
        authorizedChange,
        materialChange,
        incompatibilityProven: false,
      });
      const storedAssessment = await persistAssessment(this.#query, {
        idempotencyKey: `tk006:${observation.observationId}:${current?.checkpoint_id ?? 'no-checkpoint'}`,
        assessment,
        createdAt: input.observedAt,
      });

      return {
        status: 'assessed',
        summary,
        evidenceRef,
        observation,
        receipt,
        assessment,
        storedAssessment,
        contextBefore: context,
        materialChange,
      };
    } finally {
      this.#observability.latency('integration_assessment', this.#nowMs() - started);
    }
  }

  async acceptCertifiedConversationCheckpoint(
    input: AcceptCertifiedConversationCheckpointInput,
  ): Promise<{
    checkpointId: string;
    proposal: CheckpointProposal;
    acceptedAt: string;
  }> {
    if (!input.authority.valid || input.authority.source !== 'external') {
      throw new Error('ThreadKeeper C3 checkpoint acceptance requires valid external authority');
    }
    const context = await getContinuityContext(
      this.#query,
      input.assessed.assessment.scopeSemanticKey,
    );
    if (!context) throw new Error('ThreadKeeper C3 scope unavailable for checkpoint acceptance');
    const currentCheckpointId = context.acceptedCheckpoint?.checkpoint_id ?? null;
    if (currentCheckpointId !== input.assessed.assessment.checkpointId) {
      throw new Error('ThreadKeeper C3 assessed checkpoint is stale');
    }

    const proposal = this.#service.proposeCheckpoint({
      proposalId: input.proposalId,
      scopeSemanticKey: input.assessed.assessment.scopeSemanticKey,
      parentCheckpointId: currentCheckpointId,
      currentAcceptedCheckpointId: currentCheckpointId,
      proposedAt: input.proposedAt,
      proposedByRef: input.proposedByRef,
      ...(input.policyRef ? { policyRef: input.policyRef } : {}),
      state: {
        objectiveRefs: [],
        decisionRefs: [],
        commitmentRefs: [],
        obligationRefs: [],
        contextRefs: [input.assessed.evidenceRef.ref],
        evidenceRefs: [structuredClone(input.assessed.evidenceRef)],
        sourceRefs: [structuredClone(input.assessed.evidenceRef)],
        sensitivity: 'restricted',
        retentionClass: 'durable',
      },
    });
    const preview = this.#service.acceptCheckpoint(
      proposal,
      currentCheckpointId,
      input.authority,
      input.acceptedAt,
    );
    if (!preview.accepted) {
      throw new Error(`ThreadKeeper C3 checkpoint acceptance rejected: ${preview.reasonCode}`);
    }
    return persistAcceptedCheckpoint(proposal, input.authority, input.acceptedAt);
  }

  async resolveHandoff(input: {
    scopeSemanticKey: string;
    consumerRef: string;
    providerRef?: string;
    actorRef?: string;
    expectedCheckpointId?: string;
    resolvedAt: string;
  }): Promise<ContinuityHandoffEnvelope> {
    const started = this.#nowMs();
    try {
      const handoff = await resolveContinuityHandoff(this.#query, input);
      this.#observability.handoff('resolved');
      return handoff;
    } catch (error) {
      if (error instanceof ContinuityHandoffError) {
        this.#observability.handoff(error.code);
      } else {
        this.#observability.handoff('error');
      }
      throw error;
    } finally {
      this.#observability.latency('handoff_resolution', this.#nowMs() - started);
    }
  }
}
