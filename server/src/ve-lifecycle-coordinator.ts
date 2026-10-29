import { randomUUID } from 'node:crypto';
import { QueryFunction } from './db.js';

export type VeLifecycleState = 'draft' | 'active' | 'suspended' | 'retired';
export type VeLifecycleAction = 'activate' | 'suspend' | 'retire';
export type VeLifecycleStepStatus = 'succeeded' | 'failed' | 'skipped';

export class VeLifecycleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'VeLifecycleError';
  }
}

export interface VeExternalResource {
  readonly externalResourceId: string;
  readonly provider: string;
  readonly resourceType: string;
  readonly externalRef: string;
  readonly lifecycleStatus: string;
}

export interface VeResourceLifecycleAdapter {
  suspend(resource: VeExternalResource): Promise<void>;
  retire(resource: VeExternalResource): Promise<void>;
  resume?(resource: VeExternalResource): Promise<void>;
}

export interface VeLifecycleCoordinatorInput {
  readonly profileId: string;
  readonly requestedByActorId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface VeLifecycleStepResult {
  readonly step: string;
  readonly status: VeLifecycleStepStatus;
  readonly targetRef: string | null;
  readonly errorCode: string | null;
}

export interface VeLifecycleCoordinatorResult {
  readonly operationId: string;
  readonly profileId: string;
  readonly fromState: VeLifecycleState;
  readonly toState: VeLifecycleState;
  readonly status: 'succeeded' | 'partial';
  readonly steps: readonly VeLifecycleStepResult[];
}

interface ProfileRow {
  profile_id: string;
  actor_id: string;
  status: VeLifecycleState;
}

interface ResourceRow {
  external_resource_id: string;
  provider: string;
  resource_type: string;
  external_ref: string;
  lifecycle_status: string;
}

interface CountRow {
  count: number | string;
}

const TRANSITIONS: Readonly<Record<VeLifecycleAction, Readonly<Record<VeLifecycleState, VeLifecycleState | null>>>> = Object.freeze({
  activate: Object.freeze({ draft: 'active', active: null, suspended: 'active', retired: null }),
  suspend: Object.freeze({ draft: null, active: 'suspended', suspended: null, retired: null }),
  retire: Object.freeze({ draft: 'retired', active: 'retired', suspended: 'retired', retired: null }),
});

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new VeLifecycleError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function externalResource(row: ResourceRow): VeExternalResource {
  return Object.freeze({
    externalResourceId: row.external_resource_id,
    provider: row.provider,
    resourceType: row.resource_type,
    externalRef: row.external_ref,
    lifecycleStatus: row.lifecycle_status,
  });
}

export class VeLifecycleCoordinator {
  constructor(
    private readonly queryFn: QueryFunction,
    private readonly resourceAdapters: Readonly<Record<string, VeResourceLifecycleAdapter>> = {},
    private readonly now: () => Date = () => new Date()
  ) {}

