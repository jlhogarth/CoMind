-- Issue #158: deterministic verification for lease RPC ACL and search-path hardening.
DO $$
DECLARE
    v_role text;
    v_function regprocedure;
    v_search_path text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_schema_privilege(v_role, 'comind', 'USAGE') THEN
            RAISE EXCEPTION '% unexpectedly has comind schema USAGE', v_role;
        END IF;
    END LOOP;

    FOREACH v_function IN ARRAY ARRAY[
        'comind.cm_foundry_claim_work(text,integer)'::regprocedure,
        'comind.cm_foundry_renew_work(uuid,text,uuid,bigint,integer)'::regprocedure,
        'comind.cm_foundry_finish_work(uuid,text,uuid,bigint,boolean)'::regprocedure
    ] LOOP
        IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'anon unexpectedly has EXECUTE on %', v_function;
        END IF;
        IF has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'authenticated unexpectedly has EXECUTE on %', v_function;
        END IF;
        IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role lacks EXECUTE on %', v_function;
        END IF;

        SELECT split_part(setting, '=', 2)
          INTO v_search_path
          FROM unnest(coalesce((SELECT proconfig FROM pg_proc WHERE oid = v_function::oid), ARRAY[]::text[])) setting
         WHERE setting LIKE 'search_path=%';

        IF replace(coalesce(v_search_path, ''), ' ', '') <> 'pg_catalog,comind' THEN
            RAISE EXCEPTION 'unexpected search_path for %: %', v_function, v_search_path;
        END IF;
    END LOOP;
END;
$$;
