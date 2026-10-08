\set ON_ERROR_STOP on

DO $$
DECLARE
    v_count INTEGER;
    v_missing TEXT[];
BEGIN
    SELECT count(*)::int
    INTO v_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Found % comind tables without RLS enabled', v_count;
    END IF;

    SELECT count(*)::int
    INTO v_count
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND (
          COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') = 'true'
          OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') = 'true'
      );

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Found % unconditional TRUE policies in comind schema', v_count;
    END IF;

    WITH required(name, identity_args) AS (
        VALUES
            ('set_updated_at', ''),
            ('fn_belief_update_beta', 'p_belief_id uuid, p_obs_bool boolean, p_evidence jsonb'),
            ('fn_create_causal_node_from_memory', 'p_memory_id uuid, p_kind text, p_title text'),
            ('set_current_actor', 'p_actor uuid'),
            ('current_actor', ''),
            ('set_updated_at_checklist', ''),
            ('set_updated_at_research_refs', '')
    )
    SELECT array_agg(r.name ORDER BY r.name)
    INTO v_missing
    FROM required r
    LEFT JOIN pg_catalog.pg_proc p
      ON p.proname = r.name
    LEFT JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace
     AND n.nspname = 'comind'
    WHERE p.oid IS NULL
       OR pg_get_function_identity_arguments(p.oid) <> r.identity_args
       OR NOT ('search_path=comind, public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::text[])));

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Required fixed search_path missing or incorrect for functions: %', v_missing;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        SELECT count(*)::int
        INTO v_count
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'comind'
          AND c.relkind IN ('r', 'p')
          AND has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
        IF v_count <> 0 THEN
            RAISE EXCEPTION 'anon retains privileges on % comind tables', v_count;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        SELECT count(*)::int
        INTO v_count
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'comind'
          AND c.relkind IN ('r', 'p')
          AND has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
        IF v_count <> 0 THEN
            RAISE EXCEPTION 'authenticated retains privileges on % comind tables', v_count;
        END IF;
    END IF;
END;
$$;

SELECT
    'pass' AS verification_status,
    count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled_tables,
    count(*) AS total_comind_tables
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'comind'
  AND c.relkind IN ('r', 'p');