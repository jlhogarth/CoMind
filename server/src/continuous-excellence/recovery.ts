import type { QueryFunction } from '../db.js';
import type { ContinuityState } from '../continuity/checkpoint.js';
import {
  coordinateRecovery,
  type RecoveryDecision as AcpRecoveryDecision,
} from '../continuity/recovery.js';
import {
  ContinuityHandoffError,
  resolveContinuityHandoff,
  type ContinuityHandoffEnvelope,
  type ContinuityHandoffInput,
} from '../continuity/handoff.js';

export const CE_RECOVERY_ADAPTER_VERSION = 'ce-002-recovery-v1';

export type CeRecoveryState = 'complete' | 'ready' | 'partial' | 'blocked' | 'uncertain';
export type CeRecoveryConfidence = 'verified' | 'mixed' | 'uncertain';
export type ContinuationAuthority = 'authorized' | 'requires_approval' | 'unknown';
export type AuthoritativeObservationStatus = 'verified' | 'unavailable' | 'blocked' | 'conflict';

export interface AuthoritativeObservation {
  sourceSystem: string;
  sourceRef: string;
  subject: string;
  status: AuthoritativeObservationStatus;
  summary: string;
}

export interface CeRecoveryInterrupt {
  interruptKey: string;
  trigger: string;
  sourceSystem: string;
  sourceRef: string | null;
  observedAt: string;
}

export interface AcpRecoveryInput {
  conversationId: string;
  authority: ContinuityState['authority'];
  dependenciesAvailable?: boolean;
}

export interface ThreadKeeperRecoveryInput {
  scopeSemanticKey: string;
  expectedCheckpointId?: string;
  consumerRef?: string;
  providerRef?: string;
  actorRef?: string;
}

export interface RecoveryRequest {
  projectId: string;
  taskId: string;
  capsuleKey: string;
  projectKey: string;
  workKey: string;
  now: string;
  continuationAuthority: ContinuationAuthority;
  interrupt: CeRecoveryInterrupt;
  acp?: AcpRecoveryInput;
  threadKeeper?: ThreadKeeperRecoveryInput;
  authoritativeObservations?: AuthoritativeObservation[];
  nextSafeAction?: string | null;
  priorSimilarRecoveryCount?: number;
  actorId?: string | null;
}

interface CurrentCapsuleRow {
  capsule_id: string;
  project_id: string;
  task_id: string | null;
  capsule_key: string;
  version: number;
  predecessor_capsule_id: string | null;
  objective: string;
  completion_criteria: unknown[];
  verification_method: unknown[];
  acceptance_authority: Record<string, unknown>;
  accepted_baseline: Record<string, unknown>;
  authoritative_sources: unknown[];
  decisions: unknown[];
  constraints: unknown[];
  last_verified_action: string | null;
  active_work: unknown[];
  unresolved: unknown[];
  blockers: unknown[];
  pending_approvals: unknown[];
  next_safe_action: string | null;
  rollback_point: string | null;
  recovery_state: CeRecoveryState;
  confidence: CeRecoveryConfidence;
  source_system: string;
  source_ref: string | null;
  captured_by_actor_id: string | null;
  content_hash: string;
  captured_at: string | Date;
}

interface CanonicalTaskRow {
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
}

interface RunBookRow {
  status: 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'review' | 'done' | 'canceled' | 'deferred';
  current_summary: string | null;
  last_event_at: string | Date | null;
}

export interface RecoverySourceAssessment {
  sourceSystem: string;
  sourceRef: string | null;
  status: AuthoritativeObservationStatus;
  summary: string;
}

export interface RecoveryResolution {
  version: typeof CE_RECOVERY_ADAPTER_VERSION;
  state: CeRecoveryState;
  confidence: CeRecoveryConfidence;
  reasons: string[];
  resumeAllowed: boolean;
  improvementRecommended: boolean;
  nextSafeAction: string | null;
  currentCapsule: CurrentCapsuleRow | null;
  canonicalTaskStatus: CanonicalTaskRow['status'] | null;
  runBookStatus: RunBookRow['status'] | null;
  sources: RecoverySourceAssessment[];
  threadKeeper: ContinuityHandoffEnvelope | null;
  acp: AcpRecoveryDecision | null;
}

export interface RecoveryPersistenceResult {
  signalId: string;
  runBookEventId: string;
  capsuleId: string | null;
  capsuleCreated: boolean;
  replayed: boolean;
}

