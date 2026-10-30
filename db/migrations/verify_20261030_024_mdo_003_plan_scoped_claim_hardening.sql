-- MDO-003 plan-scoped claim hardening verification.
-- Fails if MDO claiming can ignore canonical Foundry target_refs scope.

DO $$
DECLARE
    v_def text;
BEGIN
    SELECT pg_get_functiondef(
        'comind.cm_mdo_claim_work(uuid,text,integer)'::regprocedure
    ) INTO v_def;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'MDO claim function is missing';
    END IF;

    IF position('g.scope ? ''target_refs''' in v_def) = 0
       OR position('jsonb_typeof(g.scope->''target_refs'') = ''array''' in v_def) = 0
       OR position('jsonb_array_length(g.scope->''target_refs'') > 0' in v_def) = 0
       OR position('(g.scope->''target_refs'') ? mp.plan_id::text' in v_def) = 0 THEN
        RAISE EXCEPTION 'MDO claimant is missing exact-plan target_refs enforcement';
    END IF;

    IF position('g.scope ? ''module_ids''' in v_def) = 0
       OR position('(g.scope->''module_ids'') ? mp.module_id::text' in v_def) = 0 THEN
        RAISE EXCEPTION 'MDO claimant no longer preserves accepted module_ids restriction compatibility';
    END IF;

    IF has_function_privilege(
        'anon',
        'comind.cm_mdo_claim_work(uuid,text,integer)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'comind.cm_mdo_claim_work(uuid,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'MDO claim function must remain unavailable to client roles';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'comind.cm_mdo_claim_work(uuid,text,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'MDO claim function must remain executable by service_role';
    END IF;
END;
$$;

SELECT 'pass|mdo-003-plan-scoped-claim|target_refs=true|empty_target_refs_fail_closed=true|module_ids_compatible=true|client_execute=false';
