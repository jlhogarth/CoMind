import {
  RulebookExecutionDecision,
  RulebookExecutionPreflightError,
  RulebookExecutionPreflightEvaluator,
  createDatabaseRulebookExecutionPreflight,
  requireRulebookExecutionDecision,
} from './providers/rulebook-execution-preflight.js';
import { QueryFunction } from './db.js';

export interface RulebookOperationalTrustObservation {
  readonly untrusted_input: boolean;
  readonly asks_for_secrets: boolean;
  readonly authority_escalation: boolean;
}

export interface RulebookOperationalGovernanceContext {
  readonly source_tenant: string;
  readonly target_tenant: string;
  readonly source_project: string;
  readonly target_project: string;
  readonly action: string;
  readonly untrusted_input: boolean;
  readonly asks_for_secrets: boolean;
  readonly authority_escalation: boolean;
  readonly side_effect: boolean;
  readonly human_approved: boolean;
}

export interface RulebookOperationalEgressContext {
  readonly asset_key: string;
  readonly destination_key: string;
  readonly region: string;
  readonly tenant_key: string;
  readonly purpose: string;
}

export interface RequiredRulebookOperationalPreflight {
  readonly evaluator: RulebookExecutionPreflightEvaluator;
  readonly governance: RulebookOperationalGovernanceContext;
  readonly egress?: RulebookOperationalEgressContext;
  readonly record?: boolean;
}

const SECRET_TARGET = /\b(api[ _-]?key|access[ _-]?token|refresh[ _-]?token|bearer[ _-]?token|password|passphrase|credential|secret|private[ _-]?key|client[ _-]?secret|service[ _-]?role|database[ _-]?url|authorization[ _-]?header)\b/i;
const DISCLOSURE_ACTION = /\b(show|print|reveal|display|give|send|return|dump|expose|share|tell|provide|read|extract|leak|publish|what\s+is|what(?:'s| is))\b/i;
const AUTHORITY_ESCALATION = [
  /\b(ignore|disregard|override|bypass|disable|remove|skip)\b.{0,80}\b(instruction|policy|rule|approval|authorization|permission|guardrail|safety|security|governance|restriction|limit)\b/i,
  /\b(grant|give|assign|elevate|increase)\b.{0,60}\b(admin|administrator|root|owner|permission|privilege|authority|access)\b/i,
  /\b(act|behave|operate)\s+as\b.{0,40}\b(admin|administrator|root|owner|authorized|unrestricted)\b/i,
  /\b(pretend|assume)\b.{0,60}\b(approved|authorized|permission|authority|admin|administrator|root)\b/i,
  /\b(without|no)\b.{0,40}\b(approval|authorization|permission|review)\b/i,
];
const SECRET_FIELD = /^(api_?key|access_?token|refresh_?token|bearer_?token|password|passphrase|credential|secret|private_?key|client_?secret|service_?role|database_?url|authorization)$/i;
const MAX_OBSERVED_NODES = 1024;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      `${field} must be a non-empty string`
    );
  }
  return value.trim();
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

function containsAuthorityEscalation(value: string): boolean {
  return AUTHORITY_ESCALATION.some((pattern) => pattern.test(value));
}

export function observeOperationalTrustBoundary(value: unknown): RulebookOperationalTrustObservation {
  let nodes = 0;
  let untrusted = false;
  let asksForSecrets = false;
  let authorityEscalation = false;
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    nodes += 1;
    if (nodes > MAX_OBSERVED_NODES) {
      throw new RulebookExecutionPreflightError(
        'rulebook_context_invalid',
        `Operational trust observation exceeds ${MAX_OBSERVED_NODES} nodes`
      );
    }
    const current = stack.pop();
    if (current === undefined || current === null) continue;
    untrusted = true;

    if (typeof current === 'string') {
      if (SECRET_TARGET.test(current) && DISCLOSURE_ACTION.test(current)) asksForSecrets = true;
      if (containsAuthorityEscalation(current)) authorityEscalation = true;
      continue;
    }
    if (typeof current === 'number' || typeof current === 'boolean') continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      const prototype = Object.getPrototypeOf(record);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new RulebookExecutionPreflightError(
          'rulebook_context_invalid',
          'Operational trust observation accepts plain JSON objects only'
        );
      }
      for (const [key, nested] of Object.entries(record)) {
        if (SECRET_FIELD.test(key) && nested !== null && nested !== undefined && nested !== '') {
          asksForSecrets = true;
        }
        stack.push(key, nested);
      }
      continue;
    }
    throw new RulebookExecutionPreflightError(
      'rulebook_context_invalid',
      'Operational trust observation accepts JSON-compatible values only'
    );
  }

  return Object.freeze({
    untrusted_input: untrusted,
    asks_for_secrets: asksForSecrets,
    authority_escalation: authorityEscalation,
  });
}

