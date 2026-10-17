-- LF-2 Foundry Agent substrate postdeployment contract.
-- Read-only. Verifies exact substrate/security delta without creating Agent evidence.

BEGIN READ ONLY;

WITH
target_relations(name) AS (
    VALUES
        ('comind.cm_foundry_agent_profile'),
        ('comind.cm_foundry_capability'),
        ('comind.cm_foundry_capability_grant'),
        ('comind.cm_foundry_authorization_request'),
        ('comind.cm_foundry_authorization_decision'),
        ('comind.cm_foundry_execution_context'),
        ('comind.cm_foundry_deliberation'),
        ('comind.cm_foundry_deliberation_participant'),
        ('comind.cm_foundry_deliberation_event'),
        ('comind.cm_foundry_deliberation_outcome'),
        ('comind.cm_foundry_recovery_checkpoint'),
        ('comind.cm_foundry_adapter_operation')
),
expected_indexes(name) AS (
    VALUES
        ('comind.idx_cm_foundry_capability_grant_active_project'),
        ('comind.idx_cm_foundry_capability_grant_active_global'),
        ('comind.idx_cm_foundry_execution_context_idempotency'),
        ('comind.idx_cm_foundry_deliberation_participant_unique'),
        ('comind.idx_cm_foundry_profile_org'),
        ('comind.idx_cm_foundry_authorization_request_project'),
        ('comind.idx_cm_foundry_execution_context_project'),
        ('comind.idx_cm_foundry_deliberation_project'),
        ('comind.idx_cm_foundry_adapter_operation_context')
),
expected_triggers(table_name, trigger_name) AS (
    VALUES
        ('cm_foundry_authorization_decision','trg_cm_foundry_authorization_decision_immutable'),
        ('cm_foundry_execution_context','trg_cm_foundry_execution_context_immutable'),
        ('cm_foundry_deliberation_event','trg_cm_foundry_deliberation_event_immutable'),
        ('cm_foundry_deliberation_outcome','trg_cm_foundry_deliberation_outcome_immutable'),
        ('cm_foundry_recovery_checkpoint','trg_cm_foundry_recovery_checkpoint_immutable'),
        ('cm_foundry_adapter_operation','trg_cm_foundry_adapter_operation_immutable')
),
expected_providers(provider_code) AS (
    VALUES
        ('google_gemini'),
        ('local_rtx5090'),
        ('openai'),
        ('railway'),
        ('replit'),
        ('supabase'),
        ('vercel')
),
actual_providers AS (
    SELECT provider_code::text FROM public.comind_service_providers
),
expected_registry(
    schema_name, relation_name, browser_read, admin_insert, admin_update,
    admin_delete, destructive_allowed, enabled
) AS (
    VALUES
        ('public','comments',true,true,true,false,false,true),
        ('public','operator_console_verification_records',false,true,true,true,true,true),
        ('public','posts',true,true,true,false,false,true),
        ('public','users',true,true,true,false,false,true)
),
actual_registry AS (
    SELECT schema_name, relation_name, browser_read, admin_insert, admin_update,
           admin_delete, destructive_allowed, enabled
    FROM public.operator_console_relation_registry
),
foundry_security AS (
    SELECT
        count(*) FILTER (WHERE c.relrowsecurity) AS rls_count,
        count(*) FILTER (WHERE NOT c.relrowsecurity) AS no_rls_count,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)) AS policy_table_count
    FROM target_relations t
    JOIN pg_class c ON c.oid = to_regclass(t.name)
),
client_exposure AS (
    SELECT count(*) AS exposed_count
    FROM target_relations t
    CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role_name)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_name)
    WHERE has_table_privilege(r.role_name, t.name, p.privilege_name)
),
service_role_privileges AS (
    SELECT
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'SELECT')) AS select_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'INSERT')) AS insert_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'UPDATE')) AS update_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'DELETE')) AS delete_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'TRUNCATE')) AS truncate_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'REFERENCES')) AS references_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', name, 'TRIGGER')) AS trigger_count
    FROM target_relations
),
foundry_rows AS (
    SELECT sum(row_count)::bigint AS total_rows
    FROM (
        SELECT (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %s', name), false, true, '')))[1]::text::bigint AS row_count
        FROM target_relations
    ) counts
),
mutation_guard AS (
    SELECT p.oid,
           p.prosecdef,
           EXISTS (
               SELECT 1
               FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
               WHERE setting = 'search_path=comind, public, pg_temp'
           ) AS fixed_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'comind'
      AND p.proname = 'cm_reject_foundry_substrate_mutation'
      AND p.pronargs = 0
),
trigger_state AS (
    SELECT count(*) AS expected_trigger_count
    FROM expected_triggers e
    JOIN pg_class c ON c.oid = to_regclass('comind.' || e.table_name)
    JOIN pg_trigger t ON t.tgrelid = c.oid
                     AND t.tgname = e.trigger_name
                     AND NOT t.tgisinternal
                     AND t.tgenabled <> 'D'
),
security_shape AS (
    SELECT
        (SELECT count(*)
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='comind'
           AND NOT EXISTS (
               SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) s(setting)
               WHERE setting LIKE 'search_path=%'
           )) AS mutable_search_path_count,
        (SELECT count(*)
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE c.relkind IN ('r','p')
           AND c.relrowsecurity
           AND n.nspname IN ('comind','public')
           AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) AS rls_no_policy_count
),
gates AS (
    SELECT
        current_database() = 'postgres' AS database_ok,
        current_setting('server_version') = '17.11' AS server_version_ok,
        (SELECT count(*) FROM target_relations WHERE to_regclass(name) IS NOT NULL) = 12 AS relations_exist_ok,
        (SELECT count(*) FROM expected_indexes WHERE to_regclass(name) IS NOT NULL) = 9 AS indexes_exist_ok,
        (SELECT count(*) FROM mutation_guard) = 1 AS mutation_guard_exists_ok,
        COALESCE((SELECT NOT prosecdef FROM mutation_guard), false) AS mutation_guard_invoker_ok,
        COALESCE((SELECT fixed_search_path FROM mutation_guard), false) AS mutation_guard_search_path_ok,
        has_function_privilege('service_role','comind.cm_reject_foundry_substrate_mutation()','EXECUTE') AS service_role_guard_execute_ok,
        NOT has_function_privilege('anon','comind.cm_reject_foundry_substrate_mutation()','EXECUTE') AS anon_guard_execute_denied_ok,
        NOT has_function_privilege('authenticated','comind.cm_reject_foundry_substrate_mutation()','EXECUTE') AS authenticated_guard_execute_denied_ok,
        (SELECT expected_trigger_count FROM trigger_state) = 6 AS immutable_triggers_ok,
        (SELECT rls_count FROM foundry_security) = 12 AND (SELECT no_rls_count FROM foundry_security) = 0 AS rls_all_ok,
        (SELECT policy_table_count FROM foundry_security) = 0 AS no_foundry_policies_ok,
        (SELECT exposed_count FROM client_exposure) = 0 AS client_roles_denied_ok,
        (SELECT select_count FROM service_role_privileges) = 12 AS service_role_select_ok,
        (SELECT insert_count FROM service_role_privileges) = 12 AS service_role_insert_ok,
        (SELECT update_count FROM service_role_privileges) = 0 AS service_role_update_not_delegated_ok,
        (SELECT delete_count FROM service_role_privileges) = 0 AS service_role_delete_not_delegated_ok,
        (SELECT truncate_count FROM service_role_privileges) = 0 AS service_role_truncate_not_delegated_ok,
        (SELECT references_count FROM service_role_privileges) = 0 AS service_role_references_not_delegated_ok,
        (SELECT trigger_count FROM service_role_privileges) = 0 AS service_role_trigger_not_delegated_ok,
        COALESCE((SELECT total_rows FROM foundry_rows), -1) = 0 AS no_foundry_rows_seeded_ok,
        (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE name='live_foundry_lf2_agent_substrate_v1') = 1 AS migration_recorded_once_ok,
        NOT EXISTS (
            (SELECT * FROM expected_providers EXCEPT SELECT * FROM actual_providers)
            UNION ALL
            (SELECT * FROM actual_providers EXCEPT SELECT * FROM expected_providers)
        ) AS providers_unchanged_ok,
        NOT EXISTS (
            (SELECT * FROM expected_registry EXCEPT SELECT * FROM actual_registry)
            UNION ALL
            (SELECT * FROM actual_registry EXCEPT SELECT * FROM expected_registry)
        ) AS operator_console_registry_unchanged_ok,
        (SELECT count(*) FROM comind.cm_org) = 1 AS cm_org_count_ok,
        (SELECT count(*) FROM comind.cm_project) = 1 AS cm_project_count_ok,
        (SELECT count(*) FROM comind.cm_actor) = 1 AS cm_actor_count_ok,
        (SELECT count(*) FROM comind.cm_agent) = 0 AS cm_agent_count_ok,
        (SELECT count(*) FROM comind.cm_agent_run) = 0 AS cm_agent_run_count_ok,
        (SELECT count(*) FROM comind.cm_agent_step) = 0 AS cm_agent_step_count_ok,
        (SELECT count(*) FROM comind.cm_tool_call) = 0 AS cm_tool_call_count_ok,
        (SELECT count(*) FROM comind.cm_conversation) = 0 AS cm_conversation_count_ok,
        (SELECT count(*) FROM comind.cm_message) = 0 AS cm_message_count_ok,
        (SELECT count(*) FROM comind.cm_task) = 0 AS cm_task_count_ok,
        (SELECT count(*) FROM comind.cm_milestone) = 0 AS cm_milestone_count_ok,
        (SELECT count(*) FROM comind.cm_doc) = 0 AS cm_doc_count_ok,
        (SELECT count(*) FROM comind.cm_evidence) = 0 AS cm_evidence_count_ok,
        (SELECT count(*) FROM comind_pm.pm_agent_runs) = 0 AS pm_agent_runs_count_ok,
        (SELECT count(*) FROM comind_pm.pm_work_items) = 3 AS pm_work_items_count_ok,
        (SELECT count(*) FROM comind.cm_budget_authority_binding) = 0 AS budget_binding_count_ok,
        (SELECT count(*) FROM comind.cm_budget_authority_reservation) = 0 AS budget_reservation_count_ok,
        (SELECT count(*) FROM comind.cm_budget_authority_telemetry) = 0 AS budget_telemetry_count_ok,
        (SELECT mutable_search_path_count FROM security_shape) = 7 AS known_warn_shape_ok,
        (SELECT rls_no_policy_count FROM security_shape) = 27 AS expected_info_shape_ok
),
contract AS (
    SELECT to_jsonb(gates) AS checks FROM gates
)
SELECT jsonb_build_object(
    'lf2_contract_pass', NOT EXISTS (
        SELECT 1
        FROM contract,
        LATERAL jsonb_each_text(checks) AS c(key, value)
        WHERE value <> 'true'
    ),
    'project_ref', 'sbgfuanxiqepcoboxzcl',
    'live_migration_name', 'live_foundry_lf2_agent_substrate_v1',
    'checks', checks
) AS live_foundry_lf2_postdeploy
FROM contract;

COMMIT;
