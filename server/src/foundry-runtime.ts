import { createHash } from 'node:crypto';
import { QueryFunction } from './db.js';

export type FoundryAuthorityLevel = 'C0' | 'C1' | 'C2' | 'C3' | 'C4';
export type FoundryEnvironment = 'isolated' | 'staging' | 'production';
export type FoundryTerminalStatus = 'succeeded' | 'failed' | 'cancelled' | 'blocked';
export type FoundryDeliberationEventType =
  | 'proposal'
  | 'objection'
  | 'evidence'
  | 'decision_note'
  | 'decision'
  | 'dissent'
  | 'deferred'
  | 'risk'
  | 'verification_note';
export type FoundryDeliberationOutcome =
  | 'accepted'
  | 'accepted_with_dissent'
  | 'rejected'
  | 'deferred'
  | 'blocked';

const AUTHORITY_RANK: Readonly<Record<FoundryAuthorityLevel, number>> = Object.freeze({
  C0: 0,
  C1: 1,
  C2: 2,
  C3: 3,
  C4: 4,
});

const ERROR_CODE = /^[a-z][a-z0-9._:-]{0,127}$/;

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FoundryRuntimeError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function nullableText(value: string | null | undefined): string | null {
  return value == null ? null : requiredText(value, 'optional text');
}

function sameNullable(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function parseTime(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new FoundryRuntimeError('malformed_authority', 'Authority record contains an invalid timestamp');
  }
  return parsed;
}

function isExpired(value: string | null, nowMs: number): boolean {
  const parsed = parseTime(value);
  return parsed !== null && parsed <= nowMs;
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new FoundryRuntimeError('invalid_request', 'JSON numbers must be finite');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new FoundryRuntimeError('invalid_request', 'Only plain JSON objects are allowed');
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(objectValue).sort()) {
      normalized[key] = normalizeJson(objectValue[key]);
    }
    return normalized;
  }
  throw new FoundryRuntimeError('invalid_request', 'Only JSON-compatible input is allowed');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function sha256Fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function authorityAllows(ceiling: FoundryAuthorityLevel, requested: FoundryAuthorityLevel): boolean {
  return AUTHORITY_RANK[requested] <= AUTHORITY_RANK[ceiling];
}

export function grantScopeAllows(scope: unknown, targetRef: string | null): boolean {
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) {
    return false;
  }
  const record = scope as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== 'target_refs')) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'target_refs')) {
    return true;
  }
  const targetRefs = record.target_refs;
  if (!Array.isArray(targetRefs) || targetRefs.length === 0 || targetRef === null) {
    return false;
  }
  return targetRefs.every((item) => typeof item === 'string' && item.length > 0)
    && targetRefs.includes(targetRef);
}

export class FoundryRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly executionContextId: string | null = null,
    public readonly adapterOperationId: string | null = null
  ) {
    super(message);
    this.name = 'FoundryRuntimeError';
  }
}

export interface FoundryExecutionRequest {
  readonly profileId: string;
  readonly capabilityCode: string;
  readonly authorizationDecisionId: string;
  readonly authorityLevel: FoundryAuthorityLevel;
  readonly environment: FoundryEnvironment;
  readonly targetKind: string;
  readonly targetRef?: string | null;
  readonly projectId?: string | null;
  readonly taskId?: string | null;
  readonly agentRunId?: string | null;
  readonly conversationId?: string | null;
  readonly budgetBindingId?: string | null;
  readonly idempotencyKey: string;
  readonly input?: Readonly<Record<string, unknown>>;
}

export interface FoundryAdapterRequest {
  readonly executionContextId: string;
  readonly adapterOperationId: string;
  readonly capabilityCode: string;
  readonly action: string;
  readonly authorityLevel: FoundryAuthorityLevel;
  readonly targetKind: string;
  readonly targetRef: string | null;
  readonly requestFingerprint: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface FoundryAdapterResult {
  readonly status: FoundryTerminalStatus;
  readonly resultRef?: string | null;
  readonly errorCode?: string | null;
  readonly summary: string;
}

export type FoundryAdapter = (request: FoundryAdapterRequest) => Promise<FoundryAdapterResult>;

export interface FoundryExecutionResult {
  readonly executionContextId: string;
  readonly recoveryCheckpointId: string;
  readonly adapterOperationId: string;
  readonly adapterOperationResultId: string;
  readonly executionOutcomeId: string;
  readonly requestFingerprint: string;
  readonly terminalStatus: FoundryTerminalStatus;
  readonly resultRef: string | null;
  readonly errorCode: string | null;
}

export class FoundryAdapterRegistry {
  private readonly adapters = new Map<string, FoundryAdapter>();

