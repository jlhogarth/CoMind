import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceControlConfigSchema, loadMaintenanceControlConfig } from '../dist/maintenance-control/config.js';
import { resolveChangeImpact, runMaintenanceAudit } from '../dist/maintenance-control/auditor.js';

function configWith(controls, impactRules = [{
  id: 'IMPACT-1',
  status: 'current',
  triggerKinds: ['relationship.updated'],
  affectedArtifacts: ['DPE-001', 'DPE-002'],
  requiredChecks: controls.map((control) => control.id),
  severityIfStale: 'warning',
  rationale: 'fixture',
}]) {
  return maintenanceControlConfigSchema.parse({
    schemaVersion: 1,
    controlSet: 'MCTRL-TEST',
    environment: 'Test',
    authorityBoundary: 'read_only_audit',
    controls,
    impactRules,
  });
}

test('repository maintenance control configuration is valid and internally referential', async () => {
  const config = await loadMaintenanceControlConfig('../config/maintenance-control.v1.json');
  assert.equal(config.controlSet, 'MCTRL-001');
  assert.ok(config.controls.length >= 10);
  assert.ok(config.impactRules.length >= 4);
});

test('configuration rejects impact rules that reference unknown controls', () => {
  const result = maintenanceControlConfigSchema.safeParse({
    schemaVersion: 1,
    controlSet: 'MCTRL-TEST',
    environment: 'Test',
    authorityBoundary: 'read_only_audit',
    controls: [{
      id: 'KNOWN', kind: 'concept_count', description: 'known', severity: 'warning', expected: 1, remediation: 'fix',
    }],
    impactRules: [{
      id: 'IMPACT', status: 'current', triggerKinds: ['concept.updated'], affectedArtifacts: ['CCI-001'],
      requiredChecks: ['UNKNOWN'], severityIfStale: 'warning', rationale: 'fixture',
    }],
  });
  assert.equal(result.success, false);
});

test('audit distinguishes PASS, WARNING, and FAIL deterministically', async () => {
  const controls = [
    { id: 'PASS', kind: 'concept_count', description: 'pass', severity: 'warning', expected: 51, remediation: 'none' },
    { id: 'WARN', kind: 'entity_version', description: 'warn', severity: 'warning', trackingKey: 'CCI-001', expected: 4, remediation: 'reconcile' },
    { id: 'FAIL', kind: 'noncanonical_active_edges', description: 'fail', severity: 'fail', expected: 0, remediation: 'quarantine' },
  ];
  const config = configWith(controls);
  const query = async (sql) => {
    if (sql.includes("entity_type = 'concept'")) return { rows: [{ concept_count: 51 }] };
    if (sql.includes('current_version::int')) return { rows: [{ current_version: 3 }] };
    if (sql.includes('assertion_status')) return { rows: [{ count: 1 }] };
    throw new Error('unexpected query');
  };
  const report = await runMaintenanceAudit(query, config, () => new Date('2026-10-26T20:00:00Z'));
  assert.equal(report.overall, 'FAIL');
  assert.deepEqual(report.summary, { pass: 1, warning: 1, fail: 1 });
  assert.deepEqual(report.findings.map((finding) => finding.status), ['PASS', 'WARNING', 'FAIL']);
  assert.equal(report.generatedAt, '2026-10-26T20:00:00.000Z');
});

test('query errors always fail closed even for warning-severity controls', async () => {
  const config = configWith([
    { id: 'QUERY', kind: 'concept_count', description: 'query', severity: 'warning', expected: 51, remediation: 'investigate' },
  ]);
  const report = await runMaintenanceAudit(async () => {
    const error = new Error('sensitive connection detail');
    error.code = '42P01';
    throw error;
  }, config);
  assert.equal(report.overall, 'FAIL');
  assert.equal(report.findings[0].status, 'FAIL');
  assert.deepEqual(report.findings[0].observed, { state: 'query_error', code: '42P01' });
  assert.doesNotMatch(JSON.stringify(report), /sensitive connection detail/);
});

test('change-impact resolver uses only current explicit rules and deduplicates outputs', () => {
  const controls = [
    { id: 'A', kind: 'concept_count', description: 'a', severity: 'warning', expected: 51, remediation: 'a' },
    { id: 'B', kind: 'orphan_artifacts', description: 'b', severity: 'fail', expected: 0, remediation: 'b' },
  ];
  const config = configWith(controls, [
    {
      id: 'CURRENT-1', status: 'current', triggerKinds: ['concept.updated'], affectedArtifacts: ['CCI-001', 'DPE-001'],
      requiredChecks: ['A'], severityIfStale: 'warning', rationale: 'one',
    },
    {
      id: 'CURRENT-2', status: 'current', triggerKinds: ['concept.updated'], affectedArtifacts: ['DPE-001', 'MLC-001'],
      requiredChecks: ['A', 'B'], severityIfStale: 'fail', rationale: 'two',
    },
    {
      id: 'RETIRED', status: 'retired', triggerKinds: ['concept.updated'], affectedArtifacts: ['OLD'],
      requiredChecks: ['A'], severityIfStale: 'fail', rationale: 'retired',
    },
  ]);
  const impact = resolveChangeImpact(config, 'concept.updated');
  assert.deepEqual(impact.matchedRuleIds, ['CURRENT-1', 'CURRENT-2']);
  assert.deepEqual(impact.affectedArtifacts, ['CCI-001', 'DPE-001', 'MLC-001']);
  assert.deepEqual(impact.requiredChecks, ['A', 'B']);
  assert.equal(impact.highestSeverityIfStale, 'fail');
});
