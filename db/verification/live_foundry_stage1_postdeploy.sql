-- Issue #116 Live Foundry Stage 1 post-deployment verifier
-- READ ONLY. Run immediately after the six authorized Stage 1 migrations.
-- A PASS proves the expected database contract is present. It does not prove
-- Agent activation, paid-provider execution, Foundry operation, or compliance.

WITH
expected_relations(object_name, relation_kind) AS (
    VALUES
        ('public.comind_service_providers', 'table'),
        ('public.comind_service_connections', 'table'),
        ('public.comind_service_rate_cards', 'table'),
        ('public.comind_budget_policies', 'table'),
        ('public.comind_workflow_cost_envelopes', 'table'),
        ('public.comind_cost_reservations', 'table'),
        ('public.comind_routing_decisions', 'table'),
        ('public.comind_usage_events', 'table'),
        ('public.comind_execution_checkpoints', 'table'),
        ('public.comind_budget_exceptions', 'table'),
        ('public.comind_cost_alerts', 'table'),
        ('public.comind_cost_reservation_events', 'table'),
        ('public.comind_workflow_cost_summary', 'view'),
        ('comind.cm_budget_authority_binding', 'table'),
        ('comind.cm_budget_authority_reservation', 'table'),
        ('comind.cm_budget_authority_telemetry', 'table')
),
missing_relations AS (
    SELECT object_name
    FROM expected_relations
    WHERE to_regclass(object_name) IS NULL
),
expected_rls_tables(object_name) AS (
    VALUES
        ('public.comind_service_providers'),
        ('public.comind_service_connections'),
        ('public.comind_service_rate_cards'),
        ('public.comind_budget_policies'),
        ('public.comind_workflow_cost_envelopes'),
        ('public.comind_cost_reservations'),
        ('public.comind_routing_decisions'),
        ('public.comind_usage_events'),
        ('public.comind_execution_checkpoints'),
        ('public.comind_budget_exceptions'),
        ('public.comind_cost_alerts'),
        ('public.comind_cost_reservation_events'),
        ('comind.cm_budget_authority_binding'),
        ('comind.cm_budget_authority_reservation'),
        ('comind.cm_budget_authority_telemetry')
),
rls_failures AS (
    SELECT e.object_name
    FROM expected_rls_tables e
    LEFT JOIN pg_class c ON c.oid = to_regclass(e.object_name)
    WHERE c.oid IS NULL OR NOT c.relrowsecurity
),
forbidden_table_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
),
forbidden_table_privileges AS (
    SELECT r.role_name, t.object_name, p.privilege
    FROM forbidden_table_roles r
    CROSS JOIN expected_rls_tables t
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
    WHERE to_regclass(t.object_name) IS NOT NULL
      AND has_table_privilege(r.role_name, to_regclass(t.object_name), p.privilege)
),
service_role_missing_select AS (
    SELECT object_name
    FROM expected_rls_tables
    WHERE to_regclass(object_name) IS NULL
       OR NOT has_table_privilege('service_role', to_regclass(object_name), 'SELECT')
),
expected_functions(object_name) AS (
    VALUES
        ('public.comind_finops_set_updated_at()'),
        ('public.comind_reserve_cost(bigint,bigint,uuid,text,numeric,timestamp with time zone)'),
        ('public.comind_record_usage(bigint,bigint,bigint,bigint,bigint,uuid,text,text,numeric,numeric,jsonb)'),
        ('public.comind_record_checkpoint(bigint,uuid,numeric,numeric,numeric,text,text,text)'),
        ('public.comind_reject_cost_reservation_event_mutation()'),
        ('public.comind_sync_envelope_reserved_cost(bigint)'),
        ('public.comind_mark_stale_cost_reservations(bigint)'),
        ('public.comind_reserve_paid_provider_cost(bigint,bigint,uuid,text,text,numeric,timestamp with time zone)'),
        ('public.comind_finalize_paid_provider_cost(bigint,text,text,numeric,text,text)'),
        ('public.comind_close_unspent_paid_provider_reservation(bigint,text,text)'),
        ('comind.cm_reject_budget_authority_adapter_mutation()'),
        ('comind.cm_bind_budget_authority_envelope(bigint,text,uuid,uuid,uuid,uuid,uuid)'),
        ('comind.cm_reserve_paid_provider_execution(uuid,text,text,text,text,numeric,timestamp with time zone)'),
        ('comind.cm_finalize_paid_provider_message_execution(bigint,uuid,text,text)'),
        ('comind.cm_close_unspent_paid_provider_execution(bigint,text,text)')
),
missing_functions AS (
    SELECT object_name
    FROM expected_functions
    WHERE to_regprocedure(object_name) IS NULL
),
forbidden_function_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
),
forbidden_function_execute AS (
    SELECT r.role_name, f.object_name
    FROM forbidden_function_roles r
    CROSS JOIN expected_functions f
    WHERE to_regprocedure(f.object_name) IS NOT NULL
      AND has_function_privilege(r.role_name, to_regprocedure(f.object_name), 'EXECUTE')
),
service_role_functions(object_name) AS (
    VALUES
        ('public.comind_reserve_cost(bigint,bigint,uuid,text,numeric,timestamp with time zone)'),
        ('public.comind_record_usage(bigint,bigint,bigint,bigint,bigint,uuid,text,text,numeric,numeric,jsonb)'),
        ('public.comind_record_checkpoint(bigint,uuid,numeric,numeric,numeric,text,text,text)'),
        ('public.comind_sync_envelope_reserved_cost(bigint)'),
        ('public.comind_mark_stale_cost_reservations(bigint)'),
        ('public.comind_reserve_paid_provider_cost(bigint,bigint,uuid,text,text,numeric,timestamp with time zone)'),
        ('public.comind_finalize_paid_provider_cost(bigint,text,text,numeric,text,text)'),
        ('public.comind_close_unspent_paid_provider_reservation(bigint,text,text)'),
        ('comind.cm_bind_budget_authority_envelope(bigint,text,uuid,uuid,uuid,uuid,uuid)'),
        ('comind.cm_reserve_paid_provider_execution(uuid,text,text,text,text,numeric,timestamp with time zone)'),
        ('comind.cm_finalize_paid_provider_message_execution(bigint,uuid,text,text)'),
        ('comind.cm_close_unspent_paid_provider_execution(bigint,text,text)')
),
service_role_missing_execute AS (
    SELECT object_name
    FROM service_role_functions
    WHERE to_regprocedure(object_name) IS NULL
       OR NOT has_function_privilege('service_role', to_regprocedure(object_name), 'EXECUTE')
),
expected_migrations(name) AS (
    VALUES
        ('live_foundry_stage1_finops_current_runtime_projection_v1'),
        ('live_foundry_stage1_paid_provider_budget_authority_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1')
),
missing_migrations AS (
    SELECT e.name
    FROM expected_migrations e
    LEFT JOIN supabase_migrations.schema_migrations m USING (name)
    WHERE m.name IS NULL
),
expected_provider_codes(provider_code) AS (
    VALUES
        ('local_rtx5090'),
        ('openai'),
        ('google_gemini'),
        ('supabase'),
        ('railway'),
        ('vercel'),
        ('replit')
),
missing_provider_codes AS (
    SELECT e.provider_code
    FROM expected_provider_codes e
    LEFT JOIN public.comind_service_providers p USING (provider_code)
    WHERE p.provider_code IS NULL
),
unexpected_provider_codes AS (
    SELECT p.provider_code
    FROM public.comind_service_providers p
    LEFT JOIN expected_provider_codes e USING (provider_code)
    WHERE e.provider_code IS NULL
),
legacy_identity_surfaces(object_name) AS (
    VALUES
        ('public.projects'),
        ('public.agents'),
        ('public.comind_governance_decisions')
),
unexpected_legacy_identity_surfaces AS (
    SELECT object_name
    FROM legacy_identity_surfaces
    WHERE to_regclass(object_name) IS NOT NULL
),
foundry_stage2_objects(object_name) AS (
    VALUES
        ('comind.cm_foundry_agent_profile'),
        ('comind.cm_foundry_capability'),
        ('comind.cm_foundry_capability_grant'),
        ('comind.cm_foundry_authorization_request'),
        ('comind.cm_foundry_execution_context')
),
unexpected_foundry_stage2_objects AS (
    SELECT object_name
    FROM foundry_stage2_objects
    WHERE to_regclass(object_name) IS NOT NULL
),
protected_counts AS (
    SELECT jsonb_build_object(
        'comind.cm_org', (SELECT count(*) FROM comind.cm_org),
        'comind.cm_project', (SELECT count(*) FROM comind.cm_project),
        'comind.cm_actor', (SELECT count(*) FROM comind.cm_actor),
        'comind.cm_agent', (SELECT count(*) FROM comind.cm_agent),
        'comind.cm_agent_run', (SELECT count(*) FROM comind.cm_agent_run),
        'comind.cm_agent_step', (SELECT count(*) FROM comind.cm_agent_step),
        'comind.cm_tool_call', (SELECT count(*) FROM comind.cm_tool_call),
        'comind.cm_conversation', (SELECT count(*) FROM comind.cm_conversation),
        'comind.cm_message', (SELECT count(*) FROM comind.cm_message),
        'comind.cm_task', (SELECT count(*) FROM comind.cm_task),
        'comind.cm_milestone', (SELECT count(*) FROM comind.cm_milestone),
        'comind.cm_doc', (SELECT count(*) FROM comind.cm_doc),
        'comind.cm_evidence', (SELECT count(*) FROM comind.cm_evidence),
        'comind_pm.pm_agent_runs', (SELECT count(*) FROM comind_pm.pm_agent_runs),
        'comind_pm.pm_work_items', (SELECT count(*) FROM comind_pm.pm_work_items)
    ) AS counts
),
gates AS (
    SELECT
        NOT EXISTS (SELECT 1 FROM missing_relations) AS relations_present,
        NOT EXISTS (SELECT 1 FROM rls_failures) AS rls_enabled,
        NOT EXISTS (SELECT 1 FROM forbidden_table_privileges) AS forbidden_table_privileges_absent,
        NOT EXISTS (SELECT 1 FROM service_role_missing_select) AS service_role_table_access_present,
        NOT EXISTS (SELECT 1 FROM missing_functions) AS functions_present,
        NOT EXISTS (SELECT 1 FROM forbidden_function_execute) AS forbidden_function_execute_absent,
        NOT EXISTS (SELECT 1 FROM service_role_missing_execute) AS service_role_function_access_present,
        NOT EXISTS (SELECT 1 FROM missing_migrations) AS migration_history_present,
        NOT EXISTS (SELECT 1 FROM missing_provider_codes) AS provider_seed_present,
        NOT EXISTS (SELECT 1 FROM unexpected_provider_codes) AS provider_seed_exact,
        NOT EXISTS (SELECT 1 FROM unexpected_legacy_identity_surfaces) AS no_legacy_identity_surface,
        NOT EXISTS (SELECT 1 FROM unexpected_foundry_stage2_objects) AS stage2_not_deployed,
        (SELECT count(*) = 0 FROM comind.cm_agent) AS no_foundry_agent_population,
        (SELECT count(*) = 0 FROM comind.cm_agent_run) AS no_agent_execution,
        (SELECT count(*) = 0 FROM comind_pm.pm_agent_runs) AS no_pm_agent_execution
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'evidence_state', 'read_only_post_deployment_contract_verification',
        'issue', 116,
        'project_ref', 'sbgfuanxiqepcoboxzcl',
        'stage1_contract_pass',
            g.relations_present
            AND g.rls_enabled
            AND g.forbidden_table_privileges_absent
            AND g.service_role_table_access_present
            AND g.functions_present
            AND g.forbidden_function_execute_absent
            AND g.service_role_function_access_present
            AND g.migration_history_present
            AND g.provider_seed_present
            AND g.provider_seed_exact
            AND g.no_legacy_identity_surface
            AND g.stage2_not_deployed
            AND g.no_foundry_agent_population
            AND g.no_agent_execution
            AND g.no_pm_agent_execution,
        'gates', to_jsonb(g),
        'missing_relations', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM missing_relations), '[]'::jsonb),
        'rls_failures', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM rls_failures), '[]'::jsonb),
        'forbidden_table_privileges', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role_name, 'object', object_name, 'privilege', privilege) ORDER BY role_name, object_name, privilege) FROM forbidden_table_privileges), '[]'::jsonb),
        'service_role_missing_select', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM service_role_missing_select), '[]'::jsonb),
        'missing_functions', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM missing_functions), '[]'::jsonb),
        'forbidden_function_execute', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role_name, 'object', object_name) ORDER BY role_name, object_name) FROM forbidden_function_execute), '[]'::jsonb),
        'service_role_missing_execute', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM service_role_missing_execute), '[]'::jsonb),
        'missing_migrations', COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM missing_migrations), '[]'::jsonb),
        'missing_provider_codes', COALESCE((SELECT jsonb_agg(provider_code ORDER BY provider_code) FROM missing_provider_codes), '[]'::jsonb),
        'unexpected_provider_codes', COALESCE((SELECT jsonb_agg(provider_code ORDER BY provider_code) FROM unexpected_provider_codes), '[]'::jsonb),
        'unexpected_legacy_identity_surfaces', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM unexpected_legacy_identity_surfaces), '[]'::jsonb),
        'unexpected_foundry_stage2_objects', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM unexpected_foundry_stage2_objects), '[]'::jsonb),
        'protected_row_counts', pc.counts,
        'server_version', current_setting('server_version'),
        'database', current_database()
    )
) AS live_foundry_stage1_postdeploy
FROM gates g
CROSS JOIN protected_counts pc;
