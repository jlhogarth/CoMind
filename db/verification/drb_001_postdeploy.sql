-- DRB-001 Durable RunBook postdeployment verification
-- Read-only verification. Returns one JSON object with explicit checks.

with
required_columns(column_name) as (
    values
        ('occurred_at'),
        ('result_summary'),
        ('outcome'),
        ('consequential')
),
required_tables(table_name) as (
    values
        ('pm_authorizations'),
        ('pm_verifications'),
        ('pm_event_links')
),
required_views(view_name) as (
    values
        ('v_runbook_timeline'),
        ('v_runbook_authority'),
        ('v_runbook_verification'),
        ('v_runbook_lane_state')
),
required_triggers(trigger_name) as (
    values
        ('trg_pm_authorizations_no_update'),
        ('trg_pm_authorizations_no_delete'),
        ('trg_pm_verifications_no_update'),
        ('trg_pm_verifications_no_delete'),
        ('trg_pm_event_links_no_update'),
        ('trg_pm_event_links_no_delete'),
        ('trg_pm_events_project_current_state')
),
checks as (
    select
        not exists (
            select 1
            from required_columns r
            where not exists (
                select 1
                from information_schema.columns c
                where c.table_schema='comind_pm'
                  and c.table_name='pm_events'
                  and c.column_name=r.column_name
            )
        ) as event_columns_ok,

        not exists (
            select 1
            from required_tables r
            where to_regclass('comind_pm.' || r.table_name) is null
        ) as relational_tables_ok,

        not exists (
            select 1
            from required_views r
            where to_regclass('comind_pm.' || r.view_name) is null
        ) as query_views_ok,

        to_regprocedure(
            'comind_pm.record_runbook_event(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamp with time zone,boolean)'
        ) is not null as capture_function_ok,

        not exists (
            select 1
            from required_triggers r
            where not exists (
                select 1
                from pg_trigger t
                join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='comind_pm'
                  and t.tgname=r.trigger_name
                  and not t.tgisinternal
            )
        ) as append_and_projection_triggers_ok,

        not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='comind_pm'
              and c.relname in ('pm_events','pm_authorizations','pm_verifications','pm_event_links')
              and c.relrowsecurity is not true
        ) as rls_enabled_ok,

        not exists (
            select 1
            from information_schema.role_table_grants g
            where g.table_schema='comind_pm'
              and g.table_name in (
                  'pm_authorizations',
                  'pm_verifications',
                  'pm_event_links',
                  'v_runbook_timeline',
                  'v_runbook_authority',
                  'v_runbook_verification',
                  'v_runbook_lane_state'
              )
              and g.grantee in ('anon','authenticated')
        ) as client_roles_ungranted_ok,

        not exists (
            select x.table_name
            from (values
                ('pm_events'),
                ('pm_authorizations'),
                ('pm_verifications'),
                ('pm_event_links')
            ) x(table_name)
            where not exists (
                select 1
                from pg_policies p
                where p.schemaname='comind_pm'
                  and p.tablename=x.table_name
                  and p.policyname='service_role_full_access'
            )
        ) as service_role_policy_ok,

        exists (
            select 1
            from comind_pm.pm_work_items wi
            join comind_pm.pm_projects p on p.id=wi.project_id
            where p.project_key='COMIND'
              and wi.work_key='DRB-001'
              and wi.item_type='lane'
        ) as live_drb_lane_seeded_ok,

        exists (
            select 1
            from comind_pm.pm_events e
            join comind_pm.pm_work_items wi on wi.id=e.work_item_id
            where wi.work_key='DRB-001'
              and e.outcome='approved'
              and e.event_type='authorization'
        ) as live_authorization_captured_ok,

        exists (
            select 1
            from comind_pm.pm_verifications v
            join comind_pm.pm_work_items wi on wi.id=v.work_item_id
            where wi.work_key='DRB-001'
              and v.outcome='pass'
        ) as live_verification_captured_ok
)
select jsonb_build_object(
    'milestone', 'DRB-001',
    'event_columns_ok', event_columns_ok,
    'relational_tables_ok', relational_tables_ok,
    'query_views_ok', query_views_ok,
    'capture_function_ok', capture_function_ok,
    'append_and_projection_triggers_ok', append_and_projection_triggers_ok,
    'rls_enabled_ok', rls_enabled_ok,
    'client_roles_ungranted_ok', client_roles_ungranted_ok,
    'service_role_policy_ok', service_role_policy_ok,
    'live_drb_lane_seeded_ok', live_drb_lane_seeded_ok,
    'live_authorization_captured_ok', live_authorization_captured_ok,
    'live_verification_captured_ok', live_verification_captured_ok,
    'all_ok',
        event_columns_ok
        and relational_tables_ok
        and query_views_ok
        and capture_function_ok
        and append_and_projection_triggers_ok
        and rls_enabled_ok
        and client_roles_ungranted_ok
        and service_role_policy_ok
        and live_drb_lane_seeded_ok
        and live_authorization_captured_ok
        and live_verification_captured_ok
)
from checks;