  register(adapterCode: string, adapter: FoundryAdapter): void {
    requiredText(adapterCode, 'adapterCode');
    if (this.adapters.has(adapterCode)) {
      throw new FoundryRuntimeError('duplicate_adapter', `Adapter ${adapterCode} is already registered`);
    }
    this.adapters.set(adapterCode, adapter);
  }

  resolve(adapterCode: string): FoundryAdapter {
    const adapter = this.adapters.get(adapterCode);
    if (!adapter) {
      throw new FoundryRuntimeError('unknown_adapter', `Adapter ${adapterCode} is not registered`);
    }
    return adapter;
  }
}

interface ProfileCapabilityRow {
  profile_id: string;
  agent_id: string;
  actor_id: string;
  org_id: string;
  profile_status: string;
  profile_authority_floor: FoundryAuthorityLevel;
  profile_authority_ceiling: FoundryAuthorityLevel;
  capability_id: string;
  capability_action: string;
  capability_target_kind: string;
  capability_max_authority: FoundryAuthorityLevel;
  cost_bearing: boolean;
  adapter: string;
}

interface GrantRow {
  grant_id: string;
  project_id: string | null;
  authority_ceiling: FoundryAuthorityLevel;
  scope: unknown;
  expires_at: string | null;
  revoked_at: string | null;
}

interface AuthorizationRow {
  authorization_request_id: string;
  requesting_profile_id: string | null;
  requesting_actor_id: string;
  capability_id: string;
  project_id: string | null;
  task_id: string | null;
  authority_level: FoundryAuthorityLevel;
  environment: FoundryEnvironment;
  target_kind: string;
  target_ref: string | null;
  request_status: string;
  request_expires_at: string | null;
  decision: string;
  effective_until: string | null;
}

interface BudgetBindingRow {
  binding_id: string;
  project_id: string | null;
  agent_id: string | null;
  agent_run_id: string | null;
}

interface IdRow {
  id: string;
}

interface RecoveryRow {
  recovery_checkpoint_id: string;
  profile_id: string | null;
  project_id: string | null;
  task_id: string | null;
  capability_code: string | null;
  environment: FoundryEnvironment;
  prior_idempotency_key: string;
  terminal_status: FoundryTerminalStatus | null;
}

function validateAdapterResult(result: FoundryAdapterResult): Required<Pick<FoundryAdapterResult, 'status' | 'summary'>> & {
  resultRef: string | null;
  errorCode: string | null;
} {
  const allowedStatuses: readonly FoundryTerminalStatus[] = ['succeeded', 'failed', 'cancelled', 'blocked'];
  if (!allowedStatuses.includes(result.status)) {
    throw new FoundryRuntimeError('malformed_adapter_result', 'Adapter returned an unsupported terminal status');
  }
  const summary = requiredText(result.summary, 'adapter result summary');
  if (summary.length > 2048) {
    throw new FoundryRuntimeError('malformed_adapter_result', 'Adapter result summary exceeds 2048 characters');
  }
  const resultRef = result.resultRef ?? null;
  if (resultRef !== null && (resultRef.length === 0 || resultRef.length > 2048)) {
    throw new FoundryRuntimeError('malformed_adapter_result', 'Adapter result reference is invalid');
  }
  const errorCode = result.errorCode ?? null;
  if (errorCode !== null && !ERROR_CODE.test(errorCode)) {
    throw new FoundryRuntimeError('malformed_adapter_result', 'Adapter result error code is invalid');
  }
  return { status: result.status, summary, resultRef, errorCode };
}

function assertExecutionRequest(request: FoundryExecutionRequest): void {
  requiredText(request.profileId, 'profileId');
  requiredText(request.capabilityCode, 'capabilityCode');
  requiredText(request.authorizationDecisionId, 'authorizationDecisionId');
  requiredText(request.targetKind, 'targetKind');
  requiredText(request.idempotencyKey, 'idempotencyKey');
  if (!Object.prototype.hasOwnProperty.call(AUTHORITY_RANK, request.authorityLevel)) {
    throw new FoundryRuntimeError('invalid_request', 'Unsupported authority level');
  }
  if (request.environment !== 'isolated') {
    throw new FoundryRuntimeError('environment_blocked', 'Issue #73 permits isolated Foundry execution only');
  }
  if (request.authorityLevel === 'C3' || request.authorityLevel === 'C4') {
    throw new FoundryRuntimeError('authority_blocked', 'C3 and C4 Foundry execution are blocked in Issue #73');
  }
  if (request.input !== undefined) {
    normalizeJson(request.input);
  }
}

export class FoundryRuntimeOrchestrator {
  constructor(
    private readonly queryFn: QueryFunction,
    private readonly registry: FoundryAdapterRegistry,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(request: FoundryExecutionRequest): Promise<FoundryExecutionResult> {
    assertExecutionRequest(request);
    const targetRef = nullableText(request.targetRef);
    const input = Object.freeze({ ...(request.input ?? {}) });
    const nowMs = this.now().getTime();

    const profileCapability = await this.queryFn<ProfileCapabilityRow>(
      `SELECT
         p.profile_id::text,
         p.agent_id::text,
         p.actor_id::text,
         p.org_id::text,
         p.status AS profile_status,
         p.authority_floor AS profile_authority_floor,
         p.authority_ceiling AS profile_authority_ceiling,
         c.capability_id::text,
         c.action AS capability_action,
         c.target_kind AS capability_target_kind,
         c.max_authority AS capability_max_authority,
         c.cost_bearing,
         c.adapter
       FROM comind.cm_foundry_agent_profile AS p
       CROSS JOIN comind.cm_foundry_capability AS c
       WHERE p.profile_id = $1::uuid
         AND c.capability_code = $2::text`,
      [request.profileId, request.capabilityCode]
    );
    if (profileCapability.rows.length !== 1) {
      throw new FoundryRuntimeError('profile_or_capability_missing', 'Foundry profile or capability could not be resolved uniquely');
    }
    const authority = profileCapability.rows[0];
    if (authority.profile_status !== 'active') {
      throw new FoundryRuntimeError('profile_inactive', 'Foundry profile is not active');
    }
    if (!authorityAllows(authority.profile_authority_ceiling, request.authorityLevel)) {
      throw new FoundryRuntimeError('profile_authority_exceeded', 'Requested authority exceeds the Foundry profile ceiling');
    }
    if (!authorityAllows(authority.capability_max_authority, request.authorityLevel)) {
      throw new FoundryRuntimeError('capability_authority_exceeded', 'Requested authority exceeds the capability ceiling');
    }
    if (authority.capability_target_kind !== request.targetKind) {
      throw new FoundryRuntimeError('target_kind_mismatch', 'Requested target kind does not match the capability contract');
    }
    const adapter = this.registry.resolve(authority.adapter);

    const grants = await this.queryFn<GrantRow>(
      `SELECT
         grant_id::text,
         project_id::text,
         authority_ceiling,
         scope,
         expires_at::text,
         revoked_at::text
       FROM comind.cm_foundry_capability_grant
       WHERE profile_id = $1::uuid
         AND capability_id = $2::uuid
         AND org_id = $3::uuid
         AND environment = $4::text
         AND (
           ($5::uuid IS NULL AND project_id IS NULL)
           OR ($5::uuid IS NOT NULL AND (project_id = $5::uuid OR project_id IS NULL))
         )
       ORDER BY (project_id IS NOT NULL) DESC, granted_at DESC`,
      [request.profileId, authority.capability_id, authority.org_id, request.environment, request.projectId ?? null]
    );

    const grant = grants.rows.find((candidate) => {
      if (candidate.revoked_at !== null || isExpired(candidate.expires_at, nowMs)) {
        return false;
      }
      if (!authorityAllows(candidate.authority_ceiling, request.authorityLevel)) {
        return false;
      }
      return grantScopeAllows(candidate.scope, targetRef);
    });
    if (!grant) {
      throw new FoundryRuntimeError('grant_not_valid', 'No active scoped capability grant authorizes this execution');
    }

    const authorizationResult = await this.queryFn<AuthorizationRow>(
      `SELECT
         ar.authorization_request_id::text,
         ar.requesting_profile_id::text,
         ar.requesting_actor_id::text,
         ar.capability_id::text,
         ar.project_id::text,
         ar.task_id::text,
         ar.authority_level,
         ar.environment,
         ar.target_kind,
         ar.target_ref,
         ar.status AS request_status,
         ar.expires_at::text AS request_expires_at,
         ad.decision,
         ad.effective_until::text
       FROM comind.cm_foundry_authorization_decision AS ad
       JOIN comind.cm_foundry_authorization_request AS ar
         ON ar.authorization_request_id = ad.authorization_request_id
       WHERE ad.authorization_decision_id = $1::uuid`,
      [request.authorizationDecisionId]
    );
    if (authorizationResult.rows.length !== 1) {
      throw new FoundryRuntimeError('authorization_missing', 'Authorization decision could not be resolved uniquely');
    }
    const authorization = authorizationResult.rows[0];
    if (authorization.decision !== 'approved') {
      throw new FoundryRuntimeError('authorization_denied', 'Authorization decision does not approve execution');
    }
    if (!['pending', 'approved'].includes(authorization.request_status)) {
      throw new FoundryRuntimeError('authorization_inactive', 'Authorization request is not active');
    }
    if (isExpired(authorization.request_expires_at, nowMs) || isExpired(authorization.effective_until, nowMs)) {
      throw new FoundryRuntimeError('authorization_expired', 'Authorization is expired');
    }
    if (
      authorization.requesting_profile_id !== request.profileId
      || authorization.requesting_actor_id !== authority.actor_id
      || authorization.capability_id !== authority.capability_id
      || !sameNullable(authorization.project_id, request.projectId)
      || !sameNullable(authorization.task_id, request.taskId)
      || authorization.authority_level !== request.authorityLevel
      || authorization.environment !== request.environment
      || authorization.target_kind !== request.targetKind
      || !sameNullable(authorization.target_ref, targetRef)
    ) {
      throw new FoundryRuntimeError('authorization_scope_mismatch', 'Authorization does not match the requested execution envelope');
    }

    const budgetBindingId = request.budgetBindingId ?? null;
    if (authority.cost_bearing && budgetBindingId === null) {
      throw new FoundryRuntimeError('budget_binding_required', 'Cost-bearing Foundry execution requires a budget authority binding');
    }
    if (budgetBindingId !== null) {
      const bindingResult = await this.queryFn<BudgetBindingRow>(
        `SELECT
           binding_id::text,
           project_id::text,
           agent_id::text,
           agent_run_id::text
         FROM comind.cm_budget_authority_binding
         WHERE binding_id = $1::uuid`,
        [budgetBindingId]
      );
      if (bindingResult.rows.length !== 1) {
        throw new FoundryRuntimeError('budget_binding_missing', 'Budget authority binding could not be resolved uniquely');
      }
      const binding = bindingResult.rows[0];
      if (
        (binding.project_id !== null && !sameNullable(binding.project_id, request.projectId))
        || (binding.agent_id !== null && binding.agent_id !== authority.agent_id)
        || (binding.agent_run_id !== null && !sameNullable(binding.agent_run_id, request.agentRunId))
      ) {
        throw new FoundryRuntimeError('budget_binding_scope_mismatch', 'Budget authority binding conflicts with Foundry execution provenance');
      }
    }

    const duplicate = await this.queryFn<IdRow>(
      `SELECT execution_context_id::text AS id
       FROM comind.cm_foundry_execution_context
       WHERE idempotency_key = $1::text`,
      [request.idempotencyKey]
    );
    if (duplicate.rows.length !== 0) {
      throw new FoundryRuntimeError('duplicate_idempotency', 'Foundry execution idempotency key has already been used');
    }

    const requestFingerprint = sha256Fingerprint({
      profile_id: request.profileId,
      capability_code: request.capabilityCode,
      authorization_decision_id: request.authorizationDecisionId,
      authority_level: request.authorityLevel,
      environment: request.environment,
      target_kind: request.targetKind,
      target_ref: targetRef,
      project_id: request.projectId ?? null,
      task_id: request.taskId ?? null,
      agent_run_id: request.agentRunId ?? null,
      conversation_id: request.conversationId ?? null,
      budget_binding_id: budgetBindingId,
      idempotency_key: request.idempotencyKey,
      input,
    });

    const contextResult = await this.queryFn<IdRow>(
      `INSERT INTO comind.cm_foundry_execution_context (
         profile_id, agent_run_id, project_id, task_id, conversation_id,
         capability_id, authorization_decision_id, budget_binding_id,
         environment, execution_kind, idempotency_key, context
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         $6::uuid, $7::uuid, $8::uuid,
         $9::text, 'adapter_operation', $10::text, $11::jsonb
       )
       RETURNING execution_context_id::text AS id`,
      [
        request.profileId,
        request.agentRunId ?? null,
        request.projectId ?? null,
        request.taskId ?? null,
        request.conversationId ?? null,
        authority.capability_id,
        request.authorizationDecisionId,
        budgetBindingId,
        request.environment,
        request.idempotencyKey,
        JSON.stringify({
          capability_code: request.capabilityCode,
          authority_level: request.authorityLevel,
          target_kind: request.targetKind,
          target_ref: targetRef,
          request_fingerprint: requestFingerprint,
        }),
      ]
    );
    if (contextResult.rows.length !== 1) {
      throw new FoundryRuntimeError('context_creation_failed', 'Foundry execution context was not created uniquely');
    }
    const executionContextId = contextResult.rows[0].id;

    const checkpointResult = await this.queryFn<IdRow>(
      `INSERT INTO comind.cm_foundry_recovery_checkpoint (
         execution_context_id, project_id, checkpoint_kind, source_ref,
         durable_summary, evidence_refs, created_by_profile_id
       ) VALUES (
         $1::uuid, $2::uuid, 'provenance_snapshot', $3::text,
         $4::text, '[]'::jsonb, $5::uuid
       )
       RETURNING recovery_checkpoint_id::text AS id`,
      [
        executionContextId,
        request.projectId ?? null,
        `foundry-runtime:${requestFingerprint}`,
        'Pre-dispatch authority, scope, idempotency, adapter, and budget checks passed.',
        request.profileId,
      ]
    );
    if (checkpointResult.rows.length !== 1) {
      throw new FoundryRuntimeError('checkpoint_creation_failed', 'Foundry recovery checkpoint was not created uniquely', executionContextId);
    }
    const recoveryCheckpointId = checkpointResult.rows[0].id;

    const adapterIdempotency = `adapter:${requestFingerprint}`;
    const operationResult = await this.queryFn<IdRow>(
      `INSERT INTO comind.cm_foundry_adapter_operation (
         execution_context_id, capability_id, adapter, operation_name,
         target_kind, target_ref, idempotency_key, request_fingerprint, status
       ) VALUES (
         $1::uuid, $2::uuid, $3::text, $4::text,
         $5::text, $6::text, $7::text, $8::text, 'approved'
       )
       RETURNING adapter_operation_id::text AS id`,
      [
        executionContextId,
        authority.capability_id,
        authority.adapter,
        authority.capability_action,
        request.targetKind,
        targetRef,
        adapterIdempotency,
        requestFingerprint,
      ]
    );
    if (operationResult.rows.length !== 1) {
      throw new FoundryRuntimeError('adapter_operation_creation_failed', 'Foundry adapter operation was not created uniquely', executionContextId);
    }
    const adapterOperationId = operationResult.rows[0].id;

    let governedResult: ReturnType<typeof validateAdapterResult>;
    try {
      governedResult = validateAdapterResult(await adapter(Object.freeze({
        executionContextId,
        adapterOperationId,
        capabilityCode: request.capabilityCode,
        action: authority.capability_action,
        authorityLevel: request.authorityLevel,
        targetKind: request.targetKind,
        targetRef,
        requestFingerprint,
        input,
      })));
    } catch (error) {
      if (error instanceof FoundryRuntimeError && error.code === 'malformed_adapter_result') {
        governedResult = {
          status: 'failed',
          resultRef: null,
          errorCode: 'malformed_adapter_result',
          summary: 'Adapter returned a malformed governed result.',
        };
      } else {
        governedResult = {
          status: 'failed',
          resultRef: null,
          errorCode: 'adapter_exception',
          summary: 'Adapter execution raised an exception before returning a governed result.',
        };
      }
    }

    const persisted = await this.persistTerminalResult(
      executionContextId,
      adapterOperationId,
      governedResult
    );

    if (governedResult.errorCode === 'adapter_exception' || governedResult.errorCode === 'malformed_adapter_result') {
      throw new FoundryRuntimeError(
        governedResult.errorCode,
        governedResult.summary,
        executionContextId,
        adapterOperationId
      );
    }

    return Object.freeze({
      executionContextId,
      recoveryCheckpointId,
      adapterOperationId,
      adapterOperationResultId: persisted.adapterOperationResultId,
      executionOutcomeId: persisted.executionOutcomeId,
      requestFingerprint,
      terminalStatus: governedResult.status,
      resultRef: governedResult.resultRef,
      errorCode: governedResult.errorCode,
    });
  }

  async resumeFromCheckpoint(
    recoveryCheckpointId: string,
    request: FoundryExecutionRequest
  ): Promise<FoundryExecutionResult> {
    requiredText(recoveryCheckpointId, 'recoveryCheckpointId');
    assertExecutionRequest(request);

    const checkpoint = await this.queryFn<RecoveryRow>(
      `SELECT
         cp.recovery_checkpoint_id::text,
         ec.profile_id::text,
         ec.project_id::text,
         ec.task_id::text,
         c.capability_code,
         ec.environment,
         ec.idempotency_key AS prior_idempotency_key,
         eo.terminal_status
       FROM comind.cm_foundry_recovery_checkpoint AS cp
       JOIN comind.cm_foundry_execution_context AS ec
         ON ec.execution_context_id = cp.execution_context_id
       LEFT JOIN comind.cm_foundry_capability AS c
         ON c.capability_id = ec.capability_id
       LEFT JOIN comind.cm_foundry_execution_outcome AS eo
         ON eo.execution_context_id = ec.execution_context_id
       WHERE cp.recovery_checkpoint_id = $1::uuid`,
      [recoveryCheckpointId]
    );
    if (checkpoint.rows.length !== 1) {
      throw new FoundryRuntimeError('checkpoint_missing', 'Recovery checkpoint could not be resolved uniquely');
    }
    const prior = checkpoint.rows[0];
    if (
      prior.profile_id !== request.profileId
      || prior.capability_code !== request.capabilityCode
      || !sameNullable(prior.project_id, request.projectId)
      || !sameNullable(prior.task_id, request.taskId)
      || prior.environment !== request.environment
    ) {
      throw new FoundryRuntimeError('checkpoint_scope_mismatch', 'Recovery checkpoint does not match the requested execution scope');
    }
    if (prior.terminal_status === 'succeeded' || prior.terminal_status === 'cancelled') {
      throw new FoundryRuntimeError('checkpoint_not_resumable', 'Completed execution checkpoint is not resumable');
    }
    if (prior.prior_idempotency_key === request.idempotencyKey) {
      throw new FoundryRuntimeError('duplicate_idempotency', 'Recovery requires a fresh execution idempotency key');
    }

    return this.execute(request);
  }

  private async persistTerminalResult(
    executionContextId: string,
    adapterOperationId: string,
    result: ReturnType<typeof validateAdapterResult>
  ): Promise<{ adapterOperationResultId: string; executionOutcomeId: string }> {
    const resultFingerprint = sha256Fingerprint({
      adapter_operation_id: adapterOperationId,
      terminal_status: result.status,
      result_ref: result.resultRef,
      error_code: result.errorCode,
      summary: result.summary,
    });

    const operationResult = await this.queryFn<IdRow>(
      `INSERT INTO comind.cm_foundry_adapter_operation_result (
         adapter_operation_id, terminal_status, result_ref,
         result_fingerprint, error_code, summary
       ) VALUES (
         $1::uuid, $2::text, $3::text,
         $4::text, $5::text, $6::text
       )
       RETURNING adapter_operation_result_id::text AS id`,
      [
        adapterOperationId,
        result.status,
        result.resultRef,
        resultFingerprint,
        result.errorCode,
        result.summary,
      ]
    );
    if (operationResult.rows.length !== 1) {
      throw new FoundryRuntimeError('adapter_result_persistence_failed', 'Adapter result was not persisted uniquely', executionContextId, adapterOperationId);
    }
    const adapterOperationResultId = operationResult.rows[0].id;

    const executionOutcome = await this.queryFn<IdRow>(
      `INSERT INTO comind.cm_foundry_execution_outcome (
         execution_context_id, adapter_operation_result_id,
         terminal_status, error_code, summary
       ) VALUES (
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text
       )
       RETURNING execution_outcome_id::text AS id`,
      [
        executionContextId,
        adapterOperationResultId,
        result.status,
        result.errorCode,
        result.summary,
      ]
    );
    if (executionOutcome.rows.length !== 1) {
      throw new FoundryRuntimeError('execution_outcome_persistence_failed', 'Execution outcome was not persisted uniquely', executionContextId, adapterOperationId);
    }

    return {
      adapterOperationResultId,
      executionOutcomeId: executionOutcome.rows[0].id,
    };
  }
}

export interface FoundryDeliberationEventInput {
  readonly deliberationId: string;
  readonly participantId: string;
  readonly executionContextId?: string | null;
  readonly eventType: FoundryDeliberationEventType;
  readonly claim: string;
  readonly evidenceRefs?: readonly unknown[];
  readonly roundNumber: 1 | 2;
  readonly arbitrationPass: 0 | 1;
  readonly replyToEventId?: string | null;
}

export function validateDeliberationEventInput(input: FoundryDeliberationEventInput): void {
  requiredText(input.deliberationId, 'deliberationId');
  requiredText(input.participantId, 'participantId');
  requiredText(input.claim, 'claim');
  if (input.roundNumber !== 1 && input.roundNumber !== 2) {
    throw new FoundryRuntimeError('deliberation_round_exceeded', 'Deliberation permits at most two review rounds');
  }
  if (input.arbitrationPass !== 0 && input.arbitrationPass !== 1) {
    throw new FoundryRuntimeError('deliberation_arbitration_exceeded', 'Deliberation permits at most one arbitration pass');
  }
  normalizeJson(input.evidenceRefs ?? []);
}

interface ParticipantStateRow {
  participant_id: string;
  outcome_id: string | null;
}

interface ParentEventRow {
  round_number: number;
}

export async function recordFoundryDeliberationEvent(
  queryFn: QueryFunction,
  input: FoundryDeliberationEventInput
): Promise<string> {
  validateDeliberationEventInput(input);
  const state = await queryFn<ParticipantStateRow>(
    `SELECT
       p.participant_id::text,
       o.outcome_id::text
     FROM comind.cm_foundry_deliberation_participant AS p
     JOIN comind.cm_foundry_deliberation AS d
       ON d.deliberation_id = p.deliberation_id
     LEFT JOIN comind.cm_foundry_deliberation_outcome AS o
       ON o.deliberation_id = d.deliberation_id
     WHERE p.participant_id = $1::uuid
       AND p.deliberation_id = $2::uuid`,
    [input.participantId, input.deliberationId]
  );
  if (state.rows.length !== 1) {
    throw new FoundryRuntimeError('deliberation_participant_missing', 'Deliberation participant could not be resolved uniquely');
  }
  if (state.rows[0].outcome_id !== null) {
    throw new FoundryRuntimeError('deliberation_terminal', 'Deliberation already has a terminal outcome');
  }

  const replyToEventId = input.replyToEventId ?? null;
  if (replyToEventId !== null) {
    const parent = await queryFn<ParentEventRow>(
      `SELECT round_number
       FROM comind.cm_foundry_deliberation_event
       WHERE deliberation_event_id = $1::uuid
         AND deliberation_id = $2::uuid`,
      [replyToEventId, input.deliberationId]
    );
    if (parent.rows.length !== 1 || parent.rows[0].round_number > input.roundNumber) {
      throw new FoundryRuntimeError('deliberation_reply_invalid', 'Reply event does not resolve within the same bounded deliberation');
    }
  }

  const result = await queryFn<IdRow>(
    `INSERT INTO comind.cm_foundry_deliberation_event (
       deliberation_id, participant_id, execution_context_id,
       event_type, claim, evidence_refs,
       round_number, arbitration_pass, reply_to_event_id
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::text, $5::text, $6::jsonb,
       $7::smallint, $8::smallint, $9::uuid
     )
     RETURNING deliberation_event_id::text AS id`,
    [
      input.deliberationId,
      input.participantId,
      input.executionContextId ?? null,
      input.eventType,
      input.claim,
      JSON.stringify(input.evidenceRefs ?? []),
      input.roundNumber,
      input.arbitrationPass,
      replyToEventId,
    ]
  );
  if (result.rows.length !== 1) {
    throw new FoundryRuntimeError('deliberation_event_creation_failed', 'Deliberation event was not created uniquely');
  }
  return result.rows[0].id;
}

export interface CompleteFoundryDeliberationInput {
  readonly deliberationId: string;
  readonly executionContextId?: string | null;
  readonly outcome: FoundryDeliberationOutcome;
  readonly summary: string;
  readonly requiredNextDecision?: string | null;
}

interface DeliberationParticipantRow {
  participant_id: string;
  role: string;
}

interface DeliberationEventRow {
  participant_id: string | null;
  event_type: FoundryDeliberationEventType;
}

export async function completeFoundryDeliberation(
  queryFn: QueryFunction,
  input: CompleteFoundryDeliberationInput
): Promise<string> {
  requiredText(input.deliberationId, 'deliberationId');
  const summary = requiredText(input.summary, 'deliberation summary');
  const requiredNextDecision = input.requiredNextDecision ?? null;
  if (input.outcome === 'deferred' && (requiredNextDecision === null || requiredNextDecision.trim().length === 0)) {
    throw new FoundryRuntimeError('deferred_requires_next_decision', 'Deferred deliberation requires an explicit next decision or evidence trigger');
  }

  const participants = await queryFn<DeliberationParticipantRow>(
    `SELECT participant_id::text, role
     FROM comind.cm_foundry_deliberation_participant
     WHERE deliberation_id = $1::uuid`,
    [input.deliberationId]
  );
  if (participants.rows.length === 0) {
    throw new FoundryRuntimeError('deliberation_participants_missing', 'Deliberation cannot close without participants');
  }

  const events = await queryFn<DeliberationEventRow>(
    `SELECT participant_id::text, event_type
     FROM comind.cm_foundry_deliberation_event
     WHERE deliberation_id = $1::uuid`,
    [input.deliberationId]
  );
  const activeParticipants = participants.rows.filter((participant) => !['observer', 'scribe'].includes(participant.role));
  for (const participant of activeParticipants) {
    if (!events.rows.some((event) => event.participant_id === participant.participant_id)) {
      throw new FoundryRuntimeError('deliberation_silence', 'Silence is not agreement; every active participant must contribute before closure');
    }
  }
  if (!events.rows.some((event) => event.event_type === 'decision' || event.event_type === 'decision_note')) {
    throw new FoundryRuntimeError('deliberation_decision_missing', 'Deliberation requires an explicit decision event before closure');
  }
  const hasDissent = events.rows.some((event) => event.event_type === 'dissent');
  if (input.outcome === 'accepted' && hasDissent) {
    throw new FoundryRuntimeError('dissent_requires_qualified_outcome', 'Accepted deliberation with dissent must use accepted_with_dissent');
  }
  if (input.outcome === 'accepted_with_dissent' && !hasDissent) {
    throw new FoundryRuntimeError('qualified_outcome_requires_dissent', 'accepted_with_dissent requires an explicit dissent event');
  }

  const outcomeResult = await queryFn<IdRow>(
    `INSERT INTO comind.cm_foundry_deliberation_outcome (
       deliberation_id, execution_context_id, outcome,
       summary, required_next_decision
     ) VALUES (
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text
     )
     RETURNING outcome_id::text AS id`,
    [
      input.deliberationId,
      input.executionContextId ?? null,
      input.outcome,
      summary,
      requiredNextDecision,
    ]
  );
  if (outcomeResult.rows.length !== 1) {
    throw new FoundryRuntimeError('deliberation_outcome_creation_failed', 'Deliberation outcome was not created uniquely');
  }
  return outcomeResult.rows[0].id;
}