  async transition(action: VeLifecycleAction, input: VeLifecycleCoordinatorInput): Promise<VeLifecycleCoordinatorResult> {
    requiredText(input.profileId, 'profileId');
    requiredText(input.requestedByActorId, 'requestedByActorId');
    requiredText(input.reason, 'reason');
    requiredText(input.idempotencyKey, 'idempotencyKey');

    const duplicate = await this.queryFn<CountRow>(
      `SELECT count(*)::int AS count
       FROM comind.cm_audit_log
       WHERE action = 've.lifecycle.completed'
         AND details->>'idempotency_key' = $1::text`,
      [input.idempotencyKey]
    );
    if (Number(duplicate.rows[0]?.count ?? 0) !== 0) {
      throw new VeLifecycleError('duplicate_idempotency', 'VE lifecycle idempotency key has already completed');
    }

    const profileResult = await this.queryFn<ProfileRow>(
      `SELECT profile_id::text, actor_id::text, status
       FROM comind.cm_foundry_agent_profile
       WHERE profile_id = $1::uuid`,
      [input.profileId]
    );
    if (profileResult.rows.length !== 1) {
      throw new VeLifecycleError('profile_not_unique', 'VE Foundry profile did not resolve exactly once');
    }
    const profile = profileResult.rows[0];
    const toState = TRANSITIONS[action][profile.status];
    if (toState === null) {
      throw new VeLifecycleError('transition_not_allowed', `Cannot ${action} VE from ${profile.status}`);
    }

    const operationId = randomUUID();
    const startedAt = this.now().toISOString();
    await this.audit(profile.actor_id, 've.lifecycle.started', input.profileId, {
      operation_id: operationId,
      idempotency_key: input.idempotencyKey,
      action,
      from_state: profile.status,
      to_state: toState,
      requested_by_actor_id: input.requestedByActorId,
      reason: input.reason,
      started_at: startedAt,
    });

    const steps: VeLifecycleStepResult[] = [];

    // Fail closed first. Suspending or retiring the profile immediately blocks new Foundry execution.
    if (action === 'suspend' || action === 'retire') {
      await this.setProfileState(input.profileId, profile.status, action === 'suspend' ? 'suspended' : 'retired');
      steps.push({ step: 'foundry_profile', status: 'succeeded', targetRef: input.profileId, errorCode: null });
    }

    if (action === 'suspend' || action === 'retire') {
      const revoked = await this.queryFn<{ grant_id: string }>(
        `UPDATE comind.cm_foundry_capability_grant
         SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE profile_id = $1::uuid
           AND revoked_at IS NULL
         RETURNING grant_id::text`,
        [input.profileId]
      );
      steps.push({
        step: 'capability_grants',
        status: 'succeeded',
        targetRef: String(revoked.rows.length),
        errorCode: null,
      });

      const cancelled = await this.queryFn<{ authorization_request_id: string }>(
        `UPDATE comind.cm_foundry_authorization_request
         SET status = 'cancelled'
         WHERE requesting_profile_id = $1::uuid
           AND status = 'pending'
         RETURNING authorization_request_id::text`,
        [input.profileId]
      );
      steps.push({
        step: 'pending_authorizations',
        status: 'succeeded',
        targetRef: String(cancelled.rows.length),
        errorCode: null,
      });
    }

    const resourcesResult = await this.queryFn<ResourceRow>(
      `SELECT external_resource_id::text, provider, resource_type, external_ref, lifecycle_status
       FROM comind.cm_actor_external_resource
       WHERE actor_id = $1::uuid
       ORDER BY created_at, external_resource_id`,
      [profile.actor_id]
    );

    if (action === 'activate') {
      for (const row of resourcesResult.rows) {
        const resource = externalResource(row);
        if (resource.lifecycleStatus !== 'suspended') continue;
        const adapter = this.resourceAdapters[resource.provider];
        if (!adapter?.resume) {
          steps.push({ step: 'external_resource_resume', status: 'skipped', targetRef: resource.externalResourceId, errorCode: 'adapter_unavailable' });
          continue;
        }
        try {
          await adapter.resume(resource);
          await this.updateResourceState(resource.externalResourceId, 'active');
          steps.push({ step: 'external_resource_resume', status: 'succeeded', targetRef: resource.externalResourceId, errorCode: null });
        } catch {
          steps.push({ step: 'external_resource_resume', status: 'failed', targetRef: resource.externalResourceId, errorCode: 'provider_failure' });
        }
      }

      const resourceFailure = steps.some((step) => step.status === 'failed');
      if (resourceFailure) {
        await this.audit(profile.actor_id, 've.lifecycle.partial', input.profileId, {
          operation_id: operationId,
          idempotency_key: input.idempotencyKey,
          action,
          from_state: profile.status,
          intended_state: toState,
          steps,
        });
        return Object.freeze({ operationId, profileId: input.profileId, fromState: profile.status, toState, status: 'partial', steps: Object.freeze(steps) });
      }

      await this.setProfileState(input.profileId, profile.status, 'active');
      steps.push({ step: 'foundry_profile', status: 'succeeded', targetRef: input.profileId, errorCode: null });
    } else {
      const providerAction = action === 'suspend' ? 'suspend' : 'retire';
      for (const row of resourcesResult.rows) {
        const resource = externalResource(row);
        if (action === 'suspend' && resource.lifecycleStatus !== 'active') continue;
        if (action === 'retire' && ['retired', 'revoked'].includes(resource.lifecycleStatus)) continue;
        const adapter = this.resourceAdapters[resource.provider];
        if (!adapter) {
          steps.push({ step: `external_resource_${providerAction}`, status: 'skipped', targetRef: resource.externalResourceId, errorCode: 'adapter_unavailable' });
          continue;
        }
        try {
          await adapter[providerAction](resource);
          await this.updateResourceState(resource.externalResourceId, action === 'suspend' ? 'suspended' : 'retired');
          steps.push({ step: `external_resource_${providerAction}`, status: 'succeeded', targetRef: resource.externalResourceId, errorCode: null });
        } catch {
          steps.push({ step: `external_resource_${providerAction}`, status: 'failed', targetRef: resource.externalResourceId, errorCode: 'provider_failure' });
        }
      }
    }

    const partial = steps.some((step) => step.status === 'failed' || step.status === 'skipped');
    const completionAction = partial ? 've.lifecycle.partial' : 've.lifecycle.completed';
    await this.audit(profile.actor_id, completionAction, input.profileId, {
      operation_id: operationId,
      idempotency_key: input.idempotencyKey,
      action,
      from_state: profile.status,
      to_state: toState,
      steps,
      completed_at: this.now().toISOString(),
    });

    return Object.freeze({
      operationId,
      profileId: input.profileId,
      fromState: profile.status,
      toState,
      status: partial ? 'partial' : 'succeeded',
      steps: Object.freeze(steps),
    });
  }

  private async setProfileState(profileId: string, expectedState: VeLifecycleState, state: VeLifecycleState): Promise<void> {
    const result = await this.queryFn<{ profile_id: string }>(
      `UPDATE comind.cm_foundry_agent_profile
       SET status = $3::text,
           activated_at = CASE WHEN $3::text = 'active' THEN COALESCE(activated_at, clock_timestamp()) ELSE activated_at END,
           retired_at = CASE WHEN $3::text = 'retired' THEN COALESCE(retired_at, clock_timestamp()) ELSE retired_at END
       WHERE profile_id = $1::uuid
         AND status = $2::text
       RETURNING profile_id::text`,
      [profileId, expectedState, state]
    );
    if (result.rows.length !== 1) {
      throw new VeLifecycleError('concurrent_transition', 'VE profile state changed during lifecycle transition');
    }
  }

  private async updateResourceState(externalResourceId: string, lifecycleStatus: string): Promise<void> {
    await this.queryFn(
      `UPDATE comind.cm_actor_external_resource
       SET lifecycle_status = $2::text, updated_at = clock_timestamp()
       WHERE external_resource_id = $1::uuid`,
      [externalResourceId, lifecycleStatus]
    );
  }

  private async audit(actorId: string, action: string, profileId: string, details: Record<string, unknown>): Promise<void> {
    await this.queryFn(
      `INSERT INTO comind.cm_audit_log (actor_id, action, target_table, target_id, details)
       VALUES ($1::uuid, $2::text, 'cm_foundry_agent_profile', $3::uuid, $4::jsonb)`,
      [actorId, action, profileId, JSON.stringify(details)]
    );
  }
}
