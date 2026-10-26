import type { AuditQueryExecutor } from './db.js';
import type { MaintenanceControl, MaintenanceControlConfig } from './config.js';

export type AuditStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface AuditFinding {
  controlId: string;
  description: string;
  status: AuditStatus;
  observed: unknown;
  expected: unknown;
  evidence: {
    queryId: string;
    detail?: string;
  };
  remediation: string;
}

export interface MaintenanceAuditReport {
  schemaVersion: 1;
  controlSet: string;
  environment: string;
  authorityBoundary: 'read_only_audit';
  generatedAt: string;
  overall: AuditStatus;
  summary: { pass: number; warning: number; fail: number };
  findings: AuditFinding[];
}

export interface ChangeImpactResult {
  triggerKind: string;
  matchedRuleIds: string[];
  affectedArtifacts: string[];
  requiredChecks: string[];
  highestSeverityIfStale: 'warning' | 'fail' | null;
}

function mismatchStatus(severity: 'warning' | 'fail'): AuditStatus {
  return severity === 'fail' ? 'FAIL' : 'WARNING';
}

function pass(control: MaintenanceControl, observed: unknown, expected: unknown, queryId: string): AuditFinding {
  return {
    controlId: control.id,
    description: control.description,
    status: 'PASS',
    observed,
    expected,
    evidence: { queryId },
    remediation: control.remediation,
  };
}

function mismatch(
  control: MaintenanceControl,
  observed: unknown,
  expected: unknown,
  queryId: string,
  detail?: string
): AuditFinding {
  return {
    controlId: control.id,
    description: control.description,
    status: mismatchStatus(control.severity),
    observed,
    expected,
    evidence: { queryId, ...(detail ? { detail } : {}) },
    remediation: control.remediation,
  };
}

function queryFailure(control: MaintenanceControl, error: unknown): AuditFinding {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? 'unknown')
    : 'unknown';
  return {
    controlId: control.id,
    description: control.description,
    status: 'FAIL',
    observed: { state: 'query_error', code },
    expected: 'checkable governed state',
    evidence: {
      queryId: `mctrl.${control.kind}`,
      detail: 'The control query failed. A query failure can never be treated as PASS.',
    },
    remediation: control.remediation,
  };
}

function getPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function primitiveEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