export function rulebookTenantScope(orgId: string): string {
  return `org:${requiredText(orgId, 'orgId')}`;
}

export function rulebookProjectScope(projectId: string | null | undefined): string {
  return projectId == null ? 'project:none' : `project:${requiredText(projectId, 'projectId')}`;
}

export async function runRequiredRulebookOperationalPreflight(
  input: RequiredRulebookOperationalPreflight
): Promise<readonly RulebookExecutionDecision[]> {
  if (!input?.evaluator || typeof input.evaluator.evaluate !== 'function') {
    throw new RulebookExecutionPreflightError(
      'rulebook_preflight_unavailable',
      'A RuleBook operational preflight evaluator is required'
    );
  }

  const governance = input.governance;
  const sourceTenant = requiredText(governance.source_tenant, 'source_tenant');
  const targetTenant = requiredText(governance.target_tenant, 'target_tenant');
  const sourceProject = requiredText(governance.source_project, 'source_project');
  const targetProject = requiredText(governance.target_project, 'target_project');
  const action = requiredText(governance.action, 'action');
  const untrustedInput = requiredBoolean(governance.untrusted_input, 'untrusted_input');
  const asksForSecrets = requiredBoolean(governance.asks_for_secrets, 'asks_for_secrets');
  const authorityEscalation = requiredBoolean(governance.authority_escalation, 'authority_escalation');
  const sideEffect = requiredBoolean(governance.side_effect, 'side_effect');
  const humanApproved = requiredBoolean(governance.human_approved, 'human_approved');
  const record = input.record ?? true;
  const decisions: RulebookExecutionDecision[] = [];

  decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C11', Object.freeze({
    untrusted_input: untrustedInput,
    asks_for_secrets: asksForSecrets,
    authority_escalation: authorityEscalation,
    side_effect: sideEffect,
    human_approved: humanApproved,
  }), record));

  decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C17', Object.freeze({
    source_tenant: sourceTenant,
    target_tenant: targetTenant,
    source_project: sourceProject,
    target_project: targetProject,
    action,
  }), record));

  if (input.egress) {
    const egress = input.egress;
    const tenantKey = requiredText(egress.tenant_key, 'tenant_key');
    if (tenantKey !== targetTenant) {
      throw new RulebookExecutionPreflightError(
        'rulebook_context_invalid',
        'Operational egress tenant_key must match target_tenant'
      );
    }
    decisions.push(await requireRulebookExecutionDecision(input.evaluator, 'DRULE-C13', Object.freeze({
      asset_key: requiredText(egress.asset_key, 'asset_key'),
      destination_key: requiredText(egress.destination_key, 'destination_key'),
      region: requiredText(egress.region, 'region'),
      tenant_key: tenantKey,
      purpose: requiredText(egress.purpose, 'purpose'),
      human_approved: humanApproved,
    }), record));
  }

  return Object.freeze(decisions);
}

export function createDatabaseRulebookOperationalAuthority(queryFn: QueryFunction) {
  const evaluator = createDatabaseRulebookExecutionPreflight(queryFn);
  return Object.freeze({
    async require(
      governance: RulebookOperationalGovernanceContext,
      egress?: RulebookOperationalEgressContext
    ) {
      return runRequiredRulebookOperationalPreflight({ evaluator, governance, ...(egress ? { egress } : {}) });
    },
  });
}

export type RulebookOperationalAuthority = ReturnType<typeof createDatabaseRulebookOperationalAuthority>;
