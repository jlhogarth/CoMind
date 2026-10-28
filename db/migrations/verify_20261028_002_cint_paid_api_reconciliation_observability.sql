\set ON_ERROR_STOP on

DO $$
DECLARE
    v_security_invoker boolean;
BEGIN
    IF to_regclass('comind.cm_paid_api_reconciliation_pending_v') IS NULL THEN
        RAISE EXCEPTION 'Missing comind.cm_paid_api_reconciliation_pending_v';
    END IF;

    SELECT COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false)
    INTO v_security_invoker
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relname = 'cm_paid_api_reconciliation_pending_v'
      AND c.relkind = 'v';

    IF NOT v_security_invoker THEN
        RAISE EXCEPTION 'cm_paid_api_reconciliation_pending_v must use security_invoker=true';
    END IF;

    IF has_table_privilege('public', 'comind.cm_paid_api_reconciliation_pending_v', 'SELECT') THEN
        RAISE EXCEPTION 'PUBLIC must not have SELECT on cm_paid_api_reconciliation_pending_v';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND has_table_privilege('anon', 'comind.cm_paid_api_reconciliation_pending_v', 'SELECT') THEN
        RAISE EXCEPTION 'anon must not have SELECT on cm_paid_api_reconciliation_pending_v';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       AND has_table_privilege('authenticated', 'comind.cm_paid_api_reconciliation_pending_v', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must not have SELECT on cm_paid_api_reconciliation_pending_v';
    END IF;
END;
$$;

DO $$
DECLARE
    v_definition text;
    v_missing_dependency text;
BEGIN
    SELECT pg_get_viewdef('comind.cm_paid_api_reconciliation_pending_v'::regclass, true)
    INTO v_definition;

    IF v_definition NOT ILIKE '%provider_execution%'
       OR v_definition NOT ILIKE '%finalized%'
       OR v_definition NOT ILIKE '%reconciled%' THEN
        RAISE EXCEPTION 'Reconciliation-pending view is missing required settlement/reconciliation predicates: %', v_definition;
    END IF;

    SELECT required.qualified_name
    INTO v_missing_dependency
    FROM (
        VALUES
            ('comind', 'cm_paid_api_execution', 'comind.cm_paid_api_execution'),
            ('comind', 'cm_paid_api_access_proposal', 'comind.cm_paid_api_access_proposal'),
            ('comind', 'cm_api_cost_receipt', 'comind.cm_api_cost_receipt'),
            ('public', 'comind_cost_reservations', 'public.comind_cost_reservations'),
            ('public', 'comind_usage_events', 'public.comind_usage_events'),
            ('public', 'comind_service_providers', 'public.comind_service_providers')
    ) AS required(schema_name, relation_name, qualified_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_rewrite AS rw
        JOIN pg_class AS view_class ON view_class.oid = rw.ev_class
        JOIN pg_namespace AS view_ns ON view_ns.oid = view_class.relnamespace
        JOIN pg_depend AS dep ON dep.objid = rw.oid
        JOIN pg_class AS referenced_class ON referenced_class.oid = dep.refobjid
        JOIN pg_namespace AS referenced_ns ON referenced_ns.oid = referenced_class.relnamespace
        WHERE view_ns.nspname = 'comind'
          AND view_class.relname = 'cm_paid_api_reconciliation_pending_v'
          AND referenced_ns.nspname = required.schema_name
          AND referenced_class.relname = required.relation_name
    )
    LIMIT 1;

    IF v_missing_dependency IS NOT NULL THEN
        RAISE EXCEPTION 'Reconciliation-pending view is missing required relation dependency: %', v_missing_dependency;
    END IF;
END;
$$;

SELECT
    'CINT-FINOPS-003 reconciliation observability verification passed' AS result;