export interface RecoveryAdapters {
  resolveThreadKeeper: (
    query: QueryFunction,
    input: ContinuityHandoffInput,
  ) => Promise<ContinuityHandoffEnvelope>;
  coordinateAcp: (
    query: QueryFunction,
    conversationId: string,
    authority: ContinuityState['authority'],
    now: string,
    dependenciesAvailable: boolean,
  ) => Promise<AcpRecoveryDecision>;
}

const defaultAdapters: RecoveryAdapters = {
  resolveThreadKeeper: resolveContinuityHandoff,
  coordinateAcp: coordinateRecovery,
};

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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function appendUniqueJson(values: unknown[], additions: unknown[]): unknown[] {
  const result = structuredClone(values);
  const known = new Set(result.map(item => JSON.stringify(item)));
  for (const addition of additions) {
    const key = JSON.stringify(addition);
    if (!known.has(key)) {
      known.add(key);
      result.push(structuredClone(addition));
    }
  }
  return result;
}

function source(
  sourceSystem: string,
  sourceRef: string | null,
  status: AuthoritativeObservationStatus,
  summary: string,
): RecoverySourceAssessment {
  return { sourceSystem, sourceRef, status, summary };
}

function sourceObject(item: RecoverySourceAssessment): Record<string, unknown> {
  return {
    system: item.sourceSystem,
    ref: item.sourceRef,
    status: item.status,
    summary: item.summary,
  };
}

function terminalCanonicalAgreement(
  capsule: CurrentCapsuleRow,
  task: CanonicalTaskRow,
  runBook: RunBookRow,
): boolean {
  return capsule.recovery_state === 'complete' && task.status === 'done' && runBook.status === 'done';
}

function hasCanonicalConflict(task: CanonicalTaskRow, runBook: RunBookRow): boolean {
  const taskDone = task.status === 'done';
  const runBookDone = runBook.status === 'done';
  return taskDone !== runBookDone;
}

function mapRunBookOutcome(state: CeRecoveryState): string {
  if (state === 'complete') return 'complete';
  if (state === 'ready') return 'pass';
  if (state === 'blocked') return 'blocked';
  return 'partial';
}

function desiredConfidence(state: CeRecoveryState): CeRecoveryConfidence {
  if (state === 'uncertain') return 'uncertain';
  if (state === 'partial') return 'mixed';
  return 'verified';
}

function classifyThreadKeeperError(error: unknown): RecoverySourceAssessment {
  if (error instanceof ContinuityHandoffError) {
    if (error.code === 'stale_checkpoint' || error.code === 'lineage_inconsistent') {
      return source('threadkeeper', null, 'conflict', `${error.code}: ${error.message}`);
    }
    return source('threadkeeper', null, 'unavailable', `${error.code}: ${error.message}`);
  }
  return source('threadkeeper', null, 'unavailable', 'ThreadKeeper reconciliation query failed');
}

function validateRequest(request: RecoveryRequest): void {
  boundedString(request.projectId, 'CE recovery project id', 128);
  boundedString(request.taskId, 'CE recovery task id', 128);
  boundedString(request.capsuleKey, 'CE recovery capsule key', 256);
  boundedString(request.projectKey, 'CE recovery RunBook project key', 256);
  boundedString(request.workKey, 'CE recovery RunBook work key', 256);
  normalizeTimestamp(request.now, 'CE recovery resolution timestamp');
  boundedString(request.interrupt.interruptKey, 'CE recovery interrupt key', 512);
  boundedString(request.interrupt.trigger, 'CE recovery trigger', 512);
  boundedString(request.interrupt.sourceSystem, 'CE recovery interrupt source system', 256);
  normalizeTimestamp(request.interrupt.observedAt, 'CE recovery interrupt timestamp');
  if (request.interrupt.sourceRef !== null) boundedString(request.interrupt.sourceRef, 'CE recovery interrupt source reference', 4096);
  if (!['authorized', 'requires_approval', 'unknown'].includes(request.continuationAuthority)) {
    throw new Error('Invalid CE recovery continuation authority');
  }
  if (request.priorSimilarRecoveryCount !== undefined
      && (!Number.isSafeInteger(request.priorSimilarRecoveryCount) || request.priorSimilarRecoveryCount < 0)) {
    throw new Error('Invalid CE recovery prior similar recovery count');
  }
}

