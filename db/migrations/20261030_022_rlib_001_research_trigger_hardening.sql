BEGIN;

CREATE OR REPLACE FUNCTION comind.set_updated_at_research_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION comind.set_updated_at_research_refs() IS
  'Maintains cm_research_refs.updated_at with a fixed search_path. SECURITY INVOKER preserves caller authority.';

REVOKE ALL ON FUNCTION comind.set_updated_at_research_refs() FROM PUBLIC;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION comind.set_updated_at_research_refs() FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
