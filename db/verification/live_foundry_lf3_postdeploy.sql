-- LF-3 migration 007 postdeployment contract.
-- Read-only verification. It does not repair or mutate state.

BEGIN READ ONLY;

WITH
baseline_ledger(version, name) AS (
    VALUES
        ('20261005213616', 'comind_base_v2_initial_build'),
        ('20261006051527', 'comind_pm_ledger_maintenance_package_v0_1'),
        ('20261006051627', 'comind_pm_ledger_hardening_v0_1_1'),
        ('20261015211851', 'operator_console_live_activation_v0_2'),
        ('20261015212201', 'operator_console_service_role_least_privilege_v0_2_1'),
        ('20261015212719', 'operator_console_explicit_deny_policies_v0_2_2'),
        ('20261016031254', 'live_foundry_stage1_finops_current_runtime_projection_v1'),
        ('20261016031412', 'live_foundry_stage1_paid_provider_budget_authority_hardening_v1'),
        ('20261016031511', 'live_foundry_stage1_current_runtime_budget_authority_adapter_v1'),
        ('20261016031947', 'live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1'),
        ('20261016032259', 'live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1'),
        ('20261016032328', 'live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1'),
        ('20261017002923', 'live_foundry_lf2_agent_substrate_v1')
),
target_functions(name, identity_args) AS (
    VALUES
        ('set_updated_at',''),
        ('fn_belief_update_beta','p_belief_id uuid, p_obs_bool boolean, p_evidence jsonb'),
        ('fn_create_causal_node_from_memory','p_memory_id uuid, p_kind text, p_title text'),
        ('set_current_actor','p_actor uuid'),
        ('current_actor',''),
        ('set_updated_at_checklist',''),
        ('set_updated_at_research_refs','')
),
comind_tables AS (
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relkind IN ('r','p')
),
expected_providers(provider_code) AS (
    VALUES ('google_gemini'),('local_rtx5090'),('openai'),('railway'),('replit'),('supabase'),('vercel')
),
actual_providers AS (
    SELECT provider_code::text FROM public.comind_service_providers
),
expected_registry(schema_name, relation_name, browser_read, admin_insert, admin_update, admin_delete, destructive_allowed, enabled) AS (
    VALUES
        ('public','comments',true,true,true,false,false,true),
        ('public','operator_console_verification_records',false,true,true,true,true,true),
        ('public','posts',true,true,true,false,false,true),
        ('public','users',true,true,true,false,false,true)
),
actual_registry AS (
    SELECT schema_name, relation_name, browser_read, admin_insert, admin_update, admin_delete, destructive_allowed, enabled
    FROM public.operator_console_relation_registry
),
client_exposure AS (
    SELECT count(*) AS exposed_count
    FROM comind_tables t
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_name)
    WHERE has_table_privilege(r.role_name, t.oid, p.privilege_name)
),
service_role_shape AS (
    SELECT
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'SELECT')) AS select_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'INSERT')) AS insert_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'UPDATE')) AS update_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'DELETE')) AS delete_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'TRUNCATE')) AS truncate_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'REFERENCES')) AS references_count,
        count(*) FILTER (WHERE has_table_privilege('service_role', oid, 'TRIGGER')) AS trigger_count
    FROM comind_tables
),
function_shape AS (
    SELECT
        count(*) AS target_count,
        count(*) FILTER (WHERE p.prosecdef IS FALSE) AS invoker_count,
        count(*) FILTER (WHERE p.proacl IS NULL) AS default_acl_count,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) s(setting) WHERE setting='search_path=comind, public, pg_temp')) AS fixed_path_count
    FROM target_functions t
    JOIN pg_proc p ON p.proname=t.name AND pg_get_function_identity_arguments(p.oid)=t.identity_args
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='comind'
),
security_shape AS (
    SELECT
        (SELECT count(*) FROM comind_tables) AS table_count,
        (SELECT count(*) FROM comind_tables WHERE relrowsecurity) AS rls_count,
        (SELECT count(*) FROM comind_tables WHERE NOT relrowsecurity) AS no_rls_count,
        (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='comind') AS policy_count,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='comind' AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) s(setting) WHERE setting LIKE 'search_path=%')) AS mutable_search_path_count,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND c.relrowsecurity AND n.nspname IN ('comind','public') AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) AS rls_no_policy_count
),
gates AS (
    SELECT
        current_database()='postgres' AS database_ok,
        current_setting('server_version')='17.11' AS server_version_ok,
        (SELECT count(*) FROM supabase_migrations.schema_migrations)=14 AS migration_ledger_count_ok,
        NOT EXISTS (SELECT * FROM baseline_ledger EXCEPT SELECT version,name FROM supabase_migrations.schema_migrations) AS baseline_ledger_preserved_ok,
        (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE name='live_foundry_lf3_security_prerequisites_v1')=1 AS lf3_migration_recorded_once_ok,
        (SELECT table_count FROM security_shape)=94 AS comind_table_count_ok,
        (SELECT rls_count FROM security_shape)=94 AND (SELECT no_rls_count FROM security_shape)=0 AS all_current_comind_tables_rls_ok,
        (SELECT policy_count FROM security_shape)=0 AS no_comind_policies_ok,
        (SELECT mutable_search_path_count FROM security_shape)=0 AS no_mutable_comind_function_search_paths_ok,
        (SELECT rls_no_policy_count FROM security_shape)=106 AS expected_rls_no_policy_catalog_shape_ok,
        (SELECT target_count FROM function_shape)=7 AND (SELECT fixed_path_count FROM function_shape)=7 AS target_function_search_paths_fixed_ok,
        (SELECT invoker_count FROM function_shape)=7 AS target_functions_remain_security_invoker_ok,
        (SELECT default_acl_count FROM function_shape)=7 AS target_function_execute_acl_unchanged_ok,
        (SELECT exposed_count FROM client_exposure)=0 AS client_roles_fail_closed_ok,
        (SELECT select_count FROM service_role_shape)=15 AND (SELECT insert_count FROM service_role_shape)=15 AS service_role_select_insert_shape_preserved_ok,
        (SELECT update_count FROM service_role_shape)=0 AND (SELECT delete_count FROM service_role_shape)=0 AND (SELECT truncate_count FROM service_role_shape)=0 AND (SELECT references_count FROM service_role_shape)=0 AND (SELECT trigger_count FROM service_role_shape)=0 AS service_role_no_broader_table_authority_ok,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') IS TRUE AS service_role_bypassrls_preserved_ok,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname='postgres') IS TRUE AS postgres_bypassrls_preserved_ok,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname='anon') IS FALSE AND (SELECT rolbypassrls FROM pg_roles WHERE rolname='authenticated') IS FALSE AS ordinary_roles_no_bypassrls_ok,
        NOT has_schema_privilege('anon','comind','USAGE') AND NOT has_schema_privilege('authenticated','comind','USAGE') AS ordinary_roles_no_comind_usage_ok,
        has_schema_privilege('service_role','comind','USAGE') AS service_role_comind_usage_ok,
        (SELECT count(*) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='comind')=0 AS default_acl_shape_unchanged_ok,
        NOT EXISTS ((SELECT * FROM expected_providers EXCEPT SELECT * FROM actual_providers) UNION ALL (SELECT * FROM actual_providers EXCEPT SELECT * FROM expected_providers)) AS providers_unchanged_ok,
        NOT EXISTS ((SELECT * FROM expected_registry EXCEPT SELECT * FROM actual_registry) UNION ALL (SELECT * FROM actual_registry EXCEPT SELECT * FROM expected_registry)) AS operator_console_registry_unchanged_ok,
        (SELECT count(*) FROM comind.cm_org)=1 AND (SELECT count(*) FROM comind.cm_project)=1 AND (SELECT count(*) FROM comind.cm_actor)=1 AND (SELECT count(*) FROM comind_pm.pm_work_items)=3 AS protected_nonzero_counts_ok,
        (SELECT count(*) FROM comind.cm_agent)=0 AND (SELECT count(*) FROM comind.cm_agent_run)=0 AND (SELECT count(*) FROM comind.cm_agent_step)=0 AND (SELECT count(*) FROM comind.cm_tool_call)=0 AND (SELECT count(*) FROM comind.cm_conversation)=0 AND (SELECT count(*) FROM comind.cm_message)=0 AND (SELECT count(*) FROM comind.cm_task)=0 AND (SELECT count(*) FROM comind.cm_milestone)=0 AND (SELECT count(*) FROM comind.cm_doc)=0 AND (SELECT count(*) FROM comind.cm_evidence)=0 AND (SELECT count(*) FROM comind_pm.pm_agent_runs)=0 AS protected_zero_counts_ok,
        (SELECT count(*) FROM comind.cm_budget_authority_binding)=0 AND (SELECT count(*) FROM comind.cm_budget_authority_reservation)=0 AND (SELECT count(*) FROM comind.cm_budget_authority_telemetry)=0 AS budget_authority_rows_zero_ok,
        (SELECT count(*) FROM comind.cm_foundry_agent_profile)=0 AND (SELECT count(*) FROM comind.cm_foundry_capability)=0 AND (SELECT count(*) FROM comind.cm_foundry_capability_grant)=0 AND (SELECT count(*) FROM comind.cm_foundry_authorization_request)=0 AND (SELECT count(*) FROM comind.cm_foundry_authorization_decision)=0 AND (SELECT count(*) FROM comind.cm_foundry_execution_context)=0 AND (SELECT count(*) FROM comind.cm_foundry_deliberation)=0 AND (SELECT count(*) FROM comind.cm_foundry_deliberation_participant)=0 AND (SELECT count(*) FROM comind.cm_foundry_deliberation_event)=0 AND (SELECT count(*) FROM comind.cm_foundry_deliberation_outcome)=0 AND (SELECT count(*) FROM comind.cm_foundry_recovery_checkpoint)=0 AND (SELECT count(*) FROM comind.cm_foundry_adapter_operation)=0 AS lf2_tables_still_empty_ok,
        to_regclass('comind.cm_foundry_adapter_operation_result') IS NULL AND to_regclass('comind.cm_foundry_execution_outcome') IS NULL AS migration_008_absent_ok
),
contract AS (SELECT to_jsonb(gates) AS checks FROM gates)
SELECT jsonb_build_object(
    'lf3_contract_pass', NOT EXISTS (SELECT 1 FROM contract, LATERAL jsonb_each_text(checks) c(key,value) WHERE value<>'true'),
    'project_ref', 'sbgfuanxiqepcoboxzcl',
    'live_migration_name', 'live_foundry_lf3_security_prerequisites_v1',
    'expected_advisor_delta', jsonb_build_object(
        'function_search_path_mutable_warn', jsonb_build_object('before',7,'after',0,'delta',-7),
        'rls_enabled_no_policy_info', jsonb_build_object('before',27,'after',106,'delta',79)
    ),
    'checks', checks
) AS live_foundry_lf3_postdeploy
FROM contract;

COMMIT;
