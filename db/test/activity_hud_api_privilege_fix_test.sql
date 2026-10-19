-- Tighten the Activity HUD Test browser role to SELECT only.
-- Apply only to the CoMind Test project or disposable PostgreSQL 17.

BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  comind_hud_test.activity_runs,
  comind_hud_test.activity_observations
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.v_activity_hud_test FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_activity_hud_test TO anon;

COMMIT;
