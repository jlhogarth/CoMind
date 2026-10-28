\set ON_ERROR_STOP on

DO $$
DECLARE
    v_security_invoker boolean;
    v_public_acl aclitem[];
BEGIN
    IF to_regclass('comind.cm_paid_api_reconciliation_pending_v') IS NULL THEN
        RAISE EXCEPTION 'Missing comind.cm_paid_api_reconciliation_pending_v';
    END IF;

    SELECT COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false), c.relacl
    INTO v_security_invoker, v_public_acl
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
BEGIN
    SELECT pg_get_viewdef('comind.cm_paid_api_reconciliation_pending_v'::regclass, true)
    INTO v_definition;

    IF v_definition NOT ILIKE '%comind.cm_paid_api_execution%'
       OR v_definition NOT ILIKE '%public.comind_cost_reservations%'
       OR v_definition NOT ILIKE '%public.comind_usage_events%'
       OR v_definition NOT ILIKE '%provider_execution%'
       OR v_definition NOT ILIKE '%finalized%'
       OR v_definition NOT ILIKE '%reconciled%' THEN
        RAISE EXCEPTION 'Reconciliation-pending view is missing required authoritative settlement/reconciliation predicates: %', v_definition;
    END IF;
END;
$$;

SELECT
    'CINT-FINOPS-003 reconciliation observability verification passed' AS result;
