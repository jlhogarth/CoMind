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
export const CONVERSATION_HISTORY_EVIDENCE_KIND = 'accepted-conversation-snapshot';
export const CONVERSATION_HISTORY_EVIDENCE_VERSION = 'chist-accepted-snapshot-v1';
export const CONVERSATION_HISTORY_READER_ROLE = 'comind_conversation_history_reader';
export const CONVERSATION_HISTORY_SCOPE_NAMESPACE = 'comind.conversation-history';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SNAPSHOT_CLASSIFICATIONS = new Set([
  'baseline', 'unchanged', 'new', 'content_changed', 'structurally_changed',
  'raw_changed', 'attachment_changed', 'absent',
]);

export interface CertifiedConversationHistorySummary {
  baselineId: string;
  certificationSha256: string;
  archiveCheckpointId: string;
  archiveStreamId: string;
  sequenceNo: number;
  checkpointKind: 'baseline' | 'differential';
  importId: string;
  acceptedAt: string;
  sourceConversationId: string;
  classification: string;
  present: boolean;
  observationImportId: string | null;
  rawSourceHash: string | null;
  normalizedHash: string | null;
  topologyHash: string | null;
  attachmentSetHash: string | null;
}

export interface ConversationHistorySummaryReader {
  read(input: {
    importId: string;
    sourceConversationId: string;
  }): Promise<CertifiedConversationHistorySummary | null>;
  readByCheckpoint(input: {
    archiveCheckpointId: string;
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

function optionalSha(value: string | null, field: string): string | null {
  if (value === null) return null;
  if (!SHA256_PATTERN.test(value)) throw new Error(`Invalid ${field}`);
  return value.toLowerCase();
}

function normalizedSummary(summary: CertifiedConversationHistorySummary): CertifiedConversationHistorySummary {
  for (const [field, value] of [
    ['Conversation History baseline id', summary.baselineId],
    ['Conversation History archive checkpoint id', summary.archiveCheckpointId],
    ['Conversation History archive stream id', summary.archiveStreamId],
    ['Conversation History import id', summary.importId],
  ] as const) {
    if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${field}`);
  }
  if (summary.observationImportId !== null && !UUID_PATTERN.test(summary.observationImportId)) {
    throw new Error('Invalid Conversation History observation import id');
  }
  if (!SHA256_PATTERN.test(summary.certificationSha256)) throw new Error('Invalid Conversation History certification digest');
  boundedString(summary.sourceConversationId, 'Conversation History source conversation id', 2048);
  if (!Number.isSafeInteger(summary.sequenceNo) || summary.sequenceNo < 1) {
    throw new Error('Invalid Conversation History checkpoint sequence');
  }
  if (!['baseline', 'differential'].includes(summary.checkpointKind)) {
    throw new Error('Invalid Conversation History checkpoint kind');
  }
  if ((summary.sequenceNo === 1) !== (summary.checkpointKind === 'baseline')) {
    throw new Error('Conversation History checkpoint sequence and kind disagree');
  }
  if (!SNAPSHOT_CLASSIFICATIONS.has(summary.classification)) {
    throw new Error('Invalid Conversation History snapshot classification');
  }

  const acceptedAt = normalizeTimestamp(summary.acceptedAt, 'Conversation History checkpoint acceptance timestamp');
  const rawSourceHash = optionalSha(summary.rawSourceHash, 'Conversation History raw source hash');
  const normalizedHash = optionalSha(summary.normalizedHash, 'Conversation History normalized hash');
  const topologyHash = optionalSha(summary.topologyHash, 'Conversation History topology hash');
  const attachmentSetHash = optionalSha(summary.attachmentSetHash, 'Conversation History attachment set hash');
  if (summary.present) {
    if (!summary.observationImportId || !rawSourceHash || !normalizedHash || !topologyHash) {
      throw new Error('Present Conversation History snapshot requires observation identity and content hashes');
    }
  } else if (summary.observationImportId || rawSourceHash || normalizedHash || topologyHash || attachmentSetHash) {
    throw new Error('Absent Conversation History snapshot must not claim current observation content');
  }

  return {
    baselineId: summary.baselineId,
    certificationSha256: summary.certificationSha256.toLowerCase(),
    archiveCheckpointId: summary.archiveCheckpointId,
    archiveStreamId: summary.archiveStreamId,
    sequenceNo: summary.sequenceNo,
    checkpointKind: summary.checkpointKind,
    importId: summary.importId,
    acceptedAt,
    sourceConversationId: summary.sourceConversationId,
    classification: summary.classification,
    present: summary.present,
    observationImportId: summary.observationImportId,
    rawSourceHash,
    normalizedHash,
    topologyHash,
    attachmentSetHash,
  };
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
  return `urn:comind:chist:${summary.baselineId}:checkpoint:${summary.archiveCheckpointId}:${encodedConversationId(summary.sourceConversationId)}`;
}

function summaryDigest(summary: CertifiedConversationHistorySummary): string {
  return fingerprintCanonicalValue(summary);
}

function stateRefs(summary: CertifiedConversationHistorySummary): string[] {
  if (!summary.present) return ['urn:comind:chist:presence:absent'];
  const refs = [
    'urn:comind:chist:presence:present',
    `urn:comind:chist:raw:${summary.rawSourceHash}`,
    `urn:comind:chist:normalized:${summary.normalizedHash}`,
    `urn:comind:chist:topology:${summary.topologyHash}`,
  ];
  if (summary.attachmentSetHash) refs.push(`urn:comind:chist:attachments:${summary.attachmentSetHash}`);
  return refs;
}

function sameStateRefs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function buildConversationHistoryEvidenceRef(summaryInput: CertifiedConversationHistorySummary): EvidenceRef {
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
  archiveCheckpointId: string;
  sourceConversationId: string;
} | null {
  if (ref.provider !== CONVERSATION_HISTORY_PROVIDER
      || ref.kind !== CONVERSATION_HISTORY_EVIDENCE_KIND
      || ref.version !== CONVERSATION_HISTORY_EVIDENCE_VERSION
      || !ref.digest
      || !SHA256_PATTERN.test(ref.digest)) {
    return null;
  }
  const match = /^urn:comind:chist:([0-9a-f-]{36}):checkpoint:([0-9a-f-]{36}):([A-Za-z0-9_-]+)$/i.exec(ref.ref);
  if (!match || !UUID_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[2])) return null;
  try {
    return {
      baselineId: match[1],
      archiveCheckpointId: match[2],
      sourceConversationId: decodedConversationId(match[3]),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve accepted Conversation History snapshot membership using the governed
 * reader role. The query MUST already execute as comind_conversation_history_reader.
 * Raw conversation JSON, titles, messages, and attachment contents are outside
 * this contract by construction.
 */
export function createCertifiedConversationHistoryReader(query: QueryFunction): ConversationHistorySummaryReader {
  const assertReaderRole = async (): Promise<void> => {
    const identity = await query<{ current_user: string }>('SELECT current_user::text AS current_user');
    if (identity.rows[0]?.current_user !== CONVERSATION_HISTORY_READER_ROLE) {
      throw new Error(`Conversation History integration requires ${CONVERSATION_HISTORY_READER_ROLE}`);
    }
  };

  const read = async (input: {
    importId: string;
    sourceConversationId: string;
  }): Promise<CertifiedConversationHistorySummary | null> => {
    if (!UUID_PATTERN.test(input.importId)) throw new Error('Invalid Conversation History import id');
    boundedString(input.sourceConversationId, 'Conversation History source conversation id', 2048);
    await assertReaderRole();
    const result = await query<{
      baseline_id: string;
      certification_sha256: string;
      checkpoint_id: string;
      archive_stream_id: string;
      sequence_no: string;
      checkpoint_kind: 'baseline' | 'differential';
      import_id: string;
      accepted_at: string;
      source_conversation_id: string;
      classification: string;
      present: boolean;
      observation_import_id: string | null;
      raw_source_hash: string | null;
      normalized_hash: string | null;
      topology_hash: string | null;
      attachment_set_hash: string | null;
    }>(
      `SELECT b.baseline_id::text,
              b.certification_sha256::text,
              c.checkpoint_id::text,
              c.archive_stream_id::text,
              c.sequence_no::text,
              c.checkpoint_kind,
              c.import_id::text,
              c.accepted_at::text,
              s.source_conversation_id,
              s.classification,
              s.present,
              s.observation_import_id::text,
              s.raw_source_hash::text,
              s.normalized_hash::text,
              s.topology_hash::text,
              s.attachment_set_hash::text
         FROM comind.cm_archive_checkpoint c
         JOIN comind.cm_conversation_history_baseline b ON b.baseline_id=c.baseline_id
         JOIN comind.cm_archive_snapshot_conversation s ON s.import_id=c.import_id
        WHERE c.import_id=$1::uuid
          AND s.source_conversation_id=$2`,
      [input.importId, input.sourceConversationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return normalizedSummary({
      baselineId: row.baseline_id,
      certificationSha256: row.certification_sha256,
      archiveCheckpointId: row.checkpoint_id,
      archiveStreamId: row.archive_stream_id,
      sequenceNo: Number(row.sequence_no),
      checkpointKind: row.checkpoint_kind,
      importId: row.import_id,
      acceptedAt: row.accepted_at,
      sourceConversationId: row.source_conversation_id,
      classification: row.classification,
      present: row.present,
      observationImportId: row.observation_import_id,
      rawSourceHash: row.raw_source_hash,
      normalizedHash: row.normalized_hash,
      topologyHash: row.topology_hash,
      attachmentSetHash: row.attachment_set_hash,
    });
  };

  const readByCheckpoint = async (input: {
    archiveCheckpointId: string;
    sourceConversationId: string;
  }): Promise<CertifiedConversationHistorySummary | null> => {
    if (!UUID_PATTERN.test(input.archiveCheckpointId)) throw new Error('Invalid Conversation History archive checkpoint id');
    boundedString(input.sourceConversationId, 'Conversation History source conversation id', 2048);
    await assertReaderRole();
    const result = await query<{ import_id: string }>(
      `SELECT import_id::text
         FROM comind.cm_archive_checkpoint
        WHERE checkpoint_id=$1::uuid`,
      [input.archiveCheckpointId],
    );
    const importId = result.rows[0]?.import_id;
    if (!importId) return null;
    return read({ importId, sourceConversationId: input.sourceConversationId });
  };

  return { read, readByCheckpoint };
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
      summary = await this.#reader.readByCheckpoint({
        archiveCheckpointId: parsed.archiveCheckpointId,
        sourceConversationId: parsed.sourceConversationId,
      });
    } catch {
      return { status: 'unverifiable', ref: structuredClone(ref) };
    }
    if (!summary) return { status: 'missing', ref: structuredClone(ref) };

    const canonical = buildConversationHistoryEvidenceRef(summary);
    if (summary.baselineId !== parsed.baselineId
        || summary.archiveCheckpointId !== parsed.archiveCheckpointId
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
  priorCheckpointRef?: string;
}

export function buildConversationHistoryObservation(input: BuildConversationHistoryObservationInput): ContinuityObservation {
  const summary = normalizedSummary(input.summary);
  const evidenceRef = buildConversationHistoryEvidenceRef(summary);
  const scopeBinding: ScopeBinding = {
    ...(input.scopeId ? { scopeId: input.scopeId } : {}),
    scopeType: 'conversation',
    namespace: CONVERSATION_HISTORY_SCOPE_NAMESPACE,
    subjectRef: `chatgpt:${summary.sourceConversationId}`,
  };
  const observationId = `tk-c3-chist:${fingerprintCanonicalValue({
    archiveCheckpointId: summary.archiveCheckpointId,
    sourceConversationId: summary.sourceConversationId,
    priorCheckpointRef: input.priorCheckpointRef ?? null,
  })}`;

  return {
    observationId,
    eventType: 'conversation_history.accepted_snapshot',
    sourceSystem: 'conversation_history',
    observedAt: summary.acceptedAt,
    scopeBinding,
    ...(input.priorCheckpointRef ? { priorCheckpointRef: input.priorCheckpointRef } : {}),
    currentStateRefs: stateRefs(summary),
    findingType: summary.classification,
    evidenceRefs: [evidenceRef],
    actorRef: 'system:conversation-history-reader',
    policyRef: THREADKEEPER_C3_INTEGRATION_VERSION,
    correlationId: `tk-c3:${summary.archiveCheckpointId}:${fingerprintCanonicalValue(summary.sourceConversationId)}`,
    causationRef: evidenceRef.ref,
    sensitivity: 'restricted',
    retentionClass: 'durable',
  };
}

export type ConversationIntegrationAssessmentResult =
  | { status: 'source_unavailable' | 'source_unverifiable'; reasonCode: string }
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
  assessedAt: string;
  authority?: AuthorityValidationResult;
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

  async assessCertifiedConversation(input: AssessCertifiedConversationInput): Promise<ConversationIntegrationAssessmentResult> {
    const started = this.#nowMs();
    try {
      normalizeTimestamp(input.assessedAt, 'ThreadKeeper C3 assessment timestamp');
      let summary: CertifiedConversationHistorySummary | null;
      const sourceStarted = this.#nowMs();
      try {
        summary = await this.#historyReader.read({
          importId: input.importId,
          sourceConversationId: input.sourceConversationId,
        });
      } catch {
        this.#observability.historyEvidence('unverifiable');
        return { status: 'source_unverifiable', reasonCode: 'conversation_history_reader_failure' };
      } finally {
        this.#observability.latency('history_summary_read', this.#nowMs() - sourceStarted);
      }
      if (!summary) {
        this.#observability.historyEvidence('missing');
        return { status: 'source_unavailable', reasonCode: 'accepted_conversation_history_snapshot_unavailable' };
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
        ...(current ? { priorCheckpointRef: current.checkpoint_id } : {}),
      });
      const receipt = await this.#service.observe(observation, [scope.scope_id]);
      const materialChange = current !== null
        && !sameStateRefs(current.proposal.state.contextRefs, observation.currentStateRefs);

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
      const authorityIdentity = input.authority?.valid
        ? fingerprintCanonicalValue(input.authority)
        : 'no-authority';
      const storedAssessment = await persistAssessment(this.#query, {
        idempotencyKey: `tk006:${observation.observationId}:${current?.checkpoint_id ?? 'no-checkpoint'}:${authorityIdentity}`,
        assessment,
        createdAt: input.assessedAt,
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
  ): Promise<{ checkpointId: string; proposal: CheckpointProposal; acceptedAt: string }> {
    if (!input.authority.valid || input.authority.source !== 'external') {
      throw new Error('ThreadKeeper C3 checkpoint acceptance requires valid external authority');
    }
    const context = await getContinuityContext(this.#query, input.assessed.assessment.scopeSemanticKey);
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
        contextRefs: structuredClone(input.assessed.observation.currentStateRefs),
        evidenceRefs: [structuredClone(input.assessed.evidenceRef)],
        sourceRefs: [structuredClone(input.assessed.evidenceRef)],
        sensitivity: 'restricted',
        retentionClass: 'durable',
      },
    });
    const preview = this.#service.acceptCheckpoint(proposal, currentCheckpointId, input.authority, input.acceptedAt);
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
      if (error instanceof ContinuityHandoffError) this.#observability.handoff(error.code);
      else this.#observability.handoff('error');
      throw error;
    } finally {
      this.#observability.latency('handoff_resolution', this.#nowMs() - started);
    }
  }
}
