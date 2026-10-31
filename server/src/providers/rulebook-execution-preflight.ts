import { QueryFunction } from '../db.js';

export type RulebookExecutionControlKey = 'DRULE-C11' | 'DRULE-C13' | 'DRULE-C17';
export type RulebookExecutionDecisionValue = 'allow' | 'deny' | 'review';

export interface RulebookExecutionDecision {
  readonly control_key: RulebookExecutionControlKey;
  readonly decision: RulebookExecutionDecisionValue;
  readonly reason_code: string;
  readonly reason: string;
  readonly evaluated_at?: string;
}

export interface RulebookExecutionPreflightEvaluator {
  evaluate(
    controlKey: RulebookExecutionControlKey,
    context: Readonly<Record<string, unknown>>,
    record?: boolean
  ): Promise<RulebookExecutionDecision>;
}

export interface RulebookExecutionGovernanceContext {
  readonly asset_key: string;
  readonly purpose: string;
  readonly tenant_key: string;
  readonly source_tenant: string;
  readonly target_tenant: string;
  readonly source_project: string;
  readonly target_project: string;
  readonly untrusted_input: boolean;
  readonly asks_for_secrets: boolean;
  readonly authority_escalation: boolean;
  readonly human_approved: boolean;
}

export interface RulebookTrustedEgressBinding {
  readonly destination_key: string;
  readonly region: string;
  readonly action: string;
}

export interface RequiredRulebookExecutionPreflight {
  readonly evaluator: RulebookExecutionPreflightEvaluator;
  readonly governance: RulebookExecutionGovernanceContext;
  readonly binding: RulebookTrustedEgressBinding;
}

export class RulebookExecutionPreflightError extends Error {
  constructor(
    public readonly code:
      | 'rulebook_context_invalid'
      | 'rulebook_preflight_unavailable'
      | 'rulebook_preflight_blocked',
    message: string,
    public readonly controlKey: RulebookExecutionControlKey | null = null,
    public readonly reasonCode: string | null = null,
    public readonly decision: RulebookExecutionDecisionValue | null = null
  ) {
    super(message);
    this.name = 'RulebookExecutionPreflightError';
  }
}

const GOVERNANCE_KEYS = new Set([
  'asset_key',
  'purpose',
  'tenant_key',
  'source_tenant',
  'target_tenant',
  'source_project',
  'target_project',
  'untrusted_input',
  'asks_for_secrets',
  'authority_escalation',
  'human_approved',
]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `${field} must be a non-empty string`
    );
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `${field} must be a boolean`
    );
  }
  return value;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `${label} must be a plain object`
    );
  }
  const record = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `${label} must be a plain object`
    );
  }
  return record;
}

function validateGovernanceContext(value: unknown): RulebookExecutionGovernanceContext {
  const record = plainRecord(value, 'RuleBook execution governance context');
  const unknownKeys = Object.keys(record).filter((key) => !GOVERNANCE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `RuleBook execution governance context contains unsupported keys: ${unknownKeys.sort().join(', ')}`
    );
  }

  const governance: RulebookExecutionGovernanceContext = {
    asset_key: requiredText(record.asset_key, 'asset_key'),
    purpose: requiredText(record.purpose, 'purpose'),
    tenant_key: requiredText(record.tenant_key, 'tenant_key'),
    source_tenant: requiredText(record.source_tenant, 'source_tenant'),
    target_tenant: requiredText(record.target_tenant, 'target_tenant'),
    source_project: requiredText(record.source_project, 'source_project'),
    target_project: requiredText(record.target_project, 'target_project'),
    untrusted_input: requiredBoolean(record.untrusted_input, 'untrusted_input'),
    asks_for_secrets: requiredBoolean(record.asks_for_secrets, 'asks_for_secrets'),
    authority_escalation: requiredBoolean(record.authority_escalation, 'authority_escalation'),
    human_approved: requiredBoolean(record.human_approved, 'human_approved'),
  };

  if (governance.tenant_key !== governance.target_tenant) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      'tenant_key must match target_tenant for provider egress'
    );
  }

  return Object.freeze(governance);
}

