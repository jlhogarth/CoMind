-- CoMind Foundry security prerequisites
-- Version: 1.0.0
-- Date: 2026-10-08
-- Scope: repository-controlled isolated PostgreSQL hardening only. No live Supabase mutation.

BEGIN;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'comind'
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
    LOOP
        EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY', r.relname);
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM PUBLIC', r.relname);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM anon', r.relname);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM authenticated', r.relname);
        END IF;
    END LOOP;
END;
$$;

-- Remove broad scaffold policies that granted unconditional access.
DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN
        SELECT n.nspname, c.relname, pol.polname
        FROM pg_catalog.pg_policy pol
        JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'comind'
          AND (
              COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') = 'true'
              OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') = 'true'
          )
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', p.polname, p.nspname, p.relname);
    END LOOP;
END;
$$;

ALTER FUNCTION comind.set_updated_at()
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.fn_belief_update_beta(uuid, boolean, jsonb)
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.fn_create_causal_node_from_memory(uuid, text, text)
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.set_current_actor(uuid)
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.current_actor()
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.set_updated_at_checklist()
    SET search_path = comind, public, pg_temp;
ALTER FUNCTION comind.set_updated_at_research_refs()
    SET search_path = comind, public, pg_temp;

COMMIT;