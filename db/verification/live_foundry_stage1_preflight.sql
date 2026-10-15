-- Issue #116 Live Foundry Stage 1 technical preflight
-- READ ONLY. This file must never mutate live state.
-- A PASS means only that the observed database shape matches the reviewed
-- pre-authorization baseline. It is not C4 approval and is not deployment evidence.

WITH
required_roles(role_name) AS (
    VALUES ('anon'), ('authenticated'), ('service_role')
),
missing_roles AS (
    SELECT r.role_name
    FROM required_roles r
    LEFT JOIN pg_roles p ON p.rolname = r.role_name
    WHERE p.rolname IS NULL
),
required_current_relations(object_name) AS (
    VALUES
        ('comind.cm_project'),
        ('comind.cm_actor'),
        ('comind.cm_agent'),
        ('comind.cm_agent_run'),
        ('comind.cm_conversation'),
        ('comind.cm_message')
),
missing_current_relations AS (
    SELECT object_name
    FROM required_current_relations
    WHERE to_regclass(object_name) IS NULL
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
stage1_relations(object_name) AS (
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
        ('public.comind_workflow_cost_summary'),
        ('comind.cm_budget_authority_binding'),
        ('comind.cm_budget_authority_reservation'),
        ('comind.cm_budget_authority_telemetry')
),
unexpected_stage1_relations AS (
    SELECT object_name
    FROM stage1_relations
    WHERE to_regclass(object_name) IS NOT NULL
),
stage1_functions(object_name) AS (
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
unexpected_stage1_functions AS (
    SELECT object_name
    FROM stage1_functions
    WHERE to_regprocedure(object_name) IS NOT NULL
),
expected_migrations(name) AS (
    VALUES
        ('comind_base_v2_initial_build'),
        ('comind_pm_ledger_hardening_v0_1_1'),
        ('comind_pm_ledger_maintenance_package_v0_1')
),
current_migrations AS (
    SELECT name
    FROM supabase_migrations.schema_migrations
),
migration_delta AS (
    SELECT 'unexpected_live_migration'::text AS delta_type, c.name
    FROM current_migrations c
    LEFT JOIN expected_migrations e USING (name)
    WHERE e.name IS NULL
    UNION ALL
    SELECT 'missing_expected_migration'::text, e.name
    FROM expected_migrations e
    LEFT JOIN current_migrations c USING (name)
    WHERE c.name IS NULL
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
rls_snapshot AS (
    SELECT jsonb_build_object(
        'comind_enabled', count(*) FILTER (WHERE n.nspname = 'comind' AND c.relrowsecurity),
        'comind_disabled', count(*) FILTER (WHERE n.nspname = 'comind' AND NOT c.relrowsecurity),
        'comind_pm_enabled', count(*) FILTER (WHERE n.nspname = 'comind_pm' AND c.relrowsecurity),
        'comind_pm_disabled', count(*) FILTER (WHERE n.nspname = 'comind_pm' AND NOT c.relrowsecurity)
    ) AS state
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('comind', 'comind_pm')
),
policy_snapshot AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'schema', schemaname,
                'table', tablename,
                'policy', policyname,
                'roles', roles,
                'command', cmd
            ) ORDER BY schemaname, tablename, policyname
        ),
        '[]'::jsonb
    ) AS policies
    FROM pg_policies
    WHERE schemaname IN ('comind', 'comind_pm')
),
gates AS (
    SELECT
        NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_present,
        NOT EXISTS (SELECT 1 FROM missing_current_relations) AS current_runtime_present,
        to_regprocedure('gen_random_uuid()') IS NOT NULL AS uuid_generator_present,
        NOT EXISTS (SELECT 1 FROM unexpected_legacy_identity_surfaces) AS no_legacy_identity_surface,
        NOT EXISTS (SELECT 1 FROM unexpected_stage1_relations) AS stage1_relations_absent,
        NOT EXISTS (SELECT 1 FROM unexpected_stage1_functions) AS stage1_functions_absent,
        NOT EXISTS (SELECT 1 FROM migration_delta) AS migration_history_matches_reviewed_baseline
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'evidence_state', 'read_only_technical_preflight',
        'issue', 116,
        'project_ref', 'sbgfuanxiqepcoboxzcl',
        'technical_preflight_pass',
            g.required_roles_present
            AND g.current_runtime_present
            AND g.uuid_generator_present
            AND g.no_legacy_identity_surface
            AND g.stage1_relations_absent
            AND g.stage1_functions_absent
            AND g.migration_history_matches_reviewed_baseline,
        'c4_authorized', false,
        'gates', jsonb_build_object(
            'required_roles_present', g.required_roles_present,
            'current_runtime_present', g.current_runtime_present,
            'uuid_generator_present', g.uuid_generator_present,
            'no_legacy_identity_surface', g.no_legacy_identity_surface,
            'stage1_relations_absent', g.stage1_relations_absent,
            'stage1_functions_absent', g.stage1_functions_absent,
            'migration_history_matches_reviewed_baseline', g.migration_history_matches_reviewed_baseline
        ),
        'missing_roles', COALESCE((SELECT jsonb_agg(role_name ORDER BY role_name) FROM missing_roles), '[]'::jsonb),
        'missing_current_relations', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM missing_current_relations), '[]'::jsonb),
        'unexpected_legacy_identity_surfaces', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM unexpected_legacy_identity_surfaces), '[]'::jsonb),
        'unexpected_stage1_relations', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM unexpected_stage1_relations), '[]'::jsonb),
        'unexpected_stage1_functions', COALESCE((SELECT jsonb_agg(object_name ORDER BY object_name) FROM unexpected_stage1_functions), '[]'::jsonb),
        'migration_delta', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', delta_type, 'name', name) ORDER BY delta_type, name) FROM migration_delta), '[]'::jsonb),
        'protected_row_counts', pc.counts,
        'rls_snapshot', rs.state,
        'policy_snapshot', ps.policies,
        'server_version', current_setting('server_version'),
        'database', current_database()
    )
) AS live_foundry_stage1_preflight
FROM gates g
CROSS JOIN protected_counts pc
CROSS JOIN rls_snapshot rs
CROSS JOIN policy_snapshot ps;
