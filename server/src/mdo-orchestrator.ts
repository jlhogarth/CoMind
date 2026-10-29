import { QueryFunction } from './db.js';

export type MdoPlanningRole =
  | 'module_planner'
  | 'architecture_analyst'
  | 'external_capability_scout'
  | 'lessons_learned_analyst'
  | 'dependency_analyst'
  | 'governance_reviewer'
  | 'assumption_validator'
  | 'integration_reviewer'
  | 'plan_synthesizer'
  | 'portfolio_coordinator';

export const MDO_ROLE_CAPABILITIES: Readonly<Record<MdoPlanningRole, string>> = Object.freeze({
  module_planner: 'mdo.plan.analyze',
  architecture_analyst: 'mdo.plan.analyze',
  external_capability_scout: 'mdo.plan.research',
  lessons_learned_analyst: 'mdo.plan.research',
  dependency_analyst: 'mdo.plan.analyze',
  governance_reviewer: 'mdo.plan.review',
  assumption_validator: 'mdo.plan.review',
  integration_reviewer: 'mdo.plan.review',
  plan_synthesizer: 'mdo.plan.synthesize',
  portfolio_coordinator: 'mdo.plan.portfolio',
});

export class MdoOrchestratorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MdoOrchestratorError';
  }
}

export interface MdoEnqueuePlanInput {
  readonly moduleId: string;
  readonly projectId: string;
  readonly requestedByActorId: string;
  readonly authorizationDecisionId: string;
  readonly objective: string;
  readonly idempotencyKey: string;
}

export interface MdoEnqueuePlanResult {
  readonly planId: string;
  readonly created: boolean;
  readonly taskCount: number;
}

export interface MdoClaimWorkInput {
  readonly profileId: string;
  readonly workerInstanceId: string;
  readonly leaseSeconds?: number;
}

export interface MdoClaimedWork {
  readonly taskId: string;
  readonly leaseToken: string;
  readonly fencingEpoch: number;
  readonly leaseExpiresAt: string;
  readonly planId: string;
  readonly capabilityCode: string;
}

export interface MdoTaskContext {
  readonly taskId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly moduleCode: string | null;
  readonly lifecycleStage: string;
  readonly projectId: string;
  readonly objective: string;
  readonly targetStage: string;
  readonly planStatus: string;
  readonly roleCode: MdoPlanningRole;
  readonly deliverableType: string;
  readonly sequenceNo: number;
  readonly requiredCapabilityCode: string;
  readonly priorContributions: readonly unknown[];
}

export interface MdoSubmitContributionInput {
  readonly taskId: string;
  readonly profileId: string;
  readonly executionContextId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly evidenceIds?: readonly string[];
}

interface EnqueueRow {
  plan_id: string;
  created: boolean;
  task_count: number | string;
}

interface ClaimRow {
  task_id: string;
  lease_token: string;
  fencing_epoch: number | string;
  lease_expires_at: string;
  plan_id: string;
  capability_code: string;
}

interface TaskContextRow {
  task_id: string;
  plan_id: string;
  module_id: string;
  module_name: string;
  module_code: string | null;
  lifecycle_stage: string;
  project_id: string;
  objective: string;
  target_stage: string;
  plan_status: string;
  role_code: MdoPlanningRole;
  deliverable_type: string;
  sequence_no: number | string;
  required_capability_code: string;
  prior_contributions: unknown;
}

interface ContributionRow {
  contribution_id: string;
}

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MdoOrchestratorError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function exactlyOne<T>(rows: readonly T[], code: string, message: string): T {
  if (rows.length !== 1) throw new MdoOrchestratorError(code, message);
  return rows[0];
}

export class MdoOrchestrator {
  constructor(private readonly queryFn: QueryFunction) {}

  async enqueuePlan(input: MdoEnqueuePlanInput): Promise<MdoEnqueuePlanResult> {
    requiredText(input.moduleId, 'moduleId');
    requiredText(input.projectId, 'projectId');
    requiredText(input.requestedByActorId, 'requestedByActorId');
    requiredText(input.authorizationDecisionId, 'authorizationDecisionId');
    requiredText(input.objective, 'objective');
    requiredText(input.idempotencyKey, 'idempotencyKey');

    const result = await this.queryFn<EnqueueRow>(
      `SELECT plan_id::text, created, task_count
       FROM comind.cm_mdo_enqueue_plan(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text
       )`,
      [
        input.moduleId,
        input.projectId,
        input.requestedByActorId,
        input.authorizationDecisionId,
        input.objective,
        input.idempotencyKey,
      ]
    );
    const row = exactlyOne(
      result.rows,
      'enqueue_failed',
      'MDO enqueue did not return exactly one governed plan result'
    );
    return Object.freeze({
      planId: row.plan_id,
      created: row.created,
      taskCount: Number(row.task_count),
    });
  }

  async claimWork(input: MdoClaimWorkInput): Promise<MdoClaimedWork | null> {
    requiredText(input.profileId, 'profileId');
    requiredText(input.workerInstanceId, 'workerInstanceId');
    const leaseSeconds = input.leaseSeconds ?? 60;
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
      throw new MdoOrchestratorError('invalid_request', 'leaseSeconds must be an integer between 5 and 300');
    }

