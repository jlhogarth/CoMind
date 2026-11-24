-- Isolated Railway AED-CRP Test fixture. This is not the full Foundry schema.
-- It supplies only the canonical lease migration's existing prerequisites.
BEGIN;
DO $$ BEGIN
  IF to_regrole('service_role') IS NULL THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS comind;
CREATE TABLE IF NOT EXISTS comind.cm_task (
  task_id uuid PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('todo','blocked','in_progress','done')),
  priority integer NOT NULL DEFAULT 100
);
CREATE OR REPLACE FUNCTION comind.cm_reject_foundry_substrate_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = comind, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Foundry substrate provenance is append-only';
END;
$$;
COMMIT;
