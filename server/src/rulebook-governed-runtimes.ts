import {
  FoundryAdapterRegistry,
  FoundryExecutionRequest,
  FoundryExecutionResult,
  FoundryRuntimeOrchestrator,
} from './foundry-runtime.js';
import {
  VeLifecycleAction,
  VeLifecycleCoordinator,
  VeLifecycleCoordinatorInput,
  VeLifecycleCoordinatorResult,
  VeResourceLifecycleAdapter,
} from './ve-lifecycle-coordinator.js';
import {
  MdoClaimInput,
  MdoClaimResult,
  MdoContributionInput,
  MdoContributionResult,
  MdoEnqueuePlanInput,
  MdoEnqueuePlanResult,
  MdoOrchestrator,
} from './mdo-orchestrator.js';
import { QueryFunction } from './db.js';
import {
  RulebookOperationalAuthority,
  createDatabaseRulebookOperationalAuthority,
  observeOperationalTrustBoundary,
  rulebookProjectScope,
  rulebookTenantScope,
} from './rulebook-operational-authority.js';
import { RulebookExecutionPreflightError } from './providers/rulebook-execution-preflight.js';

interface FoundryScopeRow {
  org_id: string;
  project_id: string | null;
  capability_action: string;
}

interface VeScopeRow {
  org_id: string;
  project_id: string | null;
}

interface MdoScopeRow {
  org_id: string;
}

interface FoundryDelegate {
  execute(request: FoundryExecutionRequest): Promise<FoundryExecutionResult>;
}

interface VeDelegate {
  transition(action: VeLifecycleAction, input: VeLifecycleCoordinatorInput): Promise<VeLifecycleCoordinatorResult>;
}

interface MdoDelegate {
  enqueuePlan(input: MdoEnqueuePlanInput): Promise<MdoEnqueuePlanResult>;
  claimWork(input: MdoClaimInput): Promise<MdoClaimResult | null>;
  submitContribution(input: MdoContributionInput): Promise<MdoContributionResult>;
}

function wrapPreflightError(error: unknown, codePrefix: string): never {
  if (error instanceof RulebookExecutionPreflightError) {
    const wrapped = new Error(error.message) as Error & { code?: string };
    wrapped.name = 'RulebookOperationalAuthorityError';
    wrapped.code = `${codePrefix}_${error.code}`;
    throw wrapped;
  }
  throw error;
}

export class GovernedFoundryRuntimeOrchestrator {
  private readonly authority: RulebookOperationalAuthority;
  private readonly delegate: FoundryDelegate;

  constructor(
    private readonly queryFn: QueryFunction,
    registry: FoundryAdapterRegistry,
    private readonly now: () => Date = () => new Date(),
    authority?: RulebookOperationalAuthority,
    delegate?: FoundryDelegate
  ) {
    this.authority = authority ?? createDatabaseRulebookOperationalAuthority(queryFn);
    this.delegate = delegate ?? new FoundryRuntimeOrchestrator(queryFn, registry, now);
  }

