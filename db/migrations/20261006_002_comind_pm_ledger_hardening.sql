-- CoMind PM Ledger Hardening v0.1.1
-- Purpose:
-- 1. Add covering indexes for foreign keys flagged by Supabase advisors.
-- 2. Add explicit service_role-only RLS policies for private maintenance access.
-- 3. Do not grant anon or authenticated access.

create index if not exists idx_pm_work_items_parent
    on comind_pm.pm_work_items(parent_id);

create index if not exists idx_pm_work_item_dependencies_depends_on
    on comind_pm.pm_work_item_dependencies(depends_on_work_item_id);

create index if not exists idx_pm_links_project
    on comind_pm.pm_links(project_id);

create index if not exists idx_pm_agent_runs_project
    on comind_pm.pm_agent_runs(project_id);

create index if not exists idx_pm_snapshots_project
    on comind_pm.pm_snapshots(project_id);

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'pm_projects',
        'pm_work_items',
        'pm_work_item_dependencies',
        'pm_events',
        'pm_links',
        'pm_agent_runs',
        'pm_decision_records',
        'pm_risk_records',
        'pm_snapshots',
        'pm_sync_cursors'
    ]
    loop
        if not exists (
            select 1
              from pg_policies
             where schemaname = 'comind_pm'
               and tablename = v_table
               and policyname = 'service_role_full_access'
        ) then
            execute format(
                'create policy service_role_full_access on comind_pm.%I for all to service_role using (true) with check (true)',
                v_table
            );
        end if;
    end loop;
end;
$$;
