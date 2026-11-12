import type { FoundryExecutionRequest, FoundryExecutionResult, FoundryRuntimeOrchestrator } from './foundry-runtime.js';
import { sha256Fingerprint } from './foundry-runtime.js';

export interface ParallelSpecialist {
  readonly key: string;
  readonly profileId: string;
  readonly capabilityCode: string;
  readonly taskId: string;
  readonly targetKind: string;
  readonly targetRef: string;
  readonly projectId: string;
  readonly predecessors: readonly string[];
  readonly input?: Readonly<Record<string, unknown>>;
}
export interface ParallelReceipt {
  readonly key: string;
  readonly taskId: string;
  readonly authorizationDecisionId: string;
  readonly executionContextId: string;
  readonly adapterOperationResultId: string;
  readonly executionOutcomeId: string;
  readonly evidenceRef: string;
  readonly predecessors: readonly string[];
  readonly elapsedMs: number;
  readonly fencingEpoch: number;
}
export interface ParallelBlocker {
  readonly key: string;
  readonly taskId: string;
  readonly code: string;
  readonly reconciliationRequired: boolean;
}
export interface ParallelOutcome {
  readonly status: 'completed' | 'blocked';
  readonly manifestEvidenceRef: string;
  readonly receipts: readonly ParallelReceipt[];
  readonly blocked: readonly string[];
  readonly blockers: readonly ParallelBlocker[];
}
export class ParallelCollaborationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ParallelCollaborationError';
  }
}
export interface ParallelClaim { readonly taskId: string; readonly leaseToken: string; readonly fencingEpoch: number; }
export interface ParallelManifestTask {
  readonly key: string; readonly profileId: string; readonly taskId: string;
  readonly projectId: string; readonly capabilityCode: string;
  readonly targetKind: string; readonly targetRef: string;
  readonly predecessors: readonly string[]; readonly inputFingerprint: string;
}
export interface ParallelDependencies {
  // Persist/reconcile the exact graph before any work is claimed. Never include raw input in the manifest.
  readonly prepareRun: (runKey: string, manifest: readonly ParallelManifestTask[]) => Promise<string>;
  // Return only receipts verified against canonical leases, authority, outcomes and evidence.
  readonly loadCompleted: (runKey: string, task: ParallelSpecialist) => Promise<ParallelReceipt | null>;
  readonly claim: (task: ParallelSpecialist) => Promise<ParallelClaim>;
  readonly finish: (task: ParallelSpecialist, claim: ParallelClaim, completed: boolean) => Promise<boolean>;
  readonly renew: (task: ParallelSpecialist, claim: ParallelClaim) => Promise<boolean>;
  readonly renewalIntervalMs?: number;
  readonly foundry: Pick<FoundryRuntimeOrchestrator, 'execute'>;
  // The accountable authority evaluates this exact task and canonical predecessor receipts.
  readonly authorize: (task: ParallelSpecialist, predecessors: readonly ParallelReceipt[]) => Promise<string>;
  readonly verifyEvidence: (task: ParallelSpecialist, result: FoundryExecutionResult) => Promise<string>;
  readonly signal?: AbortSignal;
  // The host persists bounded observations in its canonical RunBook/evidence system.
  readonly observe: (event: Readonly<{
    runKey: string; key: string; taskId: string;
    phase: 'claimed' | 'authorized' | 'heartbeat' | 'completed' | 'blocked';
    code?: string;
    receipt?: ParallelReceipt;
  }>) => Promise<void>;
  readonly now?: () => number;
}
const KEY = /^[a-z][a-z0-9_:-]{0,63}$/;
function validate(tasks: readonly ParallelSpecialist[], maxConcurrency: number, runKey: string): void {
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8
    || !KEY.test(runKey) || tasks.length < 2 || tasks.length > 32) {
    throw new ParallelCollaborationError('invalid_graph', 'Run identity, bounded concurrency and task count are required');
  }
  const seen = new Set<string>();
  const profiles = new Set<string>();
  const taskIds = new Set<string>();
  for (const task of tasks) {
    if (!KEY.test(task.key) || seen.has(task.key) || !task.profileId || profiles.has(task.profileId)
      || !task.taskId || taskIds.has(task.taskId) || !task.projectId || !task.targetRef
      || !task.targetKind || !task.capabilityCode || !Array.isArray(task.predecessors)
      || new Set(task.predecessors).size !== task.predecessors.length) {
      throw new ParallelCollaborationError('invalid_graph', 'Each specialist needs a distinct key, profile, task and exact scope');
    }
    seen.add(task.key);
    profiles.add(task.profileId);
    taskIds.add(task.taskId);
  }
  const byKey = new Map(tasks.map(task => [task.key, task]));
  for (const task of tasks) {
    if (task.predecessors.some(key => key === task.key || !byKey.has(key))) {
      throw new ParallelCollaborationError('invalid_graph', 'Predecessors must identify other tasks in this run');
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(key: string): void {
    if (visiting.has(key)) throw new ParallelCollaborationError('invalid_graph', 'Dependency cycle');
    if (visited.has(key)) return;
    visiting.add(key);
    for (const prior of byKey.get(key)!.predecessors) visit(prior);
    visiting.delete(key);
    visited.add(key);
  }
  for (const task of tasks) visit(task.key);
}

export async function runParallelCollaboration(
  dependencies: ParallelDependencies,
  tasks: readonly ParallelSpecialist[],
  runKey: string,
  maxConcurrency: number
): Promise<ParallelOutcome> {
  validate(tasks, maxConcurrency, runKey);
  const renewalIntervalMs = dependencies.renewalIntervalMs ?? 30_000;
  if (!Number.isSafeInteger(renewalIntervalMs) || renewalIntervalMs < 10 || renewalIntervalMs > 60_000) {
    throw new ParallelCollaborationError('invalid_renewal', 'Lease renewal interval must be bounded');
  }
  const manifest = Object.freeze(tasks.map(task => Object.freeze({
    key: task.key, profileId: task.profileId, taskId: task.taskId,
    projectId: task.projectId, capabilityCode: task.capabilityCode,
    targetKind: task.targetKind, targetRef: task.targetRef,
    predecessors: Object.freeze([...task.predecessors]), inputFingerprint: sha256Fingerprint(task.input ?? {}),
  })));
  const manifestEvidenceRef = await dependencies.prepareRun(runKey, manifest);
  if (!manifestEvidenceRef) throw new ParallelCollaborationError('manifest_missing', 'Durable run manifest was not recorded');
  const receipts = new Map<string, ParallelReceipt>();
  const blockers: ParallelBlocker[] = [];
  const pending = new Set(tasks.map(task => task.key));
  const seenEvidence = new Set<string>();
  const receiptKeys = [
    'adapterOperationResultId', 'authorizationDecisionId', 'elapsedMs', 'evidenceRef',
    'executionContextId', 'executionOutcomeId', 'fencingEpoch', 'key', 'predecessors', 'taskId',
  ].sort().join(',');
  for (const task of tasks) {
    const recovered = await dependencies.loadCompleted(runKey, task);
    if (recovered === null) continue;
    if (recovered.key !== task.key || recovered.taskId !== task.taskId
      || !recovered.authorizationDecisionId || !recovered.executionContextId
      || !recovered.executionOutcomeId || !recovered.adapterOperationResultId
      || !recovered.evidenceRef || seenEvidence.has(recovered.evidenceRef)
      || !Number.isSafeInteger(recovered.fencingEpoch) || recovered.fencingEpoch < 1
      || !Number.isFinite(recovered.elapsedMs) || recovered.elapsedMs < 0
      || !Array.isArray(recovered.predecessors)
      || JSON.stringify(recovered.predecessors) !== JSON.stringify(task.predecessors)
      || Object.keys(recovered).sort().join(',') !== receiptKeys) {
      throw new ParallelCollaborationError('recovery_mismatch', 'Canonical completion does not match the run manifest');
    }
    seenEvidence.add(recovered.evidenceRef);
    receipts.set(task.key, Object.freeze(recovered));
    pending.delete(task.key);
  }
  for (const task of tasks) {
    if (receipts.has(task.key) && task.predecessors.some(key => !receipts.has(key))) {
      throw new ParallelCollaborationError('recovery_mismatch', 'Recovered completion is missing a predecessor');
    }
  }
  const running = new Map<string, Promise<void>>();
  let failed = false;
  const now = dependencies.now ?? Date.now;
  async function observe(task: ParallelSpecialist, phase: 'claimed' | 'authorized' | 'completed', receipt?: ParallelReceipt): Promise<void> {
    try { await dependencies.observe({ runKey, key: task.key, taskId: task.taskId, phase, ...(receipt ? { receipt } : {}) }); }
    catch { throw new ParallelCollaborationError('observation_failed', 'Durable progress observation failed'); }
  }
  async function execute(task: ParallelSpecialist): Promise<void> {
    const predecessors = Object.freeze(task.predecessors.map(key => receipts.get(key)!));
    const start = now();
    let claim: ParallelClaim | null = null;
    let executionRecorded = false;
    let leaseLost = false;
    let renewalTimer: ReturnType<typeof setInterval> | null = null;
    let renewalPending: Promise<void> | null = null;
    try {
      if (dependencies.signal?.aborted) throw new ParallelCollaborationError('human_stop', 'Execution stopped before claim');
      claim = await dependencies.claim(task);
      if (claim.taskId !== task.taskId || !claim.leaseToken
        || !Number.isSafeInteger(claim.fencingEpoch) || claim.fencingEpoch < 1) {
        throw new ParallelCollaborationError('claim_mismatch', 'Fenced claim does not match assigned task');
      }
      const ownedClaim = claim;
      renewalTimer = setInterval(() => {
        if (renewalPending || leaseLost) return;
        renewalPending = dependencies.renew(task, ownedClaim).then(async valid => {
          if (!valid) leaseLost = true;
          else await dependencies.observe({ runKey, key: task.key, taskId: task.taskId, phase: 'heartbeat' });
        }).catch(() => { leaseLost = true; }).finally(() => { renewalPending = null; });
      }, renewalIntervalMs);
      await observe(task, 'claimed');
      if (dependencies.signal?.aborted) throw new ParallelCollaborationError('human_stop', 'Execution stopped before authorization');
      // Authorization belongs to the specialist, and is requested only after all dependencies finish.
      const authorizationDecisionId = await dependencies.authorize(task, predecessors);
      if (!authorizationDecisionId) throw new ParallelCollaborationError('authorization_missing', 'No task-specific decision');
      await observe(task, 'authorized');
      const request: FoundryExecutionRequest = {
        profileId: task.profileId, capabilityCode: task.capabilityCode,
        authorizationDecisionId, authorityLevel: 'C1', environment: 'isolated',
        targetKind: task.targetKind, targetRef: task.targetRef, projectId: task.projectId,
        taskId: task.taskId, idempotencyKey: `${runKey}:${task.key}`,
        input: Object.freeze({ ...(task.input ?? {}), predecessor_evidence: predecessors.map(p => p.evidenceRef) }),
      };
      const result = await dependencies.foundry.execute(request);
      executionRecorded = true;
      if (result.terminalStatus !== 'succeeded' || !result.executionContextId
        || !result.executionOutcomeId || !result.adapterOperationResultId) {
        throw new ParallelCollaborationError('execution_failed', 'Specialist lacks a successful terminal execution');
      }
      const evidenceRef = await dependencies.verifyEvidence(task, result);
      if (!evidenceRef || evidenceRef !== result.resultRef) {
        throw new ParallelCollaborationError('evidence_mismatch', 'Canonical evidence does not match execution result');
      }
      if (renewalTimer) clearInterval(renewalTimer);
      renewalTimer = null;
      if (renewalPending) await renewalPending;
      if (leaseLost || !await dependencies.renew(task, ownedClaim)) {
        throw new ParallelCollaborationError('lease_lost', 'Fenced claim could not be renewed before completion');
      }
      if (dependencies.signal?.aborted) throw new ParallelCollaborationError('human_stop', 'Execution stopped before completion');
      if (!await dependencies.finish(task, claim, true)) {
        throw new ParallelCollaborationError('lease_finish_failed', 'Fenced completion was not recorded');
      }
      const completedClaim = claim;
      claim = null;
      const receipt = Object.freeze({
        key: task.key, taskId: task.taskId, authorizationDecisionId,
        executionContextId: result.executionContextId,
        adapterOperationResultId: result.adapterOperationResultId,
        executionOutcomeId: result.executionOutcomeId, evidenceRef,
        predecessors: Object.freeze([...task.predecessors]), elapsedMs: Math.max(0, now() - start),
        fencingEpoch: completedClaim.fencingEpoch,
      });
      receipts.set(task.key, receipt);
      await observe(task, 'completed', receipt);
    } catch (error) {
      failed = true;
      let reconciliationRequired = executionRecorded || leaseLost;
      if (renewalTimer) clearInterval(renewalTimer);
      if (renewalPending) await renewalPending;
      if (claim !== null) {
        try {
          if (!await dependencies.finish(task, claim, false)) reconciliationRequired = true;
        } catch { reconciliationRequired = true; }
      }
      const code = error instanceof ParallelCollaborationError ? error.code
        : error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[a-z][a-z0-9._:-]{0,127}$/.test(error.code)
          ? error.code : 'specialist_failed';
      blockers.push(Object.freeze({ key: task.key, taskId: task.taskId, code, reconciliationRequired }));
      try { await dependencies.observe({ runKey, key: task.key, taskId: task.taskId, phase: 'blocked', code }); }
      catch { blockers.push(Object.freeze({ key: task.key, taskId: task.taskId, code: 'observation_failed', reconciliationRequired: true })); }
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
    }
  }
  while (pending.size || running.size) {
    if (!failed && !dependencies.signal?.aborted) {
      for (const task of tasks) {
        if (running.size >= maxConcurrency) break;
        if (!pending.has(task.key) || !task.predecessors.every(key => receipts.has(key))) continue;
        pending.delete(task.key);
        const work = execute(task).finally(() => { running.delete(task.key); });
        running.set(task.key, work);
      }
    }
    if (running.size === 0) break;
    await Promise.race(running.values());
  }
  // In-flight work completes, but failure prevents any further handoff.
  return Object.freeze({
    status: failed || pending.size || dependencies.signal?.aborted ? 'blocked' : 'completed',
    manifestEvidenceRef,
    receipts: Object.freeze(tasks.flatMap(task => receipts.has(task.key) ? [receipts.get(task.key)!] : [])),
    blocked: Object.freeze(tasks.filter(task => !receipts.has(task.key)).map(task => task.key)),
    blockers: Object.freeze([
      ...blockers,
      ...(dependencies.signal?.aborted ? tasks.filter(task => pending.has(task.key)).map(task => Object.freeze({
        key: task.key, taskId: task.taskId, code: 'human_stop', reconciliationRequired: false,
      })) : []),
    ]),
  });
}