  async execute(request: FoundryExecutionRequest): Promise<FoundryExecutionResult> {
    const result = await this.queryFn<FoundryScopeRow>(
      `SELECT p.org_id::text,
              ar.project_id::text,
              c.action AS capability_action
       FROM comind.cm_foundry_agent_profile AS p
       JOIN comind.cm_foundry_capability AS c
         ON c.capability_code = $2::text
       JOIN comind.cm_foundry_authorization_decision AS ad
         ON ad.authorization_decision_id = $3::uuid
       JOIN comind.cm_foundry_authorization_request AS ar
         ON ar.authorization_request_id = ad.authorization_request_id
       WHERE p.profile_id = $1::uuid
         AND p.status = 'active'
         AND ad.decision = 'approved'
         AND ar.status IN ('pending','approved')
         AND (ar.expires_at IS NULL OR ar.expires_at > clock_timestamp())
         AND (ad.effective_until IS NULL OR ad.effective_until > clock_timestamp())
         AND ar.requesting_profile_id = p.profile_id
         AND ar.requesting_actor_id = p.actor_id
         AND ar.capability_id = c.capability_id
         AND ar.project_id IS NOT DISTINCT FROM $4::uuid
         AND ar.task_id IS NOT DISTINCT FROM $5::uuid
         AND ar.authority_level = $6::text
         AND ar.environment = $7::text
         AND ar.target_kind = $8::text
         AND ar.target_ref IS NOT DISTINCT FROM $9::text`,
      [
        request.profileId,
        request.capabilityCode,
        request.authorizationDecisionId,
        request.projectId ?? null,
        request.taskId ?? null,
        request.authorityLevel,
        request.environment,
        request.targetKind,
        request.targetRef ?? null,
      ]
    );
    if (result.rows.length !== 1) {
      const error = new Error('Foundry RuleBook scope could not be resolved from one approved exact authorization') as Error & { code?: string };
      error.code = 'foundry_rulebook_scope_unavailable';
      throw error;
    }

    const scope = result.rows[0];
    const trust = observeOperationalTrustBoundary(request.input ?? null);
    const tenant = rulebookTenantScope(scope.org_id);
    const project = rulebookProjectScope(scope.project_id);
    try {
      await this.authority.require({
        source_tenant: tenant,
        target_tenant: tenant,
        source_project: project,
        target_project: project,
        action: scope.capability_action,
        untrusted_input: trust.untrusted_input,
        asks_for_secrets: trust.asks_for_secrets,
        authority_escalation: trust.authority_escalation,
        side_effect: true,
        human_approved: true,
      });
    } catch (error) {
      wrapPreflightError(error, 'foundry');
    }

    return this.delegate.execute(request);
  }
}

export class GovernedVeLifecycleCoordinator {
  private readonly authority: RulebookOperationalAuthority;
  private readonly delegate: VeDelegate;

  constructor(
    private readonly queryFn: QueryFunction,
    resourceAdapters: Readonly<Record<string, VeResourceLifecycleAdapter>> = {},
    private readonly now: () => Date = () => new Date(),
    authority?: RulebookOperationalAuthority,
    delegate?: VeDelegate
  ) {
    this.authority = authority ?? createDatabaseRulebookOperationalAuthority(queryFn);
    this.delegate = delegate ?? new VeLifecycleCoordinator(queryFn, resourceAdapters, now);
  }

  async transition(action: VeLifecycleAction, input: VeLifecycleCoordinatorInput): Promise<VeLifecycleCoordinatorResult> {
    const result = await this.queryFn<VeScopeRow>(
      `SELECT p.org_id::text, ar.project_id::text
       FROM comind.cm_foundry_agent_profile AS p
       JOIN comind.cm_foundry_authorization_decision AS ad
         ON ad.authorization_decision_id = $2::uuid
       JOIN comind.cm_foundry_authorization_request AS ar
         ON ar.authorization_request_id = ad.authorization_request_id
       JOIN comind.cm_foundry_capability AS c
         ON c.capability_id = ar.capability_id
       WHERE p.profile_id = $1::uuid
         AND ad.decision = 'approved'
         AND ar.status IN ('pending','approved')
         AND (ar.expires_at IS NULL OR ar.expires_at > clock_timestamp())
         AND (ad.effective_until IS NULL OR ad.effective_until > clock_timestamp())
         AND ar.requesting_actor_id = $3::uuid
         AND c.capability_code = $4::text
         AND ar.authority_level = 'C2'
         AND ar.environment = 'isolated'
         AND ar.target_kind = 'foundry_agent_profile'
         AND ar.target_ref = $1::text`,
      [input.profileId, input.authorizationDecisionId, input.requestedByActorId, `ve.lifecycle.${action}`]
    );
    if (result.rows.length !== 1) {
      const error = new Error('VE RuleBook scope could not be resolved from one approved exact lifecycle authorization') as Error & { code?: string };
      error.code = 've_rulebook_scope_unavailable';
      throw error;
    }

    const scope = result.rows[0];
    const trust = observeOperationalTrustBoundary({ reason: input.reason });
    const tenant = rulebookTenantScope(scope.org_id);
    const project = rulebookProjectScope(scope.project_id);
    try {
      await this.authority.require({
        source_tenant: tenant,
        target_tenant: tenant,
        source_project: project,
        target_project: project,
        action: `ve.lifecycle.${action}`,
        untrusted_input: trust.untrusted_input,
        asks_for_secrets: trust.asks_for_secrets,
        authority_escalation: trust.authority_escalation,
        side_effect: true,
        human_approved: true,
      });
    } catch (error) {
      wrapPreflightError(error, 've');
    }

    return this.delegate.transition(action, input);
  }
}

