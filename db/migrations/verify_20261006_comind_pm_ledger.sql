WITH expected_tables(table_name) AS (
    VALUES
        ('pm_projects'),
        ('pm_work_items'),
        ('pm_work_item_dependencies'),
        ('pm_events'),
        ('pm_links'),
        ('pm_agent_runs'),
        ('pm_decision_records'),
        ('pm_risk_records'),
        ('pm_snapshots'),
        ('pm_sync_cursors')
),
missing_tables AS (
    SELECT expected_tables.table_name
    FROM expected_tables
    LEFT JOIN information_schema.tables actual_tables
        ON actual_tables.table_schema = 'comind_pm'
       AND actual_tables.table_name = expected_tables.table_name
    WHERE actual_tables.table_name IS NULL
),
expected_views(view_name) AS (
    VALUES
        ('v_work_item_overview'),
        ('v_open_blockers'),
        ('v_recent_agent_activity'),
        ('v_recovery_export')
),
missing_views AS (
    SELECT expected_views.view_name
    FROM expected_views
    LEFT JOIN information_schema.views actual_views
        ON actual_views.table_schema = 'comind_pm'
       AND actual_views.table_name = expected_views.view_name
    WHERE actual_views.table_name IS NULL
),
seeded_work_items AS (
    SELECT count(*)::integer AS work_item_count
    FROM comind_pm.pm_work_items
    WHERE work_key IN ('CM-PM-001', 'CM-DB-001', 'CM-AGENT-001')
),
service_role_policies AS (
    SELECT count(*)::integer AS policy_count
    FROM pg_policies
    WHERE schemaname = 'comind_pm'
      AND policyname = 'service_role_full_access'
),
append_only_triggers AS (
    SELECT count(*)::integer AS trigger_count
    FROM information_schema.triggers
    WHERE event_object_schema = 'comind_pm'
      AND event_object_table = 'pm_events'
      AND trigger_name IN ('trg_pm_events_no_update', 'trg_pm_events_no_delete')
)
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM missing_tables) THEN 'fail'
        WHEN EXISTS (SELECT 1 FROM missing_views) THEN 'fail'
        WHEN (SELECT work_item_count FROM seeded_work_items) <> 3 THEN 'fail'
        WHEN (SELECT policy_count FROM service_role_policies) <> 10 THEN 'fail'
        WHEN (SELECT trigger_count FROM append_only_triggers) <> 2 THEN 'fail'
        ELSE 'pass'
    END AS verification_status,
    (SELECT jsonb_agg(table_name ORDER BY table_name) FROM missing_tables) AS missing_tables,
    (SELECT jsonb_agg(view_name ORDER BY view_name) FROM missing_views) AS missing_views,
    (SELECT work_item_count FROM seeded_work_items) AS seeded_work_item_count,
    (SELECT policy_count FROM service_role_policies) AS service_role_policy_count,
    (SELECT trigger_count FROM append_only_triggers) AS append_only_trigger_count;
