\set ON_ERROR_STOP on

DO $$
DECLARE
    v_cap record;
    v_function text;
    v_rls boolean;
    v_trigger_count integer;
BEGIN
    IF to_regclass('comind.cm_mdo_plan_disposition_event') IS NULL
       OR to_regclass('comind.cm_mdo_plan_disposition_evidence') IS NULL THEN
        RAISE EXCEPTION 'MDO-004 disposition tables are missing';
    END IF;

    SELECT capability_code, target_kind, max_authority, risk_class, cost_bearing, adapter
    INTO v_cap
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'mdo.plan.disposition';

    IF NOT FOUND
       OR v_cap.target_kind <> 'module_plan'
       OR v_cap.max_authority <> 'C2'
       OR v_cap.cost_bearing IS DISTINCT FROM false
       OR v_cap.adapter <> 'mdo' THEN
        RAISE EXCEPTION 'MDO-004 disposition capability contract is incorrect';
    END IF;

    SELECT relrowsecurity INTO v_rls
    FROM pg_class
    WHERE oid = 'comind.cm_mdo_plan_disposition_event'::regclass;
    IF v_rls IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'MDO-004 disposition event RLS is not enabled';
    END IF;

    SELECT relrowsecurity INTO v_rls
    FROM pg_class
    WHERE oid = 'comind.cm_mdo_plan_disposition_evidence'::regclass;
    IF v_rls IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'MDO-004 disposition evidence RLS is not enabled';
    END IF;

    IF has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_event', 'SELECT')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_event', 'SELECT')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_event', 'INSERT')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_event', 'INSERT')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_event', 'UPDATE')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_event', 'UPDATE')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_event', 'DELETE')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_event', 'DELETE') THEN
        RAISE EXCEPTION 'MDO-004 disposition event is exposed to client roles';
    END IF;

    IF has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_evidence', 'SELECT')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_evidence', 'SELECT')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_evidence', 'INSERT')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_evidence', 'INSERT')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_evidence', 'UPDATE')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_evidence', 'UPDATE')
       OR has_table_privilege('anon', 'comind.cm_mdo_plan_disposition_evidence', 'DELETE')
       OR has_table_privilege('authenticated', 'comind.cm_mdo_plan_disposition_evidence', 'DELETE') THEN
        RAISE EXCEPTION 'MDO-004 disposition evidence is exposed to client roles';
    END IF;

    IF has_function_privilege('anon', 'comind.cm_mdo_dispose_plan(uuid,text,uuid,uuid,text,text,uuid,text,uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'comind.cm_mdo_dispose_plan(uuid,text,uuid,uuid,text,text,uuid,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'MDO-004 disposition function is exposed to client roles';
    END IF;
    IF NOT has_function_privilege('service_role', 'comind.cm_mdo_dispose_plan(uuid,text,uuid,uuid,text,text,uuid,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'MDO-004 service_role cannot execute governed disposition function';
    END IF;

    SELECT count(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid IN (
          'comind.cm_mdo_plan_disposition_event'::regclass,
          'comind.cm_mdo_plan_disposition_evidence'::regclass
      )
      AND tgname IN (
          'trg_cm_mdo_plan_disposition_event_immutable',
          'trg_cm_mdo_plan_disposition_evidence_immutable'
      );
    IF v_trigger_count <> 2 THEN
        RAISE EXCEPTION 'MDO-004 append-only disposition triggers are incomplete';
    END IF;

    SELECT pg_get_functiondef(
        'comind.cm_mdo_dispose_plan(uuid,text,uuid,uuid,text,text,uuid,text,uuid[])'::regprocedure
    ) INTO v_function;

    IF position('mdo.plan.disposition' in v_function) = 0
       OR position('authority_level <> ''C2''' in v_function) = 0
       OR position('environment <> ''isolated''' in v_function) = 0
       OR position('target_kind <> ''module_plan''' in v_function) = 0
       OR position('terminal_status = ''succeeded''' in v_function) = 0
       OR position('v_task_count <> 10' in v_function) = 0
       OR position('v_contribution_count <> 10' in v_function) = 0
       OR position('v_successor.version <= v_plan.version' in v_function) = 0
       OR position('UPDATE comind.cm_mdo_plan' in v_function) = 0 THEN
        RAISE EXCEPTION 'MDO-004 governed disposition function is missing required fail-closed controls';
    END IF;

    IF position('UPDATE comind.cm_module_registry' in v_function) > 0
       OR position('INSERT INTO comind.cm_module_registry' in v_function) > 0
       OR position('DELETE FROM comind.cm_module_registry' in v_function) > 0 THEN
        RAISE EXCEPTION 'MDO-004 disposition function must not mutate module maturity/identity';
    END IF;
END;
$$;

SELECT 'pass' AS result,
       'mdo-004' AS lane,
       'c2_exact_plan=true' AS authority,
       'append_only=true' AS provenance,
       'complete_plan_gate=true' AS completeness,
       'supersession_gate=true' AS supersession,
       'module_maturity_unchanged=true' AS maturity,
       'client_write_denied=true' AS security;
