#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Reusing RCO-001 isolated governance reconstruction for EDG-002...\n'
bash "${repository_root}/scripts/test_rco_001_rule_composition_ordering.sh"

printf 'Applying EDG graph foundation parity twice to prove replay safety...\n'
for _ in 1 2; do
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261027_005_edg_graph_registry_foundation_parity.sql"
done

printf 'Applying EDG-002 Rulebook graph integration twice to prove replay safety...\n'
for _ in 1 2; do
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261027_006_edg_002_rulebook_graph_integration.sql"
done

printf 'Creating bounded EDG-002 mapping fixtures...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
insert into comind_development.entity(
  tracking_key,entity_type,title,summary,status,project_key,lane_key,created_by,
  canonical_payload,current_version,source_of_truth,retention_class
) values (
  'RRR-001','artifact','CoMind Rule Reconciliation Register v0.1',
  'Synthetic CI projection of the governed RRR-001 artifact.','current','COMIND','RULEBOOK','EDG-002 CI',
  jsonb_build_object(
    'document_id','19rAT1rHJRQW2GWEwe2mJs332C5yakd0nFIewekAZ87o',
    'projection_role','rule_reconciliation',
    'authority_boundary','Projection over canonical rule system; does not duplicate active rules'
  ),1,'postgresql','durable'
)
on conflict (tracking_key) do nothing;

with p as (
  select id from comind_pm.pm_projects where project_key='COMIND'
), keys(rule_key) as (values
  ('RULE-ARCH-001'),('RULE-ARCH-004'),('RULE-CONT-003'),('RULE-DEV-001'),
  ('RULE-DOC-001'),('RULE-DOC-002'),('RULE-DOC-003'),('RULE-DOC-004'),('RULE-DOC-005'),('RULE-DOC-006'),('RULE-DOC-007'),('RULE-DOC-012'),
  ('RULE-EDG-003'),('RULE-EDG-004'),
  ('RULE-EPI-001'),('RULE-EPI-002'),('RULE-EPI-003'),('RULE-EPI-004'),('RULE-EPI-005'),
  ('RULE-EVID-003'),('RULE-EVID-004'),
  ('RULE-GP-001'),('RULE-GP-002'),('RULE-GP-003'),('RULE-GP-004'),('RULE-GP-005'),
  ('RULE-HIST-L0-SLA-001'),('RULE-HIST-L0-SLA-002'),('RULE-HIST-L0-SLA-003'),('RULE-HIST-L0-SLA-004'),('RULE-HIST-L0-SLA-005'),
  ('RULE-LC-007'),('RULE-LC-009'),('RULE-LC-010'),('RULE-OPS-005')
)
insert into comind_pm.pm_rules(
  project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version,owner
)
select p.id,k.rule_key,'CI fixture '||k.rule_key,'EDG_CI','verification','MUST','active','{}'::jsonb,'informational',false,1,'EDG-002 CI'
from p cross join keys k
on conflict (project_id,rule_key) do nothing;

insert into comind_pm.pm_rule_versions(
  rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,
  decision_ref,source_refs,evidence_refs,validation
)
select
  r.id,1,'Synthetic EDG-002 mapping fixture for '||r.rule_key,'{}'::jsonb,
  'Bounded CI fixture for explicit RRR mapping verification.','EDG-002 CI','test_fixture','approved',
  'ci:edg-002',jsonb_build_array('ci:edg-002'),jsonb_build_array('ci:edg-002'),'{}'::jsonb
from comind_pm.pm_rules r
join comind_pm.pm_projects p on p.id=r.project_id and p.project_key='COMIND'
where r.domain='EDG_CI'
on conflict (rule_id,version) do nothing;
SQL

printf 'Synchronizing canonical Rulebook projections...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "select comind_development.edg_sync_rulebook_projections('ci:edg-002','EDG-002 CI');"

printf 'Seeding explicit RRR-001 mappings twice to prove idempotency...\n'
for _ in 1 2; do
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261027_edg_002_rrr_rule_mappings.sql"
done

printf 'Running EDG-002 structural, security, provenance, and replay verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261027_edg_002_rulebook_graph_integration_verification.sql"

printf 'EDG-002 Durable Rulebook Graph Integration verification passed.\n'
