-- LF-2 isolated runtime-role proof.
-- Requires an isolated fixture where service_role models Supabase BYPASSRLS.
-- All probe rows are rolled back.

BEGIN;

DO $$
DECLARE
    v_table text;
BEGIN
    IF NOT COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'), false) THEN
        RAISE EXCEPTION 'LF-2 service_role verification requires BYPASSRLS to model live Supabase';
    END IF;

    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_agent_profile',
        'cm_foundry_capability',
        'cm_foundry_capability_grant',
        'cm_foundry_authorization_request',
        'cm_foundry_authorization_decision',
        'cm_foundry_execution_context',
        'cm_foundry_deliberation',
        'cm_foundry_deliberation_participant',
        'cm_foundry_deliberation_event',
        'cm_foundry_deliberation_outcome',
        'cm_foundry_recovery_checkpoint',
        'cm_foundry_adapter_operation'
    ] LOOP
        IF NOT has_table_privilege('service_role', 'comind.' || v_table, 'SELECT') THEN
            RAISE EXCEPTION 'service_role lacks SELECT on comind.%', v_table;
        END IF;
        IF NOT has_table_privilege('service_role', 'comind.' || v_table, 'INSERT') THEN
            RAISE EXCEPTION 'service_role lacks INSERT on comind.%', v_table;
        END IF;
        IF has_table_privilege('service_role', 'comind.' || v_table, 'UPDATE')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'DELETE')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'TRUNCATE')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'REFERENCES')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'TRIGGER') THEN
            RAISE EXCEPTION 'service_role has an LF-2 table privilege outside SELECT/INSERT on comind.%', v_table;
        END IF;
    END LOOP;
END;
$$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_capability_id uuid;
    v_code text := 'lf2_service_role_probe_' || replace(gen_random_uuid()::text, '-', '');
    v_blocked boolean;
BEGIN
    INSERT INTO comind.cm_foundry_capability (
        capability_code, description, action, target_kind,
        max_authority, risk_class, cost_bearing, adapter
    ) VALUES (
        v_code,
        'LF-2 isolated service-role privilege probe.',
        'read',
        'lf2_probe',
        'C0',
        'low',
        false,
        'lf2_probe'
    )
    RETURNING capability_id INTO v_capability_id;

    IF NOT EXISTS (
        SELECT 1 FROM comind.cm_foundry_capability
        WHERE capability_id = v_capability_id
    ) THEN
        RAISE EXCEPTION 'service_role could not read its LF-2 probe row';
    END IF;

    v_blocked := false;
    BEGIN
        UPDATE comind.cm_foundry_capability
        SET description = 'update must remain undelegated'
        WHERE capability_id = v_capability_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'service_role UPDATE unexpectedly succeeded on LF-2 substrate';
    END IF;

    v_blocked := false;
    BEGIN
        DELETE FROM comind.cm_foundry_capability
        WHERE capability_id = v_capability_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'service_role DELETE unexpectedly succeeded on LF-2 substrate';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

SELECT 'pass' AS status, 'LF-2 service_role least-privilege verification passed' AS detail;
