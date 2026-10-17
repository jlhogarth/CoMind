-- LF-1 postdeployment baseline contract.
-- Read-only by construction. Intended for live pre-LF-2 drift detection.

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
expected_mutable_functions(signature) AS (
    VALUES
        ('comind.current_actor()'),
        ('comind.fn_belief_update_beta(uuid,boolean,jsonb)'),
        ('comind.fn_create_causal_node_from_memory(uuid,text,text)'),
        ('comind.set_current_actor(uuid)'),
        ('comind.set_updated_at_checklist()'),
        ('comind.set_updated_at_research_refs()'),
        ('comind.set_updated_at()')
),
actual_mutable_functions AS (
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'comind'
      AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
          WHERE setting LIKE 'search_path=%'
      )
),
expected_no_policy(relation_name) AS (
    VALUES
        ('comind.cm_budget_authority_binding'),
        ('comind.cm_budget_authority_reservation'),
        ('comind.cm_budget_authority_telemetry'),
        ('public.comind_budget_exceptions'),
        ('public.comind_budget_policies'),
        ('public.comind_cost_alerts'),
        ('public.comind_cost_reservation_events'),
        ('public.comind_cost_reservations'),
        ('public.comind_execution_checkpoints'),
        ('public.comind_routing_decisions'),
        ('public.comind_service_connections'),
        ('public.comind_service_providers'),
        ('public.comind_service_rate_cards'),
        ('public.comind_usage_events'),
        ('public.comind_workflow_cost_envelopes')
),
actual_no_policy AS (
    SELECT format('%I.%I', n.nspname, c.relname) AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND c.relrowsecurity
      AND n.nspname IN ('comind','public')
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
),
lf2_relations(name) AS (
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
gates AS (
    SELECT
        current_database() = 'postgres' AS database_ok,
        current_setting('server_version') = '17.11' AS server_version_ok,
        NOT EXISTS (
            (SELECT * FROM expected_migrations EXCEPT SELECT * FROM actual_migrations)
            UNION ALL
            (SELECT * FROM actual_migrations EXCEPT SELECT * FROM expected_migrations)
        ) AS migration_ledger_ok,
        NOT EXISTS (
            (SELECT * FROM expected_providers EXCEPT SELECT * FROM actual_providers)
            UNION ALL
            (SELECT * FROM actual_providers EXCEPT SELECT * FROM expected_providers)
        ) AS provider_registry_ok,
        NOT EXISTS (
            (SELECT * FROM expected_registry EXCEPT SELECT * FROM actual_registry)
            UNION ALL
            (SELECT * FROM actual_registry EXCEPT SELECT * FROM expected_registry)
        ) AS operator_console_registry_ok,
        NOT EXISTS (
            (SELECT * FROM expected_mutable_functions EXCEPT SELECT * FROM actual_mutable_functions)
            UNION ALL
            (SELECT * FROM actual_mutable_functions EXCEPT SELECT * FROM expected_mutable_functions)
        ) AS mutable_search_path_baseline_ok,
        NOT EXISTS (
            (SELECT * FROM expected_no_policy EXCEPT SELECT * FROM actual_no_policy)
            UNION ALL
            (SELECT * FROM actual_no_policy EXCEPT SELECT * FROM expected_no_policy)
        ) AS rls_no_policy_baseline_ok,
        NOT EXISTS (SELECT 1 FROM lf2_relations WHERE to_regclass(name) IS NOT NULL) AS lf2_absent_ok,
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
    SELECT to_jsonb(gates) AS checks
    FROM gates
)
SELECT jsonb_build_object(
    'baseline_pass', NOT EXISTS (
        SELECT 1
        FROM contract,
        LATERAL jsonb_each_text(checks) AS c(key, value)
        WHERE value <> 'true'
    ),
    'project_ref', 'sbgfuanxiqepcoboxzcl',
    'checks', checks
) AS live_foundry_lf1_baseline
FROM contract;

COMMIT;