function validateBinding(value: unknown): RulebookTrustedEgressBinding {
  const record = plainRecord(value, 'RuleBook trusted egress binding');
  const binding = {
    destination_key: requiredText(record.destination_key, 'destination_key'),
    region: requiredText(record.region, 'region'),
    action: requiredText(record.action, 'action'),
  };
  return Object.freeze(binding);
}

function validateDecision(
  value: unknown,
  expectedControl: RulebookExecutionControlKey
): RulebookExecutionDecision {
  const record = plainRecord(value, 'RuleBook preflight decision');
  if (record.control_key !== expectedControl) {
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_unavailable',
      `RuleBook preflight returned the wrong control identity for ${expectedControl}`,
      expectedControl
    );
  }
  if (!['allow', 'deny', 'review'].includes(String(record.decision))) {
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_unavailable',
      `RuleBook preflight returned an invalid decision for ${expectedControl}`,
      expectedControl
    );
  }
  const decision = record.decision as RulebookExecutionDecisionValue;
  const reasonCode = requiredText(record.reason_code, 'reason_code');
  const reason = requiredText(record.reason, 'reason');
  return Object.freeze({
    control_key: expectedControl,
    decision,
    reason_code: reasonCode,
    reason,
    ...(typeof record.evaluated_at === 'string' ? { evaluated_at: record.evaluated_at } : {}),
  });
}

export async function requireRulebookExecutionDecision(
  evaluator: RulebookExecutionPreflightEvaluator,
  controlKey: RulebookExecutionControlKey,
  context: Readonly<Record<string, unknown>>,
  record = true
): Promise<RulebookExecutionDecision> {
  let rawDecision: unknown;
  try {
    rawDecision = await evaluator.evaluate(controlKey, context, record);
  } catch (error) {
    if (error instanceof RulebookExecutionPreflightError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_unavailable',
      `RuleBook preflight ${controlKey} was unavailable: ${detail}`,
      controlKey
    );
  }

  const decision = validateDecision(rawDecision, controlKey);
  if (decision.decision !== 'allow') {
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_blocked',
      `RuleBook ${controlKey} returned ${decision.decision}: ${decision.reason_code}`,
      controlKey,
      decision.reason_code,
      decision.decision
    );
  }
  return decision;
}

export async function runRequiredRulebookExecutionPreflight(
  input: RequiredRulebookExecutionPreflight
): Promise<readonly RulebookExecutionDecision[]> {
  if (!input?.evaluator || typeof input.evaluator.evaluate !== 'function') {
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_unavailable',
      'A RuleBook execution preflight evaluator is required'
    );
  }

  const governance = validateGovernanceContext(input.governance);
  const binding = validateBinding(input.binding);
  const decisions: RulebookExecutionDecision[] = [];

  decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C11', Object.freeze({
    untrusted_input: governance.untrusted_input,
    asks_for_secrets: governance.asks_for_secrets,
    authority_escalation: governance.authority_escalation,
    side_effect: true,
    human_approved: governance.human_approved,
  })));

  decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C17', Object.freeze({
    source_tenant: governance.source_tenant,
    target_tenant: governance.target_tenant,
    source_project: governance.source_project,
    target_project: governance.target_project,
    action: binding.action,
  })));

  decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C13', Object.freeze({
    asset_key: governance.asset_key,
    destination_key: binding.destination_key,
    region: binding.region,
    tenant_key: governance.tenant_key,
    purpose: governance.purpose,
    human_approved: governance.human_approved,
  })));

  return Object.freeze(decisions);
}

export function createDatabaseRulebookExecutionPreflight(
  queryFn: QueryFunction
): RulebookExecutionPreflightEvaluator {
  return Object.freeze({
    async evaluate(
      controlKey: RulebookExecutionControlKey,
      context: Readonly<Record<string, unknown>>,
      record = true
    ) {
      const result = await queryFn<{ decision: unknown }>(
        `SELECT comind_pm.governance_preflight($1::text, $2::jsonb, $3::boolean) AS decision`,
        [controlKey, JSON.stringify(context), record]
      );
      if (result.rows.length !== 1) {
        throw new RulebookExecutionPreflightError(
          'rulebook_preflight_unavailable',
          `RuleBook preflight ${controlKey} did not return exactly one decision`,
          controlKey
        );
      }
      return validateDecision(result.rows[0].decision, controlKey);
    },
  });
}
