-- CoMind Test only. Do not apply to production without a separate deployment decision.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE TABLE IF NOT EXISTS comind_hud_test.rulebook_control_status (
  control_key text PRIMARY KEY,
  layer0_section integer NOT NULL,
  family_name text NOT NULL,
  source_coverage_state text NOT NULL,
  remediation_state text NOT NULL,
  health_state text NOT NULL,
  requirements_total integer NOT NULL,
  verified_count integer NOT NULL,
  operational_count integer NOT NULL,
  open_exception_count integer NOT NULL,
  last_runtime_decision_at timestamptz,
  last_checked_at timestamptz NOT NULL,
  next_review_at timestamptz,
  coverage_note text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  is_synthetic boolean NOT NULL DEFAULT true CHECK (is_synthetic)
);
ALTER TABLE comind_hud_test.rulebook_control_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rulebook_control_status_read_anon ON comind_hud_test.rulebook_control_status;
CREATE POLICY rulebook_control_status_read_anon ON comind_hud_test.rulebook_control_status FOR SELECT TO anon USING (is_synthetic);
REVOKE ALL ON comind_hud_test.rulebook_control_status FROM PUBLIC, authenticated;
GRANT USAGE ON SCHEMA comind_hud_test TO anon;
GRANT SELECT ON comind_hud_test.rulebook_control_status TO anon;

CREATE OR REPLACE FUNCTION comind_pm.refresh_rulebook_control_hud()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM comind_pm.refresh_governance_control_health();
  DELETE FROM comind_hud_test.rulebook_control_status;
  INSERT INTO comind_hud_test.rulebook_control_status(
    control_key,layer0_section,family_name,source_coverage_state,remediation_state,health_state,
    requirements_total,verified_count,operational_count,open_exception_count,last_runtime_decision_at,
    last_checked_at,next_review_at,coverage_note,is_synthetic
  )
  SELECT f.control_key,f.layer0_section,f.family_name,f.source_coverage_state,f.remediation_state,h.health_state,
         h.requirements_total,h.verified_count,h.operational_count,h.open_exception_count,h.last_runtime_decision_at,
         h.last_checked_at,h.next_review_at,
         CASE WHEN f.source_coverage_state='modern_governance_gap'
           THEN 'Historical source remains unrecovered; current gap remediation capability is installed in Test.'
           ELSE 'Historical source remains unrecovered; partial successor coverage remediation capability is installed in Test.' END,
         true
  FROM comind_pm.pm_governance_control_families f
  JOIN comind_pm.pm_projects p ON p.id=f.project_id AND p.project_key='COMIND'
  JOIN comind_pm.pm_governance_control_health h ON h.control_id=f.id
  WHERE f.layer0_section IN (3,4,6,7,10,11,13,15,17,19,24,27)
  ORDER BY f.layer0_section;
END;
$$;
REVOKE ALL ON FUNCTION comind_pm.refresh_rulebook_control_hud() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW comind_hud_test.v_rulebook_control_hud WITH (security_invoker=true) AS
SELECT control_key,layer0_section,family_name,source_coverage_state,remediation_state,health_state,
       requirements_total,verified_count,operational_count,open_exception_count,last_runtime_decision_at,
       last_checked_at,next_review_at,coverage_note,is_synthetic,refreshed_at
FROM comind_hud_test.rulebook_control_status WHERE is_synthetic;
REVOKE ALL ON comind_hud_test.v_rulebook_control_hud FROM PUBLIC, authenticated;
GRANT SELECT ON comind_hud_test.v_rulebook_control_hud TO anon;

CREATE OR REPLACE VIEW public.v_rulebook_control_hud_test WITH (security_invoker=true) AS
SELECT * FROM comind_hud_test.v_rulebook_control_hud WHERE is_synthetic;
REVOKE ALL ON public.v_rulebook_control_hud_test FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_rulebook_control_hud_test TO anon;

SELECT comind_pm.refresh_rulebook_control_hud();

DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname='comind-rulebook-control-health';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;
SELECT cron.schedule('comind-rulebook-control-health','*/15 * * * *','select comind_pm.refresh_rulebook_control_hud();');

COMMIT;
