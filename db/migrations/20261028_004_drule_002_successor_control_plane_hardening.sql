BEGIN;

CREATE INDEX IF NOT EXISTS pm_data_assets_residency_idx ON comind_pm.pm_data_asset_governance(residency_profile_id);
CREATE INDEX IF NOT EXISTS pm_data_assets_retention_idx ON comind_pm.pm_data_asset_governance(retention_profile_id);
CREATE INDEX IF NOT EXISTS pm_gov_runtime_project_idx ON comind_pm.pm_governance_runtime_decisions(project_id);
CREATE INDEX IF NOT EXISTS pm_gov_runtime_exception_idx ON comind_pm.pm_governance_runtime_decisions(exception_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels',
    'pm_residency_profiles','pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry',
    'pm_compliance_obligations','pm_egress_destinations','pm_governance_exceptions',
    'pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
  ] LOOP
    EXECUTE format('ALTER TABLE comind_pm.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS private_deny_all ON comind_pm.%I',t);
    EXECUTE format('CREATE POLICY private_deny_all ON comind_pm.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',t);
    EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM PUBLIC',t);
    IF to_regrole('anon') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM anon',t); END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM authenticated',t); END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION comind_pm.governance_context_has_forbidden_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.governance_preflight_core(text,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.governance_preflight(text,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.refresh_governance_control_health() FROM PUBLIC;

COMMIT;
