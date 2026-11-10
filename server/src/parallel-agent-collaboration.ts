import type { FoundryExecutionRequest, FoundryExecutionResult, FoundryRuntimeOrchestrator } from './foundry-runtime.js';

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
}
export interface ParallelOutcome {
  readonly status: 'completed' | 'blocked';
  readonly receipts: readonly ParallelReceipt[];
  readonly blocked: readonly string[];
}
export class ParallelCollaborationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ParallelCollaborationError';
  }
}
export interface ParallelDependencies {
  readonly foundry: Pick<FoundryRuntimeOrchestrator, 'execute'>;
  // The accountable authority evaluates this exact task and canonical predecessor receipts.
  readonly authorize: (task: ParallelSpecialist, predecessors: readonly ParallelReceipt[]) => Promise<string>;
  readonly verifyEvidence: (task: ParallelSpecialist, result: FoundryExecutionResult) => Promise<string>;
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
  const receipts = new Map<string, ParallelReceipt>();
  const pending = new Set(tasks.map(task => task.key));
  const running = new Map<string, Promise<void>>();
  let failed = false;
  const now = dependencies.now ?? Date.now;
  async function execute(task: ParallelSpecialist): Promise<void> {
    const predecessors = Object.freeze(task.predecessors.map(key => receipts.get(key)!));
    const start = now();
    try {
      // Authorization belongs to the specialist, and is requested only after all dependencies finish.
      const authorizationDecisionId = await dependencies.authorize(task, predecessors);
      if (!authorizationDecisionId) throw new ParallelCollaborationError('authorization_missing', 'No task-specific decision');
      const request: FoundryExecutionRequest = {
        profileId: task.profileId, capabilityCode: task.capabilityCode,
        authorizationDecisionId, authorityLevel: 'C1', environment: 'isolated',
        targetKind: task.targetKind, targetRef: task.targetRef, projectId: task.projectId,
        taskId: task.taskId, idempotencyKey: `${runKey}:${task.key}`,
        input: Object.freeze({ ...(task.input ?? {}), predecessor_evidence: predecessors.map(p => p.evidenceRef) }),
      };
      const result = await dependencies.foundry.execute(request);
      if (result.terminalStatus !== 'succeeded' || !result.executionContextId
        || !result.executionOutcomeId || !result.adapterOperationResultId) {
        throw new ParallelCollaborationError('execution_failed', 'Specialist lacks a successful terminal execution');
      }
      const evidenceRef = await dependencies.verifyEvidence(task, result);
      if (!evidenceRef || evidenceRef !== result.resultRef) {
        throw new ParallelCollaborationError('evidence_mismatch', 'Canonical evidence does not match execution result');
      }
      receipts.set(task.key, Object.freeze({
        key: task.key, taskId: task.taskId, authorizationDecisionId,
        executionContextId: result.executionContextId,
        adapterOperationResultId: result.adapterOperationResultId,
        executionOutcomeId: result.executionOutcomeId, evidenceRef,
        predecessors: Object.freeze([...task.predecessors]), elapsedMs: Math.max(0, now() - start),
      }));
    } catch {
      failed = true;
    }
  }
  while (pending.size || running.size) {
    if (!failed) {
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
    status: failed || pending.size ? 'blocked' : 'completed',
    receipts: Object.freeze(tasks.flatMap(task => receipts.has(task.key) ? [receipts.get(task.key)!] : [])),
    blocked: Object.freeze(tasks.filter(task => !receipts.has(task.key)).map(task => task.key)),
  });
}
