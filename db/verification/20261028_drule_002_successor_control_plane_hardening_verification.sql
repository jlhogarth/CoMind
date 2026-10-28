BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  WITH targets(table_name) AS (
    SELECT unnest(ARRAY[
      'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels',
      'pm_residency_profiles','pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry',
      'pm_compliance_obligations','pm_egress_destinations','pm_governance_exceptions',
      'pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
    ])
  )
  SELECT count(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN targets t ON t.table_name=c.relname
  WHERE n.nspname='comind_pm' AND c.relkind='r' AND c.relrowsecurity;
  IF v_count<>13 THEN RAISE EXCEPTION 'Expected RLS on all 13 private successor-control tables, found %',v_count; END IF;

  WITH targets(table_name) AS (
    SELECT unnest(ARRAY[
      'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels',
      'pm_residency_profiles','pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry',
      'pm_compliance_obligations','pm_egress_destinations','pm_governance_exceptions',
      'pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
    ])
  )
  SELECT count(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN targets t ON t.table_name=c.relname
  WHERE n.nspname='comind_pm'
    AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='private_deny_all');
  IF v_count<>13 THEN RAISE EXCEPTION 'Expected explicit private_deny_all policy on all 13 tables, found %',v_count; END IF;

  WITH targets(table_name) AS (
    SELECT unnest(ARRAY[
      'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels',
      'pm_residency_profiles','pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry',
      'pm_compliance_obligations','pm_egress_destinations','pm_governance_exceptions',
      'pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
    ])
  ), fks AS (
    SELECT c.oid AS relid, con.conname, con.conkey
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='comind_pm'
    JOIN targets t ON t.table_name=c.relname
    WHERE con.contype='f'
  )
  SELECT count(*) INTO v_count
  FROM fks f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid=f.relid AND i.indisvalid AND i.indisready
      AND (i.indkey::smallint[])[0:cardinality(f.conkey)-1]=f.conkey
  );
  IF v_count<>0 THEN RAISE EXCEPTION 'Found % unindexed foreign key(s) in successor-control tables',v_count; END IF;

  IF has_function_privilege('public','comind_pm.governance_context_has_forbidden_key(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute governance_context_has_forbidden_key';
  END IF;
  IF has_function_privilege('public','comind_pm.governance_preflight_core(text,jsonb,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute governance_preflight_core';
  END IF;
  IF has_function_privilege('public','comind_pm.governance_preflight(text,jsonb,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute governance_preflight';
  END IF;
  IF has_function_privilege('public','comind_pm.refresh_governance_control_health()','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute refresh_governance_control_health';
  END IF;
END $$;

ROLLBACK;