async function evaluateControl(query: AuditQueryExecutor, control: MaintenanceControl): Promise<AuditFinding> {
  switch (control.kind) {
    case 'required_columns': {
      const result = await query<{ column_name: string }>(
        `SELECT column_name::text
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [control.schema, control.relation]
      );
      const observed = new Set(result.rows.map((row) => row.column_name));
      const missing = control.columns.filter((column) => !observed.has(column));
      return missing.length === 0
        ? pass(control, { missing: [] }, { required: control.columns }, 'mctrl.required_columns')
        : mismatch(control, { missing }, { required: control.columns }, 'mctrl.required_columns');
    }

    case 'concept_count': {
      const result = await query<{ concept_count: number }>(
        `SELECT count(*)::int AS concept_count
           FROM comind_development.entity
          WHERE tracking_key LIKE 'concept:%' AND entity_type = 'concept'`
      );
      const observed = result.rows[0]?.concept_count;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.concept_count')
        : mismatch(control, observed, control.expected, 'mctrl.concept_count');
    }

    case 'concept_relationship_counts': {
      const result = await query<{ active: number; retired: number; weighted: number }>(
        `SELECT count(*) FILTER (WHERE r.valid_to IS NULL)::int AS active,
                count(*) FILTER (WHERE r.valid_to IS NOT NULL)::int AS retired,
                count(*) FILTER (
                  WHERE r.valid_to IS NULL
                    AND coalesce((r.relationship_payload->>'priority_weight')::numeric, 0) > 0
                )::int AS weighted
           FROM comind_development.relationship r
           JOIN comind_development.entity s ON s.entity_id = r.subject_entity_id
           JOIN comind_development.entity o ON o.entity_id = r.object_entity_id
          WHERE s.tracking_key LIKE 'concept:%' AND o.tracking_key LIKE 'concept:%'`
      );
      const observed = result.rows[0] ?? { active: -1, retired: -1, weighted: -1 };
      const ok = observed.active === control.expected.active
        && observed.retired === control.expected.retired
        && observed.weighted === control.expected.weighted;
      return ok
        ? pass(control, observed, control.expected, 'mctrl.concept_relationship_counts')
        : mismatch(control, observed, control.expected, 'mctrl.concept_relationship_counts');
    }

    case 'noncanonical_active_edges': {
      const result = await query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM comind_development.relationship r
           JOIN comind_development.entity s ON s.entity_id = r.subject_entity_id
           JOIN comind_development.entity o ON o.entity_id = r.object_entity_id
          WHERE r.valid_to IS NULL
            AND s.tracking_key LIKE 'concept:%'
            AND o.tracking_key LIKE 'concept:%'
            AND lower(coalesce(r.relationship_payload->>'assertion_status', ''))
                IN ('candidate', 'proposed', 'unresolved')`
      );
      const observed = result.rows[0]?.count;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.noncanonical_active_edges')
        : mismatch(control, observed, control.expected, 'mctrl.noncanonical_active_edges');
    }

    case 'entity_version': {
      const result = await query<{ current_version: number }>(
        `SELECT current_version::int
           FROM comind_development.entity
          WHERE tracking_key = $1`,
        [control.trackingKey]
      );
      const observed = result.rows[0]?.current_version;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.entity_version')
        : mismatch(control, observed, control.expected, 'mctrl.entity_version');
    }

    case 'entity_payload_equals': {
      const result = await query<{ canonical_payload: unknown }>(
        `SELECT canonical_payload
           FROM comind_development.entity
          WHERE tracking_key = $1`,
        [control.trackingKey]
      );
      const payload = result.rows[0]?.canonical_payload;
      const observed: Record<string, unknown> = {};
      const differences: string[] = [];
      for (const [path, expected] of Object.entries(control.expected)) {
        observed[path] = getPath(payload, path);
        if (!primitiveEqual(observed[path], expected)) differences.push(path);
      }
      return differences.length === 0
        ? pass(control, observed, control.expected, 'mctrl.entity_payload_equals')
        : mismatch(
            control,
            observed,
            control.expected,
            'mctrl.entity_payload_equals',
            `Mismatched payload paths: ${differences.join(', ')}`
          );
    }

    case 'orphan_relationships': {
      const result = await query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM comind_development.relationship r
           LEFT JOIN comind_development.entity s ON s.entity_id = r.subject_entity_id
           LEFT JOIN comind_development.entity o ON o.entity_id = r.object_entity_id
           LEFT JOIN comind_development.entity e ON e.entity_id = r.evidence_entity_id
          WHERE s.entity_id IS NULL
             OR o.entity_id IS NULL
             OR (r.evidence_entity_id IS NOT NULL AND e.entity_id IS NULL)`
      );
      const observed = result.rows[0]?.count;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.orphan_relationships')
        : mismatch(control, observed, control.expected, 'mctrl.orphan_relationships');
    }

    case 'orphan_artifacts': {
      const result = await query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM comind_development.artifact a
           LEFT JOIN comind_development.entity e ON e.entity_id = a.entity_id
          WHERE e.entity_id IS NULL`
      );
      const observed = result.rows[0]?.count;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.orphan_artifacts')
        : mismatch(control, observed, control.expected, 'mctrl.orphan_artifacts');
    }

    case 'rls_states': {
      const keys = control.expected.map((item) => `${item.schema}.${item.relation}`);
      const result = await query<{ key: string; enabled: boolean }>(
        `SELECT (n.nspname || '.' || c.relname)::text AS key,
                c.relrowsecurity AS enabled
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE (n.nspname || '.' || c.relname) = ANY($1::text[])`,
        [keys]
      );
      const found = new Map(result.rows.map((row) => [row.key, row.enabled]));
      const observed = control.expected.map((item) => ({
        schema: item.schema,
        relation: item.relation,
        enabled: found.get(`${item.schema}.${item.relation}`),
      }));
      const differences = control.expected.filter((item) =>
        found.get(`${item.schema}.${item.relation}`) !== item.enabled
      );
      return differences.length === 0
        ? pass(control, observed, control.expected, 'mctrl.rls_states')
        : mismatch(control, observed, control.expected, 'mctrl.rls_states');
    }

    case 'journal_verified': {
      const result = await query<{ verification_state: string }>(
        `SELECT j.verification_state::text
           FROM comind_development.entity e
           JOIN comind_development.journal_entry j ON j.entity_id = e.entity_id
          WHERE e.tracking_key = $1`,
        [control.trackingKey]
      );
      const observed = result.rows[0]?.verification_state;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.journal_verified')
        : mismatch(control, observed, control.expected, 'mctrl.journal_verified');
    }

    case 'research_session': {
      const result = await query<{ status: string }>(
        `SELECT status::text
           FROM comind_pm.pm_research_sessions
          WHERE session_key = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [control.sessionKey]
      );
      const observed = result.rows[0]?.status;
      return observed === control.expected
        ? pass(control, observed, control.expected, 'mctrl.research_session')
        : mismatch(control, observed, control.expected, 'mctrl.research_session');
    }
  }
}

export async function runMaintenanceAudit(
  query: AuditQueryExecutor,
  config: MaintenanceControlConfig,
  now: () => Date = () => new Date()
): Promise<MaintenanceAuditReport> {
  const findings: AuditFinding[] = [];
  for (const control of config.controls) {
    try {
      findings.push(await evaluateControl(query, control));
    } catch (error) {
      findings.push(queryFailure(control, error));
    }
  }

  const summary = {
    pass: findings.filter((finding) => finding.status === 'PASS').length,
    warning: findings.filter((finding) => finding.status === 'WARNING').length,
    fail: findings.filter((finding) => finding.status === 'FAIL').length,
  };
  const overall: AuditStatus = summary.fail > 0 ? 'FAIL' : summary.warning > 0 ? 'WARNING' : 'PASS';

  return {
    schemaVersion: 1,
    controlSet: config.controlSet,
    environment: config.environment,
    authorityBoundary: config.authorityBoundary,
    generatedAt: now().toISOString(),
    overall,
    summary,
    findings,
  };
}

export function resolveChangeImpact(
  config: MaintenanceControlConfig,
  triggerKind: string
): ChangeImpactResult {
  const matched = config.impactRules.filter((rule) =>
    rule.status === 'current' && rule.triggerKinds.includes(triggerKind)
  );
  const affectedArtifacts = [...new Set(matched.flatMap((rule) => rule.affectedArtifacts))].sort();
  const requiredChecks = [...new Set(matched.flatMap((rule) => rule.requiredChecks))].sort();
  const highestSeverityIfStale = matched.some((rule) => rule.severityIfStale === 'fail')
    ? 'fail'
    : matched.length > 0
      ? 'warning'
      : null;

  return {
    triggerKind,
    matchedRuleIds: matched.map((rule) => rule.id).sort(),
    affectedArtifacts,
    requiredChecks,
    highestSeverityIfStale,
  };
}