export async function resolveRecovery(
  query: QueryFunction,
  request: RecoveryRequest,
  adapters: RecoveryAdapters = defaultAdapters,
): Promise<RecoveryResolution> {
  validateRequest(request);
  const reasons: string[] = [];
  const sources: RecoverySourceAssessment[] = [];
  let capsule: CurrentCapsuleRow | null = null;
  let task: CanonicalTaskRow | null = null;
  let runBook: RunBookRow | null = null;
  let threadKeeper: ContinuityHandoffEnvelope | null = null;
  let acp: AcpRecoveryDecision | null = null;

  try {
    const result = await query<CurrentCapsuleRow>(
      `SELECT *
         FROM comind.v_ce_current_continuity_capsule
        WHERE project_id=$1::uuid
          AND task_id=$2::uuid
          AND capsule_key=$3
        LIMIT 1`,
      [request.projectId, request.taskId, request.capsuleKey],
    );
    capsule = result.rows[0] ?? null;
    if (capsule) {
      sources.push(source('continuous_excellence', capsule.source_ref, 'verified', `Continuity Capsule v${capsule.version} loaded`));
    } else {
      sources.push(source('continuous_excellence', null, 'conflict', 'Current Continuity Capsule is unavailable'));
      reasons.push('continuity_capsule_missing');
    }
  } catch {
    sources.push(source('continuous_excellence', null, 'unavailable', 'Continuity Capsule query failed'));
    reasons.push('continuity_capsule_query_failed');
  }

  try {
    const result = await query<CanonicalTaskRow>(
      `SELECT status
         FROM comind.cm_task
        WHERE task_id=$1::uuid AND project_id=$2::uuid`,
      [request.taskId, request.projectId],
    );
    task = result.rows[0] ?? null;
    if (task) {
      sources.push(source('comind_task', `comind-task://${request.taskId}`, 'verified', `Canonical task state is ${task.status}`));
    } else {
      sources.push(source('comind_task', `comind-task://${request.taskId}`, 'conflict', 'Canonical task is unavailable for the requested project'));
      reasons.push('canonical_task_missing');
    }
  } catch {
    sources.push(source('comind_task', `comind-task://${request.taskId}`, 'unavailable', 'Canonical task query failed'));
    reasons.push('canonical_task_query_failed');
  }

  try {
    const result = await query<RunBookRow>(
      `SELECT wi.status, wi.current_summary, wi.last_event_at
         FROM comind_pm.pm_work_items wi
         JOIN comind_pm.pm_projects p ON p.id=wi.project_id
        WHERE p.project_key=$1 AND wi.work_key=$2`,
      [request.projectKey, request.workKey],
    );
    runBook = result.rows[0] ?? null;
    if (runBook) {
      sources.push(source('runbook', `runbook://${request.projectKey}/${request.workKey}`, 'verified', `RunBook state is ${runBook.status}`));
    } else {
      sources.push(source('runbook', `runbook://${request.projectKey}/${request.workKey}`, 'conflict', 'RunBook work item is unavailable'));
      reasons.push('runbook_work_item_missing');
    }
  } catch {
    sources.push(source('runbook', `runbook://${request.projectKey}/${request.workKey}`, 'unavailable', 'RunBook query failed'));
    reasons.push('runbook_query_failed');
  }

  if (request.threadKeeper) {
    const input: ContinuityHandoffInput = {
      scopeSemanticKey: request.threadKeeper.scopeSemanticKey,
      expectedCheckpointId: request.threadKeeper.expectedCheckpointId,
      consumerRef: request.threadKeeper.consumerRef ?? 'ce-002-recovery-adapter',
      providerRef: request.threadKeeper.providerRef,
      actorRef: request.threadKeeper.actorRef,
      resolvedAt: request.now,
    };
    try {
      threadKeeper = await adapters.resolveThreadKeeper(query, input);
      const blockingCase = threadKeeper.unresolvedCases.find(item => item.state === 'BLOCKED');
      if (blockingCase) {
        sources.push(source('threadkeeper', `threadkeeper://${request.threadKeeper.scopeSemanticKey}`, 'blocked', `ThreadKeeper case ${blockingCase.caseKey} is blocked`));
        reasons.push('threadkeeper_blocked_case');
      } else if (threadKeeper.unresolvedCases.length > 0) {
        sources.push(source('threadkeeper', `threadkeeper://${request.threadKeeper.scopeSemanticKey}`, 'unavailable', `${threadKeeper.unresolvedCases.length} unresolved ThreadKeeper case(s) remain`));
        reasons.push('threadkeeper_unresolved_cases');
      } else {
        sources.push(source('threadkeeper', `threadkeeper://${request.threadKeeper.scopeSemanticKey}`, 'verified', `Accepted checkpoint ${threadKeeper.currentCheckpoint.checkpointId} reconciled`));
      }
    } catch (error) {
      const assessment = classifyThreadKeeperError(error);
      assessment.sourceRef = `threadkeeper://${request.threadKeeper.scopeSemanticKey}`;
      sources.push(assessment);
      reasons.push(assessment.status === 'conflict' ? 'threadkeeper_state_conflict' : 'threadkeeper_unavailable');
    }
  }

  if (request.acp) {
    try {
      acp = await adapters.coordinateAcp(
        query,
        request.acp.conversationId,
        request.acp.authority,
        request.now,
        request.acp.dependenciesAvailable ?? true,
      );
      if (acp.status === 'READY') {
        sources.push(source('acp', `acp://${request.acp.conversationId}`, 'verified', 'ACP checkpoint and pending operations reconciled'));
      } else if (acp.status === 'ABSENT') {
        sources.push(source('acp', `acp://${request.acp.conversationId}`, 'unavailable', 'ACP checkpoint is absent'));
        reasons.push('acp_checkpoint_absent');
      } else if (acp.status === 'BLOCKED') {
        sources.push(source('acp', `acp://${request.acp.conversationId}`, 'conflict', acp.reasons.join(', ')));
        reasons.push('acp_recovery_blocked');
      } else {
        sources.push(source('acp', `acp://${request.acp.conversationId}`, 'unavailable', acp.reasons.join(', ')));
        reasons.push('acp_recovery_degraded');
      }
    } catch {
      sources.push(source('acp', `acp://${request.acp.conversationId}`, 'unavailable', 'ACP recovery query failed'));
      reasons.push('acp_query_failed');
    }
  }

  for (const observation of request.authoritativeObservations ?? []) {
    boundedString(observation.sourceSystem, 'authoritative observation source system', 256);
    boundedString(observation.sourceRef, 'authoritative observation source reference', 4096);
    boundedString(observation.subject, 'authoritative observation subject', 512);
    boundedString(observation.summary, 'authoritative observation summary', 4096);
    if (!['verified', 'unavailable', 'blocked', 'conflict'].includes(observation.status)) {
      throw new Error('Invalid authoritative observation status');
    }
    sources.push(source(observation.sourceSystem, observation.sourceRef, observation.status, `${observation.subject}: ${observation.summary}`));
    if (observation.status !== 'verified') reasons.push(`external_${observation.status}:${observation.sourceSystem}:${observation.subject}`);
  }

  if (task?.status === 'blocked' || runBook?.status === 'blocked' || runBook?.status === 'canceled' || runBook?.status === 'deferred') {
    reasons.push('canonical_work_blocked');
  }
  if (task && runBook && hasCanonicalConflict(task, runBook)) reasons.push('canonical_work_state_conflict');
  if (capsule && capsule.blockers.length > 0) reasons.push('continuity_capsule_has_blockers');
  if (capsule && capsule.pending_approvals.length > 0) reasons.push('continuity_capsule_has_pending_approvals');
  if (request.continuationAuthority === 'requires_approval') reasons.push('continuation_requires_approval');
  if (request.continuationAuthority === 'unknown') reasons.push('continuation_authority_unknown');

  const uniqueReasons = unique(reasons);
  const hasConflict = sources.some(item => item.status === 'conflict')
    || uniqueReasons.includes('canonical_work_state_conflict')
    || uniqueReasons.includes('continuation_authority_unknown');
  const hasBlock = sources.some(item => item.status === 'blocked')
    || uniqueReasons.includes('canonical_work_blocked')
    || uniqueReasons.includes('continuity_capsule_has_blockers')
    || uniqueReasons.includes('continuity_capsule_has_pending_approvals')
    || uniqueReasons.includes('continuation_requires_approval');
  const hasUnavailable = sources.some(item => item.status === 'unavailable');

  let state: CeRecoveryState;
  if (hasConflict) state = 'uncertain';
  else if (hasBlock) state = 'blocked';
  else if (hasUnavailable) state = 'partial';
  else if (capsule && task && runBook && terminalCanonicalAgreement(capsule, task, runBook)) state = 'complete';
  else state = 'ready';

  const confidence = desiredConfidence(state);
  const resumeAllowed = state === 'ready' && request.continuationAuthority === 'authorized';
  const improvementRecommended = ['partial', 'blocked', 'uncertain'].includes(state)
    && (request.priorSimilarRecoveryCount ?? 0) >= 2;

  return {
    version: CE_RECOVERY_ADAPTER_VERSION,
    state,
    confidence,
    reasons: uniqueReasons,
    resumeAllowed,
    improvementRecommended,
    nextSafeAction: request.nextSafeAction ?? capsule?.next_safe_action ?? null,
    currentCapsule: capsule,
    canonicalTaskStatus: task?.status ?? null,
    runBookStatus: runBook?.status ?? null,
    sources,
    threadKeeper,
    acp,
  };
}

