-- MDO-002 terminal-alignment verification.
-- Fails if contribution acceptance still depends on the legacy closed_at header
-- or if the matching terminal adapter-result requirement is missing.

DO $$
DECLARE
    v_def text;
BEGIN
    SELECT pg_get_functiondef(
        'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])'::regprocedure
    ) INTO v_def;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'MDO contribution function is missing';
    END IF;

    IF position('ec.closed_at IS NOT NULL' in v_def) > 0 THEN
        RAISE EXCEPTION 'MDO contribution gate still depends on legacy execution_context.closed_at';
    END IF;

    IF position('cm_foundry_adapter_operation_result' in v_def) = 0
       OR position('adapter_operation_result_id = eo.adapter_operation_result_id' in v_def) = 0
       OR position('eo.terminal_status = ''succeeded''' in v_def) = 0
       OR position('aor.terminal_status = ''succeeded''' in v_def) = 0 THEN
        RAISE EXCEPTION 'MDO contribution gate is missing canonical terminal Foundry evidence checks';
    END IF;

    IF has_function_privilege(
        'anon',
        'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'MDO contribution function must remain unavailable to client roles';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'MDO contribution function must remain executable by service_role';
    END IF;
END;
$$;

SELECT 'pass|mdo-002-terminal-alignment|canonical_outcome=true|matching_adapter_result=true|legacy_closed_at=false|client_execute=false';