    const result = await this.queryFn<ClaimRow>(
      `SELECT task_id::text, lease_token::text, fencing_epoch,
              lease_expires_at::text, plan_id::text, capability_code
       FROM comind.cm_mdo_claim_work($1::uuid, $2::text, $3::integer)`,
      [input.profileId, input.workerInstanceId, leaseSeconds]
    );
    if (result.rows.length === 0) return null;
    const row = exactlyOne(
      result.rows,
      'claim_failed',
      'MDO claim returned more than one task for one bounded lease'
    );
    return Object.freeze({
      taskId: row.task_id,
      leaseToken: row.lease_token,
      fencingEpoch: Number(row.fencing_epoch),
      leaseExpiresAt: row.lease_expires_at,
      planId: row.plan_id,
      capabilityCode: row.capability_code,
    });
  }

  async loadTaskContext(taskId: string): Promise<MdoTaskContext> {
    requiredText(taskId, 'taskId');
    const result = await this.queryFn<TaskContextRow>(
      `SELECT
         mpt.task_id::text,
         mpt.plan_id::text,
         mr.module_id::text,
         mr.name::text AS module_name,
         mr.module_code::text,
         mr.lifecycle_stage,
         mp.project_id::text,
         mp.objective,
         mp.target_stage,
         mp.status AS plan_status,
         mpt.role_code,
         mpt.deliverable_type,
         mpt.sequence_no,
         cap.capability_code AS required_capability_code,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'role_code', prior.role_code,
               'sequence_no', prior.sequence_no,
               'payload', contribution.payload,
               'contribution_id', contribution.contribution_id::text,
               'evidence_ids', COALESCE((
                 SELECT jsonb_agg(ce.evidence_id::text ORDER BY ce.evidence_id::text)
                 FROM comind.cm_mdo_contribution_evidence ce
                 WHERE ce.contribution_id = contribution.contribution_id
               ), '[]'::jsonb)
             )
             ORDER BY prior.sequence_no
           ) FILTER (WHERE contribution.contribution_id IS NOT NULL),
           '[]'::jsonb
         ) AS prior_contributions
       FROM comind.cm_mdo_plan_task mpt
       JOIN comind.cm_mdo_plan mp ON mp.plan_id = mpt.plan_id
       JOIN comind.cm_module_registry mr ON mr.module_id = mp.module_id
       JOIN comind.cm_foundry_capability cap ON cap.capability_id = mpt.required_capability_id
       LEFT JOIN comind.cm_mdo_plan_task prior
         ON prior.plan_id = mpt.plan_id AND prior.sequence_no < mpt.sequence_no
       LEFT JOIN comind.cm_mdo_contribution contribution ON contribution.task_id = prior.task_id
       WHERE mpt.task_id = $1::uuid
       GROUP BY
         mpt.task_id, mpt.plan_id, mr.module_id, mr.name, mr.module_code,
         mr.lifecycle_stage, mp.project_id, mp.objective, mp.target_stage,
         mp.status, mpt.role_code, mpt.deliverable_type, mpt.sequence_no,
         cap.capability_code`,
      [taskId]
    );
    const row = exactlyOne(
      result.rows,
      'task_context_missing',
      'MDO task context did not resolve exactly once'
    );
    const prior = Array.isArray(row.prior_contributions) ? row.prior_contributions : [];
    return Object.freeze({
      taskId: row.task_id,
      planId: row.plan_id,
      moduleId: row.module_id,
      moduleName: row.module_name,
      moduleCode: row.module_code,
      lifecycleStage: row.lifecycle_stage,
      projectId: row.project_id,
      objective: row.objective,
      targetStage: row.target_stage,
      planStatus: row.plan_status,
      roleCode: row.role_code,
      deliverableType: row.deliverable_type,
      sequenceNo: Number(row.sequence_no),
      requiredCapabilityCode: row.required_capability_code,
      priorContributions: Object.freeze(prior),
    });
  }

  async submitContribution(input: MdoSubmitContributionInput): Promise<string> {
    requiredText(input.taskId, 'taskId');
    requiredText(input.profileId, 'profileId');
    requiredText(input.executionContextId, 'executionContextId');
    requiredText(input.idempotencyKey, 'idempotencyKey');
    if (input.payload === null || typeof input.payload !== 'object' || Array.isArray(input.payload)
      || Object.keys(input.payload).length === 0) {
      throw new MdoOrchestratorError('invalid_request', 'payload must be a non-empty object');
    }

    const result = await this.queryFn<ContributionRow>(
      `SELECT comind.cm_mdo_submit_contribution(
         $1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5::text, $6::uuid[]
       )::text AS contribution_id`,
      [
        input.taskId,
        input.profileId,
        input.executionContextId,
        JSON.stringify(input.payload),
        input.idempotencyKey,
        [...(input.evidenceIds ?? [])],
      ]
    );
    return exactlyOne(
      result.rows,
      'contribution_failed',
      'MDO contribution submission did not return exactly one identifier'
    ).contribution_id;
  }
}
