import { QueryFunction } from '../db.js';

export type ConversationEgressReviewState = 'pending' | 'approved' | 'denied' | 'expired';

export interface ResolvedConversationExecutionGovernance {
  readonly conversation_id: string;
  readonly asset_key: string;
  readonly classification_key: string;
  readonly classification_rank: number;
  readonly purpose: string;
  readonly tenant_key: string;
  readonly project_scope_key: string;
  readonly source_tenant: string;
  readonly target_tenant: string;
  readonly source_project: string;
  readonly target_project: string;
  readonly destination_key: string;
  readonly human_approved: boolean;
  readonly egress_review_state: ConversationEgressReviewState;
  readonly egress_reviewed_at: string | null;
  readonly egress_review_expires_at: string | null;
}

export interface ConversationRulebookExecutionBaseContext {
  readonly asset_key: string;
  readonly purpose: string;
  readonly tenant_key: string;
  readonly source_tenant: string;
  readonly target_tenant: string;
  readonly source_project: string;
  readonly target_project: string;
  readonly human_approved: boolean;
}

export class ConversationGovernanceBindingError extends Error {
  constructor(
    public readonly code:
      | 'conversation_governance_input_invalid'
      | 'conversation_governance_unavailable'
      | 'conversation_governance_result_invalid',
    message: string
  ) {
    super(message);
    this.name = 'ConversationGovernanceBindingError';
  }
}

const RESULT_KEYS = new Set([
  'conversation_id',
  'asset_key',
  'classification_key',
  'classification_rank',
  'purpose',
  'tenant_key',
  'project_scope_key',
  'source_tenant',
  'target_tenant',
  'source_project',
  'target_project',
  'destination_key',
  'human_approved',
  'egress_review_state',
  'egress_reviewed_at',
  'egress_review_expires_at',
]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      `${field} must be a non-empty string`
    );
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      `${field} must be null or a non-empty string`
    );
  }
  return value;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance resolver must return a plain object'
    );
  }
  const record = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance resolver must return a plain object'
    );
  }
  return record;
}

function requiredUuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_input_invalid',
      `${field} must be a UUID`
    );
  }
  return value;
}

function validateResult(
  value: unknown,
  expectedConversationId: string,
  expectedDestinationKey: string
): ResolvedConversationExecutionGovernance {
  const record = plainRecord(value);
  const unknownKeys = Object.keys(record).filter((key) => !RESULT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      `Conversation governance resolver returned unsupported keys: ${unknownKeys.sort().join(', ')}`
    );
  }

  const conversationId = requiredText(record.conversation_id, 'conversation_id');
  const destinationKey = requiredText(record.destination_key, 'destination_key');
  const tenantKey = requiredText(record.tenant_key, 'tenant_key');
  const projectScopeKey = requiredText(record.project_scope_key, 'project_scope_key');
  const sourceTenant = requiredText(record.source_tenant, 'source_tenant');
  const targetTenant = requiredText(record.target_tenant, 'target_tenant');
  const sourceProject = requiredText(record.source_project, 'source_project');
  const targetProject = requiredText(record.target_project, 'target_project');

  if (conversationId !== expectedConversationId) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance resolver returned the wrong conversation identity'
    );
  }
  if (destinationKey !== expectedDestinationKey) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance resolver returned the wrong destination identity'
    );
  }
  if (sourceTenant !== tenantKey || targetTenant !== tenantKey) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance tenant scope is inconsistent'
    );
  }
  if (sourceProject !== projectScopeKey || targetProject !== projectScopeKey) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance project scope is inconsistent'
    );
  }

  if (typeof record.classification_rank !== 'number'
      || !Number.isInteger(record.classification_rank)
      || record.classification_rank < 0) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'classification_rank must be a non-negative integer'
    );
  }
  if (typeof record.human_approved !== 'boolean') {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'human_approved must be a boolean'
    );
  }
  if (!['pending', 'approved', 'denied', 'expired'].includes(String(record.egress_review_state))) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'egress_review_state is invalid'
    );
  }
  const reviewState = record.egress_review_state as ConversationEgressReviewState;
  if ((reviewState === 'approved') !== record.human_approved) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'human_approved is inconsistent with egress_review_state'
    );
  }

  const resolved: ResolvedConversationExecutionGovernance = {
    conversation_id: conversationId,
    asset_key: requiredText(record.asset_key, 'asset_key'),
    classification_key: requiredText(record.classification_key, 'classification_key'),
    classification_rank: record.classification_rank,
    purpose: requiredText(record.purpose, 'purpose'),
    tenant_key: tenantKey,
    project_scope_key: projectScopeKey,
    source_tenant: sourceTenant,
    target_tenant: targetTenant,
    source_project: sourceProject,
    target_project: targetProject,
    destination_key: destinationKey,
    human_approved: record.human_approved,
    egress_review_state: reviewState,
    egress_reviewed_at: nullableText(record.egress_reviewed_at, 'egress_reviewed_at'),
    egress_review_expires_at: nullableText(record.egress_review_expires_at, 'egress_review_expires_at'),
  };

  if (resolved.asset_key !== `conversation:${expectedConversationId}`) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Conversation governance asset identity does not match the conversation'
    );
  }
  if (resolved.human_approved && resolved.egress_review_expires_at === null) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_result_invalid',
      'Approved conversation egress must have an expiry'
    );
  }

  return Object.freeze(resolved);
}

export async function resolveConversationExecutionGovernance(
  queryFn: QueryFunction,
  input: Readonly<{
    governanceProjectKey: string;
    conversationId: string;
    destinationKey: string;
  }>
): Promise<ResolvedConversationExecutionGovernance> {
  if (!queryFn || typeof queryFn !== 'function') {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_input_invalid',
      'A database query function is required'
    );
  }
  const governanceProjectKey = typeof input?.governanceProjectKey === 'string'
    ? input.governanceProjectKey.trim()
    : '';
  const destinationKey = typeof input?.destinationKey === 'string'
    ? input.destinationKey.trim()
    : '';
  const conversationId = requiredUuid(String(input?.conversationId ?? ''), 'conversationId');
  if (!governanceProjectKey) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_input_invalid',
      'governanceProjectKey must be a non-empty string'
    );
  }
  if (!destinationKey) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_input_invalid',
      'destinationKey must be a non-empty string'
    );
  }

  let result: { rows: { governance: unknown }[] };
  try {
    result = await queryFn<{ governance: unknown }>(
      `SELECT comind_pm.resolve_conversation_execution_governance($1::text, $2::uuid, $3::text) AS governance`,
      [governanceProjectKey, conversationId, destinationKey]
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConversationGovernanceBindingError(
      'conversation_governance_unavailable',
      `Conversation governance could not be resolved: ${detail}`
    );
  }

  if (result.rows.length !== 1) {
    throw new ConversationGovernanceBindingError(
      'conversation_governance_unavailable',
      'Conversation governance resolver did not return exactly one row'
    );
  }
  return validateResult(result.rows[0].governance, conversationId, destinationKey);
}

export function toRulebookExecutionBaseContext(
  governance: ResolvedConversationExecutionGovernance
): ConversationRulebookExecutionBaseContext {
  return Object.freeze({
    asset_key: governance.asset_key,
    purpose: governance.purpose,
    tenant_key: governance.tenant_key,
    source_tenant: governance.source_tenant,
    target_tenant: governance.target_tenant,
    source_project: governance.source_project,
    target_project: governance.target_project,
    human_approved: governance.human_approved,
  });
}
