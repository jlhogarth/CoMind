BEGIN;

DO $$
DECLARE
  v_project uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_project FROM comind_pm.pm_projects WHERE project_key='COMIND';
  IF v_project IS NULL THEN RAISE EXCEPTION 'COMIND project missing'; END IF;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_governance_control_families
  WHERE project_id=v_project
    AND layer0_section IN (3,4,6,7,10,11,13,15,17,19,24,27)
    AND remediation_state='verified_test'
    AND health_state='healthy';
  IF v_count<>12 THEN RAISE EXCEPTION 'Expected 12 healthy verified Test control families, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_governance_control_requirements r
  JOIN comind_pm.pm_governance_control_families f ON f.id=r.control_id
  WHERE f.project_id=v_project
    AND f.layer0_section IN (3,4,6,7,10,11,13,15,17,19,24,27)
    AND r.status='verified'
    AND r.last_verified_at IS NOT NULL;
  IF v_count<>36 THEN RAISE EXCEPTION 'Expected 36 verified control requirements, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_governance_assessments a
  JOIN comind_pm.pm_governance_control_families f ON f.id=a.control_id
  WHERE f.project_id=v_project
    AND a.assessment_key LIKE 'DRULE-002-SR-C%-20261028'
    AND a.status='pass'
    AND a.metadata->>'scope'='shared_platform_control_capability'
    AND a.metadata->>'production_activation'='false'
    AND a.metadata->>'product_integration_required'='true';
  IF v_count<>12 THEN RAISE EXCEPTION 'Expected 12 scoped passing successor assessments, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_rule_archaeology_queue q
  WHERE q.project_id=v_project
    AND q.section_number IN (3,4,6,7,10,11,13,15,17,19,24,27)
    AND q.archaeology_status='in_progress'
    AND q.completed_at IS NULL
    AND q.metadata->'successor_remediation_2026_10_28'->>'modern_coverage_state'='modern_coverage_adequate'
    AND q.metadata->'successor_remediation_2026_10_28'->>'capability_state'='verified_test'
    AND q.metadata->'successor_remediation_2026_10_28'->>'source_text_status'='original_clause_text_missing'
    AND q.metadata->'successor_remediation_2026_10_28'->>'production_activation'='false'
    AND q.metadata->'successor_remediation_2026_10_28'->>'product_integration_required'='true';
  IF v_count<>12 THEN RAISE EXCEPTION 'Expected 12 archaeology rows with verified successor remediation and preserved source gaps, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_rule_reconciliation_cases
  WHERE project_id=v_project
    AND case_key IN ('RC-L0-GAP-DCLASS-001','RC-L0-GAP-EGRESS-001','RC-L0-GAP-TENANCY-001')
    AND status='resolved'
    AND metadata->>'resolution_scope'='shared_platform_control_capability_verified_test'
    AND metadata->>'production_activation'='false';
  IF v_count<>3 THEN RAISE EXCEPTION 'Expected three current-governance gap cases resolved at Test capability scope, found %',v_count; END IF;

  SELECT count(*) INTO v_count FROM comind_pm.pm_data_asset_governance WHERE metadata->>'synthetic'='true';
  IF v_count<>0 THEN RAISE EXCEPTION 'Synthetic governed assets remain after acceptance'; END IF;
  SELECT count(*) INTO v_count FROM comind_pm.pm_crypto_key_registry WHERE metadata->>'synthetic'='true';
  IF v_count<>0 THEN RAISE EXCEPTION 'Synthetic key registry rows remain after acceptance'; END IF;
  SELECT count(*) INTO v_count FROM comind_pm.pm_governance_exceptions WHERE status IN ('requested','approved');
  IF v_count<>0 THEN RAISE EXCEPTION 'Open governance exceptions remain after acceptance'; END IF;
END $$;

ROLLBACK;
