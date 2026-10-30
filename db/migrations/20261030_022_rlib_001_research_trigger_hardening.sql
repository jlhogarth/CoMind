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

REVOKE ALL ON FUNCTION comind.set_updated_at_research_refs() FROM PUBLIC, anon, authenticated;

COMMIT;