export class GovernedMdoOrchestrator implements MdoDelegate {
  private readonly authority: RulebookOperationalAuthority;
  private readonly delegate: MdoDelegate;

  constructor(
    private readonly queryFn: QueryFunction,
    authority?: RulebookOperationalAuthority,
    delegate?: MdoDelegate
  ) {
    this.authority = authority ?? createDatabaseRulebookOperationalAuthority(queryFn);
    this.delegate = delegate ?? new MdoOrchestrator(queryFn);
  }

  async enqueuePlan(input: MdoEnqueuePlanInput): Promise<MdoEnqueuePlanResult> {
    const result = await this.queryFn<MdoScopeRow>(
      `SELECT p.org_id::text
       FROM comind.cm_project AS p
       JOIN comind.cm_foundry_authorization_decision AS ad
         ON ad.authorization_decision_id = $4::uuid
       JOIN comind.cm_foundry_authorization_request AS ar
         ON ar.authorization_request_id = ad.authorization_request_id
       JOIN comind.cm_foundry_capability AS c
         ON c.capability_id = ar.capability_id
       WHERE p.project_id = $2::uuid
         AND p.status = 'active'
         AND p.org_id IS NOT NULL
         AND ad.decision = 'approved'
         AND ar.status IN ('pending','approved')
         AND (ar.expires_at IS NULL OR ar.expires_at > clock_timestamp())
         AND (ad.effective_until IS NULL OR ad.effective_until > clock_timestamp())
         AND ar.requesting_actor_id = $3::uuid
         AND ar.project_id = $2::uuid
         AND c.capability_code = 'mdo.plan.orchestrate'
         AND ar.authority_level = 'C1'
         AND ar.environment = 'isolated'
         AND ar.target_kind = 'module'
         AND ar.target_ref = $1::text`,
      [input.moduleId, input.projectId, input.requestedByActorId, input.authorizationDecisionId]
    );
    if (result.rows.length !== 1) {
      const error = new Error('MDO RuleBook scope could not be resolved from one approved exact orchestration authorization') as Error & { code?: string };
      error.code = 'mdo_rulebook_scope_unavailable';
      throw error;
    }

    const trust = observeOperationalTrustBoundary({ objective: input.objective });
    const tenant = rulebookTenantScope(result.rows[0].org_id);
    const project = rulebookProjectScope(input.projectId);
    try {
      await this.authority.require({
        source_tenant: tenant,
        target_tenant: tenant,
        source_project: project,
        target_project: project,
        action: 'mdo.plan.orchestrate',
        untrusted_input: trust.untrusted_input,
        asks_for_secrets: trust.asks_for_secrets,
        authority_escalation: trust.authority_escalation,
        side_effect: true,
        human_approved: true,
      });
    } catch (error) {
      wrapPreflightError(error, 'mdo');
    }

    return this.delegate.enqueuePlan(input);
  }

  claimWork(input: MdoClaimInput): Promise<MdoClaimResult | null> {
    return this.delegate.claimWork(input);
  }

  submitContribution(input: MdoContributionInput): Promise<MdoContributionResult> {
    return this.delegate.submitContribution(input);
  }
}
