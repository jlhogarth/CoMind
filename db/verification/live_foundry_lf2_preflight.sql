-- LF-2 Foundry Agent substrate live preflight.
-- Read-only and fail-closed. No DDL or DML.

BEGIN READ ONLY;

WITH
expected_migrations(version, name) AS (
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
        ('20261016032328', 'live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1')
),
actual_migrations AS (
    SELECT version::text, name::text
    FROM supabase_migrations.schema_migrations
),
required_relations(name) AS (
    VALUES
        ('comind.cm_org'),
        ('comind.cm_actor'),
        ('comind.cm_project'),
        ('comind.cm_agent'),
        ('comind.cm_agent_run'),
        ('comind.cm_task'),
        ('comind.cm_conversation'),
        ('comind.cm_evidence'),
        ('comind.cm_policy_rule'),
        ('comind.cm_memory_node'),
        ('comind.cm_budget_authority_binding')
),
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
    SELECT provider_code::text
    FROM public.comind_service_providers
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
fk_targets(table_name, column_name) AS (
    VALUES
        ('cm_agent','agent_id'),
        ('cm_actor','actor_id'),
        ('cm_org','org_id'),
        ('cm_project','project_id'),
        ('cm_task','task_id'),
        ('cm_conversation','conv_id'),
        ('cm_agent_run','run_id'),
        ('cm_budget_authority_binding','binding_id')
),
fk_target_checks AS (
    SELECT f.table_name, f.column_name,
           c.data_type = 'uuid' AS uuid_ok,
           EXISTS (
               SELECT 1
               FROM pg_index i
               JOIN pg_class cl ON cl.oid = i.indrelid
               JOIN pg_namespace n ON n.oid = cl.relnamespace
               JOIN LATERAL unnest(i.indkey) AS k(attnum) ON true
               JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
               WHERE n.nspname = 'comind'
                 AND cl.relname = f.table_name
                 AND a.attname = f.column_name
                 AND i.indisprimary
           ) AS primary_key_ok
    FROM fk_targets f
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'comind'
     AND c.table_name = f.table_name
     AND c.column_name = f.column_name
),
gates AS (
    SELECT
        current_database() = 'postgres' AS database_ok,
        current_user = 'postgres' AS current_user_ok,
        current_setting('server_version') = '17.11' AS server_version_ok,
        NOT EXISTS (
            (SELECT * FROM expected_migrations EXCEPT SELECT * FROM actual_migrations)
            UNION ALL
            (SELECT * FROM actual_migrations EXCEPT SELECT * FROM expected_migrations)
        ) AS migration_ledger_exact_ok,
        NOT EXISTS (SELECT 1 FROM required_relations WHERE to_regclass(name) IS NULL) AS required_relations_ok,
        NOT EXISTS (SELECT 1 FROM target_relations WHERE to_regclass(name) IS NOT NULL) AS target_relations_absent_ok,
        to_regprocedure('comind.cm_reject_foundry_substrate_mutation()') IS NULL AS mutation_guard_absent_ok,
        NOT EXISTS (
            SELECT 1 FROM supabase_migrations.schema_migrations
            WHERE name = 'live_foundry_lf2_agent_substrate_v1'
        ) AS lf2_migration_absent_ok,
        to_regprocedure('gen_random_uuid()') IS NOT NULL AS gen_random_uuid_ok,
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role_exists_ok,
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS anon_role_exists_ok,
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS authenticated_role_exists_ok,
        COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'), false) AS service_role_bypassrls_ok,
        has_schema_privilege('service_role', 'comind', 'USAGE') AS service_role_schema_usage_ok,
        NOT EXISTS (SELECT 1 FROM fk_target_checks WHERE NOT COALESCE(uuid_ok,false) OR NOT primary_key_ok) AS fk_targets_ok,
        NOT EXISTS (
            (SELECT * FROM expected_providers EXCEPT SELECT * FROM actual_providers)
            UNION ALL
            (SELECT * FROM actual_providers EXCEPT SELECT * FROM expected_providers)
        ) AS providers_exact_ok,
        NOT EXISTS (
            (SELECT * FROM expected_registry EXCEPT SELECT * FROM actual_registry)
            UNION ALL
            (SELECT * FROM actual_registry EXCEPT SELECT * FROM expected_registry)
        ) AS operator_console_registry_exact_ok,
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
        (SELECT count(*) FROM comind.cm_budget_authority_telemetry) = 0 AS budget_telemetry_count_ok
),
contract AS (
    SELECT to_jsonb(gates) AS checks FROM gates
)
SELECT jsonb_build_object(
    'lf2_preflight_pass', NOT EXISTS (
        SELECT 1
        FROM contract,
        LATERAL jsonb_each_text(checks) AS c(key, value)
        WHERE value <> 'true'
    ),
    'project_ref', 'sbgfuanxiqepcoboxzcl',
    'live_migration_name', 'live_foundry_lf2_agent_substrate_v1',
    'checks', checks
) AS live_foundry_lf2_preflight
FROM contract;

COMMIT;
