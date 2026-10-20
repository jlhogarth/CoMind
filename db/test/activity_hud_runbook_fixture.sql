-- Synthetic source contract for the Activity HUD PostgreSQL 17 CI workflow.
-- This creates only the columns exposed by the canonical RunBook timeline view.
-- It does not model or infer a PM, Foundry, lane, or human-action crosswalk.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$roles$;

CREATE SCHEMA comind_pm;
CREATE VIEW comind_pm.v_runbook_timeline AS
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid AS event_id,
  now() AS occurred_at,
  'COMIND'::text AS project_key,
  'CoMind synthetic CI fixture'::text AS project_name,
  NULL::text AS work_key,
  NULL::text AS work_item_title,
  NULL::text AS item_type,
  'test'::text AS event_type,
  'Activity HUD CI'::text AS actor,
  'system'::text AS actor_type,
  'Synthetic RunBook fixture row'::text AS action_summary,
  'Source projection contract fixture only'::text AS result_summary,
  'pass'::text AS outcome,
  NULL::text AS status_from,
  NULL::text AS status_to,
  NULL::text AS next_action,
  false AS consequential,
  'manual'::text AS source_system,
  'synthetic://activity-hud/runbook'::text AS source_ref,
  '[]'::jsonb AS evidence,
  '{}'::jsonb AS details,
  now() AS created_at;
