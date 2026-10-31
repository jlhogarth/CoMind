BEGIN;

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'
), controls AS (
  SELECT f.id,f.control_key,f.layer0_section
  FROM comind_pm.pm_governance_control_families f
  JOIN p ON p.id=f.project_id
  WHERE f.layer0_section IN (3,4,6,7,10,11,13,15,17,19,24,27)
)
UPDATE comind_pm.pm_governance_control_requirements r
SET status='verified',
    last_verified_at=clock_timestamp(),
    evidence_refs=r.evidence_refs || jsonb_build_array(
      jsonb_build_object('kind','repository','ref','db/verification/20261028_drule_002_successor_control_plane_verification.sql'),
      jsonb_build_object('kind','repository','ref','db/verification/20261028_drule_002_successor_control_plane_hardening_verification.sql'),
      jsonb_build_object('kind','repository','ref','.github/workflows/drule-002-successor-control-plane.yml'),
      jsonb_build_object('kind','test_environment','ref','Supabase Test sbgfuanxiqepcoboxzcl')
    ),
    updated_at=clock_timestamp()
FROM controls c
WHERE r.control_id=c.id;

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'
), controls AS (
  SELECT f.id,f.project_id,f.control_key,f.layer0_section,f.family_name
  FROM comind_pm.pm_governance_control_families f
  JOIN p ON p.id=f.project_id
  WHERE f.layer0_section IN (3,4,6,7,10,11,13,15,17,19,24,27)
)
INSERT INTO comind_pm.pm_governance_assessments(
  project_id,control_id,assessment_key,assessment_type,status,summary,verifier,verifier_independence,evidence_refs,metadata
)
SELECT c.project_id,c.id,
       'DRULE-002-SR-C'||lpad(c.layer0_section::text,2,'0')||'-20261028',
       CASE WHEN c.layer0_section IN (4,11,13,15,17,27) THEN 'security'
            WHEN c.layer0_section IN (7,19) THEN 'privacy'
            WHEN c.layer0_section=24 THEN 'fairness'
            WHEN c.layer0_section=10 THEN 'compliance'
            ELSE 'runtime' END,
       'pass',
       'Shared successor-control capability verified in CoMind Test. This proves the reusable control-plane contract, deterministic fail-closed behavior, evidence model, and management visibility. It does not claim production activation or complete adoption by every product-specific runtime path.',
       'DRULE-002 successor remediation',
       'self_review',
       jsonb_build_array(
         jsonb_build_object('ref','db/verification/20261028_drule_002_successor_control_plane_verification.sql'),
         jsonb_build_object('ref','db/verification/20261028_drule_002_successor_control_plane_hardening_verification.sql'),
         jsonb_build_object('ref','docs/governance/rulebook-control-plane.md')
       ),
       jsonb_build_object(
         'scope','shared_platform_control_capability',
         'environment','test',
         'production_activation',false,
         'product_integration_required',true,
         'historical_text_recovered',false
       )
FROM controls c
ON CONFLICT(project_id,assessment_key) DO UPDATE SET
  status=excluded.status,
  summary=excluded.summary,
  verifier=excluded.verifier,
  verifier_independence=excluded.verifier_independence,
  evidence_refs=excluded.evidence_refs,
  metadata=excluded.metadata,
  performed_at=clock_timestamp();

SELECT comind_pm.refresh_governance_control_health();

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'
)
UPDATE comind_pm.pm_rule_archaeology_queue q
SET metadata=q.metadata || jsonb_build_object(
      'successor_remediation_2026_10_28',
      jsonb_build_object(
        'control_key','DRULE-C'||lpad(q.section_number::text,2,'0'),
        'modern_coverage_state','modern_coverage_adequate',
        'capability_state','verified_test',
        'verification_scope','shared_platform_control_capability',
        'product_integration_required',true,
        'production_activation',false,
        'source_text_status','original_clause_text_missing',
        'archaeology_status_unchanged',true,
        'accepted_at',clock_timestamp(),
        'evidence_refs',jsonb_build_array(
          'docs/governance/rulebook-control-plane.md',
          'db/verification/20261028_drule_002_successor_control_plane_verification.sql',
          'db/verification/20261028_drule_002_successor_control_plane_hardening_verification.sql'
        )
      )
    ),
    updated_at=clock_timestamp()
FROM p
WHERE q.project_id=p.id
  AND q.section_number IN (3,4,6,7,10,11,13,15,17,19,24,27)
  AND q.archaeology_status='in_progress';

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'
)
UPDATE comind_pm.pm_rule_reconciliation_cases c
SET status='resolved',
    resolution_summary='DRULE-002 successor remediation installed and verified a reusable shared Test control capability for this previously missing modern governance family. Resolution is scoped to platform control capability. Production activation and product-specific integration remain separately governed and are not implied.',
    resolved_by='DRULE-002 successor remediation',
    resolved_at=clock_timestamp(),
    evidence_refs=c.evidence_refs || jsonb_build_array(
      jsonb_build_object('ref','docs/governance/rulebook-control-plane.md'),
      jsonb_build_object('ref','db/verification/20261028_drule_002_successor_control_plane_verification.sql')
    ),
    metadata=c.metadata || jsonb_build_object(
      'resolution_scope','shared_platform_control_capability_verified_test',
      'production_activation',false,
      'product_integration_required',true,
      'historical_source_gap_unchanged',true
    ),
    updated_at=clock_timestamp()
FROM p
WHERE c.project_id=p.id
  AND c.case_key IN ('RC-L0-GAP-DCLASS-001','RC-L0-GAP-EGRESS-001','RC-L0-GAP-TENANCY-001');

COMMIT;
