import type { MdoClaimedWork, MdoOrchestrator, MdoPlanningRole, MdoTaskContext } from './mdo-orchestrator.js';
import { MDO_ROLE_CAPABILITIES } from './mdo-orchestrator.js';
import type { MdoExecuteClaimInput, MdoExecuteClaimResult, MdoPlanningWorker } from './mdo-planning-runtime.js';

// This composes the existing MDO queue and Foundry worker. It never issues authority.
export const COLLABORATION_ROLES: readonly MdoPlanningRole[] = Object.freeze([
  'module_planner', 'architecture_analyst', 'external_capability_scout',
  'lessons_learned_analyst', 'dependency_analyst', 'governance_reviewer',
  'assumption_validator', 'integration_reviewer', 'plan_synthesizer',
  'portfolio_coordinator',
]);

export interface CollaborationAssignment {
  readonly role: MdoPlanningRole;
  readonly profileId: string;
  readonly workerInstanceId: string;
}

export interface CollaborationReceipt {
  readonly role: MdoPlanningRole;
  readonly authorizationDecisionId: string;
  readonly taskId: string;
  readonly contributionId: string;
  readonly evidenceId: string;
  readonly executionContextId: string;
  readonly provider: string;
  readonly model: string;
}

export interface CollaborationOutcome {
  readonly status: 'completed' | 'blocked';
  readonly planId: string;
  readonly receipts: readonly CollaborationReceipt[];
  readonly blockedRole?: MdoPlanningRole;
  readonly reason?: string;
}

export class CollaborationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CollaborationError';
  }
}

type ClaimingMdo = Pick<MdoOrchestrator, 'claimWork' | 'loadTaskContext'>;
type ExecutingWorker = Pick<MdoPlanningWorker, 'executeClaim'>;

export interface CollaborationDependencies {
  readonly mdo: ClaimingMdo;
  readonly worker: ExecutingWorker;
  // Separate accountable authority supplies the exact post-claim decision.
  readonly authorizeClaim: (claim: MdoClaimedWork, context: MdoTaskContext, assignment: CollaborationAssignment) => Promise<string>;
  // A mismatched claim has already acquired a fenced lease and must be released.
  readonly releaseMismatchedClaim: (claim: MdoClaimedWork, workerInstanceId: string) => Promise<void>;
}

function validateAssignments(assignments: readonly CollaborationAssignment[]): void {
  if (assignments.length !== COLLABORATION_ROLES.length) {
    throw new CollaborationError('invalid_assignments', 'The complete MDO phase chain requires ten assignments');
  }
  assignments.forEach((assignment, index) => {
    if (assignment.role !== COLLABORATION_ROLES[index]
      || !assignment.profileId || !assignment.workerInstanceId) {
      throw new CollaborationError('invalid_assignments', 'Assignments must have exact role order and profiles');
    }
  });
}

function assertContext(
  context: MdoTaskContext, claim: MdoClaimedWork, planId: string,
  role: MdoPlanningRole, sequence: number
): void {
  if (context.taskId !== claim.taskId || context.planId !== planId
    || context.roleCode !== role || context.sequenceNo !== sequence
    || context.requiredCapabilityCode !== MDO_ROLE_CAPABILITIES[role]
    || context.priorContributions.length !== sequence - 1) {
    throw new CollaborationError('handoff_mismatch', 'Claim and canonical predecessor chain do not match the assigned specialist');
  }
  for (const prior of context.priorContributions) {
    const refs = prior !== null && typeof prior === 'object'
      ? (prior as { evidence_ids?: unknown }).evidence_ids : null;
    if (!Array.isArray(refs) || refs.length === 0
      || refs.some((ref) => typeof ref !== 'string' || ref.trim().length === 0)) {
      throw new CollaborationError('predecessor_evidence_missing', 'A prior specialist contribution has no canonical evidence reference');
    }
  }
}

export async function runMdoCollaboration(
  dependencies: CollaborationDependencies,
  planId: string,
  assignments: readonly CollaborationAssignment[],
  runKey: string
): Promise<CollaborationOutcome> {
  if (!planId || !runKey || runKey.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(runKey)) {
    throw new CollaborationError('invalid_request', 'Exact plan and bounded run identity are required');
  }
  validateAssignments(assignments);
  const receipts: CollaborationReceipt[] = [];
  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    let claim: MdoClaimedWork | null = null;
    try {
      claim = await dependencies.mdo.claimWork({
        profileId: assignment.profileId,
        workerInstanceId: assignment.workerInstanceId,
        leaseSeconds: 300,
      });
      if (claim === null) {
        throw new CollaborationError('work_unavailable', 'The next governed phase has no claimable work');
      }
      if (claim.planId !== planId || claim.capabilityCode !== MDO_ROLE_CAPABILITIES[assignment.role]) {
        throw new CollaborationError('claim_mismatch', 'Claim belongs to another plan or capability');
      }
      const context = await dependencies.mdo.loadTaskContext(claim.taskId);
      assertContext(context, claim, planId, assignment.role, index + 1);
      const authorizationDecisionId = await dependencies.authorizeClaim(claim, context, assignment);
      if (!authorizationDecisionId) {
        throw new CollaborationError('authorization_missing', 'Accountable authority returned no decision');
      }
      const executionInput: MdoExecuteClaimInput = {
        profileId: assignment.profileId,
        workerInstanceId: assignment.workerInstanceId,
        authorizationDecisionId,
        claim,
        idempotencyKey: `${runKey}:${index + 1}`,
      };
      // The worker owns the claim from this point and handles failure release.
      claim = null;
      const result: MdoExecuteClaimResult = await dependencies.worker.executeClaim(executionInput);
      if (result.planId !== planId || result.taskId !== context.taskId
        || result.execution.terminalStatus !== 'succeeded'
        || !result.evidenceId || !result.contributionId || !result.execution.executionContextId) {
        throw new CollaborationError('result_mismatch', 'Specialist did not return complete canonical execution evidence');
      }
      receipts.push(Object.freeze({
        role: assignment.role,
        authorizationDecisionId,
        taskId: result.taskId,
        contributionId: result.contributionId,
        evidenceId: result.evidenceId,
        executionContextId: result.execution.executionContextId,
        provider: result.provider,
        model: result.model,
      }));
    } catch (error) {
      if (claim !== null) {
        try {
          await dependencies.releaseMismatchedClaim(claim, assignment.workerInstanceId);
        } catch {
          throw new CollaborationError('lease_release_failed', 'Claim release failed; recovery owner must reconcile the fenced lease');
        }
      }
      return Object.freeze({
        status: 'blocked', planId, receipts: Object.freeze([...receipts]),
        blockedRole: assignment.role,
        reason: error instanceof Error ? error.message : 'Unknown specialist failure',
      });
    }
  }
  return Object.freeze({ status: 'completed', planId, receipts: Object.freeze(receipts) });
}