function materialCapsuleChange(
  capsule: CurrentCapsuleRow,
  state: CeRecoveryState,
  confidence: CeRecoveryConfidence,
  authoritativeSources: unknown[],
  unresolved: unknown[],
  blockers: unknown[],
  pendingApprovals: unknown[],
  nextSafeAction: string | null,
): boolean {
  return capsule.recovery_state !== state
    || capsule.confidence !== confidence
    || JSON.stringify(capsule.authoritative_sources) !== JSON.stringify(authoritativeSources)
    || JSON.stringify(capsule.unresolved) !== JSON.stringify(unresolved)
    || JSON.stringify(capsule.blockers) !== JSON.stringify(blockers)
    || JSON.stringify(capsule.pending_approvals) !== JSON.stringify(pendingApprovals)
    || capsule.next_safe_action !== nextSafeAction;
}

export async function persistRecoveryOutcome(
  query: QueryFunction,
  request: RecoveryRequest,
  resolution: RecoveryResolution,
): Promise<RecoveryPersistenceResult> {
  validateRequest(request);
  if (resolution.version !== CE_RECOVERY_ADAPTER_VERSION) throw new Error('Unsupported CE recovery resolution version');
  const capsule = resolution.currentCapsule;
  if (!capsule) throw new Error('Cannot persist CE recovery without a current Continuity Capsule');
  if (capsule.project_id !== request.projectId || capsule.task_id !== request.taskId || capsule.capsule_key !== request.capsuleKey) {
    throw new Error('CE recovery resolution does not match the requested capsule identity');
  }

  const recoveryRef = `ce-recovery://${request.projectId}/${request.taskId}/${encodeURIComponent(request.interrupt.interruptKey)}`;
  const severity = resolution.state === 'uncertain' || resolution.state === 'blocked'
    ? 'high'
    : resolution.state === 'partial' ? 'moderate' : 'info';
  const signal = await query<{ signal_id: string }>(
    `SELECT comind.record_ce_signal(
       $1::uuid,$2::uuid,$3::uuid,'recovery_interrupt',$4,$5,$6,$7::jsonb,
       'continuous_excellence',$8,$9,$10::timestamptz
     )::text AS signal_id`,
    [
      request.projectId,
      request.taskId,
      request.actorId ?? null,
      severity,
      !['ready', 'complete'].includes(resolution.state),
      `Recovery interrupt ${request.interrupt.interruptKey} resolved as ${resolution.state}`,
      JSON.stringify({
        adapterVersion: resolution.version,
        trigger: request.interrupt.trigger,
        state: resolution.state,
        confidence: resolution.confidence,
        reasons: resolution.reasons,
        resumeAllowed: resolution.resumeAllowed,
        improvementRecommended: resolution.improvementRecommended,
        sources: resolution.sources,
      }),
      recoveryRef,
      `ce-002:${request.projectId}:${request.taskId}:${request.interrupt.interruptKey}`,
      request.interrupt.observedAt,
    ],
  );
  const signalId = signal.rows[0]?.signal_id;
  if (!signalId) throw new Error('CE recovery signal persistence outcome uncertain');

  const existingRunBook = await query<{ id: string }>(
    `SELECT e.id::text
       FROM comind_pm.pm_events e
       JOIN comind_pm.pm_work_items wi ON wi.id=e.work_item_id
       JOIN comind_pm.pm_projects p ON p.id=e.project_id
      WHERE p.project_key=$1 AND wi.work_key=$2
        AND e.source_system='continuous_excellence' AND e.source_ref=$3
      ORDER BY e.occurred_at DESC
      LIMIT 1`,
    [request.projectKey, request.workKey, recoveryRef],
  );

  let runBookEventId = existingRunBook.rows[0]?.id ?? null;
  if (!runBookEventId) {
    const event = await query<{ runbook_event_id: string }>(
      `SELECT comind_pm.record_runbook_event(
         $1,'recovery','CE-002 Recovery Adapter',$2,$3,'agent',$4,$5,$6,
         NULL,NULL,'continuous_excellence',$7,$8::jsonb,$9::jsonb,$10::timestamptz,true
       )::text AS runbook_event_id`,
      [
        request.projectKey,
        `Recovery interrupt ${request.interrupt.interruptKey} reconciled`,
        request.workKey,
        `State=${resolution.state}; confidence=${resolution.confidence}; resumeAllowed=${resolution.resumeAllowed}`,
        mapRunBookOutcome(resolution.state),
        resolution.nextSafeAction,
        recoveryRef,
        JSON.stringify({ adapterVersion: resolution.version, reasons: resolution.reasons, sources: resolution.sources }),
        JSON.stringify([{ type: 'ce_signal', id: signalId }]),
        request.now,
      ],
    );
    runBookEventId = event.rows[0]?.runbook_event_id ?? null;
    if (!runBookEventId) throw new Error('CE recovery RunBook persistence outcome uncertain');
  }

  const replay = await query<{ capsule_id: string }>(
    `SELECT capsule_id::text
       FROM comind.cm_ce_continuity_capsule
      WHERE project_id=$1::uuid AND task_id=$2::uuid AND capsule_key=$3
        AND source_system='continuous_excellence' AND source_ref=$4
      ORDER BY version DESC
      LIMIT 1`,
    [request.projectId, request.taskId, request.capsuleKey, recoveryRef],
  );
  if (replay.rows[0]) {
    return {
      signalId,
      runBookEventId,
      capsuleId: replay.rows[0].capsule_id,
      capsuleCreated: false,
      replayed: true,
    };
  }

  const sourceAdditions = resolution.sources.map(sourceObject);
  const authoritativeSources = appendUniqueJson(capsule.authoritative_sources, sourceAdditions);
  const unresolved = ['partial', 'uncertain'].includes(resolution.state)
    ? appendUniqueJson(capsule.unresolved, resolution.reasons.map(reason => `CE-002 recovery: ${reason}`))
    : capsule.unresolved;
  const blockers = resolution.state === 'blocked'
    ? appendUniqueJson(capsule.blockers, resolution.reasons.map(reason => `CE-002 recovery: ${reason}`))
    : capsule.blockers;
  const pendingApprovals = request.continuationAuthority === 'requires_approval'
    ? appendUniqueJson(capsule.pending_approvals, ['CE-002 recovery requires human continuation authority'])
    : capsule.pending_approvals;
  const nextSafeAction = resolution.nextSafeAction;

  if (!materialCapsuleChange(
    capsule,
    resolution.state,
    resolution.confidence,
    authoritativeSources,
    unresolved,
    blockers,
    pendingApprovals,
    nextSafeAction,
  )) {
    return { signalId, runBookEventId, capsuleId: null, capsuleCreated: false, replayed: false };
  }

  const captured = await query<{ capsule_id: string }>(
    `SELECT comind.capture_ce_continuity_capsule(
       $1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,
       $10::jsonb,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,
       $17,$18,$19,$20,'continuous_excellence',$21,$22::uuid
     )::text AS capsule_id`,
    [
      capsule.project_id,
      capsule.task_id,
      capsule.capsule_key,
      capsule.objective,
      JSON.stringify(capsule.completion_criteria),
      JSON.stringify(capsule.verification_method),
      JSON.stringify(capsule.acceptance_authority),
      JSON.stringify(capsule.accepted_baseline),
      JSON.stringify(authoritativeSources),
      JSON.stringify(capsule.decisions),
      JSON.stringify(capsule.constraints),
      `CE-002 recovery ${request.interrupt.interruptKey} resolved as ${resolution.state}; resumeAllowed=${resolution.resumeAllowed}`,
      JSON.stringify(capsule.active_work),
      JSON.stringify(unresolved),
      JSON.stringify(blockers),
      JSON.stringify(pendingApprovals),
      nextSafeAction,
      capsule.rollback_point,
      resolution.state,
      resolution.confidence,
      recoveryRef,
      request.actorId ?? capsule.captured_by_actor_id,
    ],
  );
  const capsuleId = captured.rows[0]?.capsule_id;
  if (!capsuleId) throw new Error('CE recovery Continuity Capsule persistence outcome uncertain');

  return { signalId, runBookEventId, capsuleId, capsuleCreated: true, replayed: false };
}
