-- CoMind Durable RunBook Foundation v0.2
-- Purpose:
-- 1. Extend the existing comind_pm ledger into a concise operational RunBook.
-- 2. Preserve append-only actions, explicit outcomes, approvals, clearances, verification, and evidence relations.
-- 3. Project current lane state from consequential events without replacing the event history.
-- 4. Keep anon and authenticated roles out of the private RunBook schema.
--
-- Live Supabase changes were deployed as:
--   comind_pm_durable_runbook_ledger_v0_2
--   comind_pm_durable_runbook_capture_v0_2_1
--   comind_pm_durable_runbook_fk_indexes_v0_2_2
--   comind_pm_durable_runbook_private_boundary_v0_2_3
--   comind_pm_durable_runbook_service_role_policy_v0_2_4

alter table comind_pm.pm_events
    add column if not exists occurred_at timestamptz not null default now(),
    add column if not exists result_summary text,
    add column if not exists outcome text not null default 'informational',
    add column if not exists consequential boolean not null default true;

alter table comind_pm.pm_events
    drop constraint if exists pm_events_event_type_check;

alter table comind_pm.pm_events
    add constraint pm_events_event_type_check
    check (event_type = any (array[
        'created'::text,
        'status_change'::text,
        'agent_update'::text,
        'human_update'::text,
        'sync'::text,
        'comment'::text,
        'decision'::text,
        'risk_update'::text,
        'blocker_update'::text,
        'snapshot'::text,
        'recovery'::text,
        'link_added'::text,
        'action'::text,
        'verification'::text,
        'authorization'::text,
        'milestone_update'::text,
        'deployment'::text,
        'merge'::text,
        'migration'::text,
        'test'::text
    ]));

alter table comind_pm.pm_events
    drop constraint if exists pm_events_outcome_check;

alter table comind_pm.pm_events
    add constraint pm_events_outcome_check
    check (outcome = any (array[
        'informational'::text,
        'pass'::text,
        'fail'::text,
        'partial'::text,
        'blocked'::text,
        'approved'::text,
        'rejected'::text,
        'complete'::text,
        'pending'::text
    ]));

alter table comind_pm.pm_work_items
    drop constraint if exists pm_work_items_item_type_check;

alter table comind_pm.pm_work_items
    add constraint pm_work_items_item_type_check
    check (item_type = any (array[
        'epic'::text,
        'lane'::text,
        'task'::text,
        'bug'::text,
        'decision'::text,
        'risk'::text,
        'blocker'::text,
        'research'::text,
        'milestone'::text,
        'audit'::text,
        'document'::text
    ]));

create table if not exists comind_pm.pm_authorizations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references comind_pm.pm_projects(id) on delete cascade,
    work_item_id uuid references comind_pm.pm_work_items(id) on delete cascade,
    event_id uuid references comind_pm.pm_events(id) on delete set null,
    authorization_type text not null,
    decision text not null,
    scope text not null,
    authorized_by text not null,
    authorized_by_type text not null default 'human',
    source_system text not null default 'chatgpt',
    source_ref text,
    effective_at timestamptz not null default now(),
    expires_at timestamptz,
    conditions jsonb not null default '{}'::jsonb,
    evidence jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    constraint pm_authorizations_scope_check
        check (project_id is not null or work_item_id is not null or event_id is not null),
    constraint pm_authorizations_type_check
        check (authorization_type = any (array[
            'approval'::text,
            'clearance'::text,
            'delegation'::text,
            'revocation'::text,
            'exception'::text
        ])),
    constraint pm_authorizations_decision_check
        check (decision = any (array[
            'approved'::text,
            'denied'::text,
            'granted'::text,
            'revoked'::text,
            'expired'::text,
            'pending'::text
        ])),
    constraint pm_authorizations_actor_type_check
        check (authorized_by_type = any (array[
            'human'::text,
            'agent'::text,
            'system'::text,
            'connector'::text
        ])),
    constraint pm_authorizations_source_system_check
        check (source_system = any (array[
            'supabase'::text,
            'github'::text,
            'notion'::text,
            'drive'::text,
            'linear'::text,
            'chatgpt'::text,
            'manual'::text
        ]))
);

create table if not exists comind_pm.pm_verifications (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references comind_pm.pm_projects(id) on delete cascade,
    work_item_id uuid references comind_pm.pm_work_items(id) on delete cascade,
    event_id uuid not null references comind_pm.pm_events(id) on delete cascade,
    verification_type text not null,
    check_name text not null,
    outcome text not null,
    result_summary text,
    verified_by text not null,
    verified_by_type text not null default 'system',
    evidence jsonb not null default '[]'::jsonb,
    verified_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint pm_verifications_outcome_check
        check (outcome = any (array[
            'pass'::text,
            'fail'::text,
            'partial'::text,
            'blocked'::text,
            'not_run'::text
        ])),
    constraint pm_verifications_actor_type_check
        check (verified_by_type = any (array[
            'human'::text,
            'agent'::text,
            'system'::text,
            'connector'::text
        ]))
);

create table if not exists comind_pm.pm_event_links (
    event_id uuid not null references comind_pm.pm_events(id) on delete cascade,
    link_id uuid not null references comind_pm.pm_links(id) on delete cascade,
    relation_type text not null default 'evidence',
    created_at timestamptz not null default now(),
    primary key (event_id, link_id, relation_type),
    constraint pm_event_links_relation_type_check
        check (relation_type = any (array[
            'evidence'::text,
            'produced'::text,
            'modified'::text,
            'verified'::text,
            'supersedes'::text,
            'related'::text
        ]))
);

create or replace function comind_pm.prevent_runbook_ledger_mutation()
returns trigger
language plpgsql
set search_path = 'comind_pm', 'pg_temp'
as $$
begin
    raise exception '% is append-only. Insert a corrective record instead.', tg_table_name;
end;
$$;

create or replace function comind_pm.project_runbook_event_to_work_item()
returns trigger
language plpgsql
set search_path = 'comind_pm', 'pg_temp'
as $$
begin
    if new.work_item_id is not null and new.consequential then
        update comind_pm.pm_work_items
        set last_event_at = new.occurred_at,
            current_summary = coalesce(new.result_summary, new.summary),
            status = coalesce(new.status_to, status)
        where id = new.work_item_id
          and (last_event_at is null or new.occurred_at >= last_event_at);
    end if;
    return new;
end;
$$;

create or replace function comind_pm.record_runbook_event(
    p_project_key text,
    p_event_type text,
    p_actor text,
    p_summary text,
    p_work_key text default null,
    p_actor_type text default 'agent',
    p_result_summary text default null,
    p_outcome text default 'informational',
    p_next_action text default null,
    p_status_from text default null,
    p_status_to text default null,
    p_source_system text default 'chatgpt',
    p_source_ref text default null,
    p_details jsonb default '{}'::jsonb,
    p_evidence jsonb default '[]'::jsonb,
    p_occurred_at timestamptz default now(),
    p_consequential boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = 'comind_pm', 'pg_temp'
as $$
declare
    v_project_id uuid;
    v_work_item_id uuid;
    v_event_id uuid;
begin
    select id into v_project_id
    from comind_pm.pm_projects
    where project_key = p_project_key;

    if v_project_id is null then
        raise exception 'Unknown project_key: %', p_project_key;
    end if;

    if p_work_key is not null then
        select id into v_work_item_id
        from comind_pm.pm_work_items
        where work_key = p_work_key
          and project_id = v_project_id;

        if v_work_item_id is null then
            raise exception 'Unknown work_key % for project %', p_work_key, p_project_key;
        end if;
    end if;

    insert into comind_pm.pm_events (
        project_id,
        work_item_id,
        event_type,
        actor,
        actor_type,
        source_system,
        source_ref,
        summary,
        result_summary,
        outcome,
        next_action,
        status_from,
        status_to,
        details,
        evidence,
        occurred_at,
        consequential
    ) values (
        v_project_id,
        v_work_item_id,
        p_event_type,
        p_actor,
        p_actor_type,
        p_source_system,
        p_source_ref,
        p_summary,
        p_result_summary,
        p_outcome,
        p_next_action,
        p_status_from,
        p_status_to,
        p_details,
        p_evidence,
        p_occurred_at,
        p_consequential
    ) returning id into v_event_id;

    return v_event_id;
end;
$$;

drop trigger if exists trg_pm_authorizations_no_update on comind_pm.pm_authorizations;
create trigger trg_pm_authorizations_no_update
before update on comind_pm.pm_authorizations
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_authorizations_no_delete on comind_pm.pm_authorizations;
create trigger trg_pm_authorizations_no_delete
before delete on comind_pm.pm_authorizations
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_verifications_no_update on comind_pm.pm_verifications;
create trigger trg_pm_verifications_no_update
before update on comind_pm.pm_verifications
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_verifications_no_delete on comind_pm.pm_verifications;
create trigger trg_pm_verifications_no_delete
before delete on comind_pm.pm_verifications
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_event_links_no_update on comind_pm.pm_event_links;
create trigger trg_pm_event_links_no_update
before update on comind_pm.pm_event_links
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_event_links_no_delete on comind_pm.pm_event_links;
create trigger trg_pm_event_links_no_delete
before delete on comind_pm.pm_event_links
for each row execute function comind_pm.prevent_runbook_ledger_mutation();

drop trigger if exists trg_pm_events_project_current_state on comind_pm.pm_events;
create trigger trg_pm_events_project_current_state
after insert on comind_pm.pm_events
for each row execute function comind_pm.project_runbook_event_to_work_item();

create index if not exists idx_pm_events_runbook_timeline
    on comind_pm.pm_events (occurred_at desc, project_id, work_item_id);

create index if not exists idx_pm_events_runbook_outcome
    on comind_pm.pm_events (outcome, consequential, occurred_at desc);

create index if not exists idx_pm_authorizations_work_item
    on comind_pm.pm_authorizations (work_item_id, effective_at desc);

create index if not exists idx_pm_authorizations_project
    on comind_pm.pm_authorizations (project_id, effective_at desc);

create index if not exists idx_pm_authorizations_event
    on comind_pm.pm_authorizations (event_id)
    where event_id is not null;

create index if not exists idx_pm_verifications_event
    on comind_pm.pm_verifications (event_id, verified_at desc);

create index if not exists idx_pm_verifications_work_item
    on comind_pm.pm_verifications (work_item_id, verified_at desc);

create index if not exists idx_pm_verifications_project
    on comind_pm.pm_verifications (project_id)
    where project_id is not null;

create index if not exists idx_pm_event_links_link
    on comind_pm.pm_event_links (link_id);

create or replace view comind_pm.v_runbook_timeline
with (security_invoker = true)
as
select
    e.id as event_id,
    e.occurred_at,
    p.project_key,
    p.name as project_name,
    wi.work_key,
    wi.title as work_item_title,
    wi.item_type,
    e.event_type,
    e.actor,
    e.actor_type,
    e.summary as action_summary,
    e.result_summary,
    e.outcome,
    e.status_from,
    e.status_to,
    e.next_action,
    e.consequential,
    e.source_system,
    e.source_ref,
    e.evidence,
    e.details,
    e.created_at
from comind_pm.pm_events e
left join comind_pm.pm_work_items wi on wi.id = e.work_item_id
left join comind_pm.pm_projects p on p.id = coalesce(e.project_id, wi.project_id);

create or replace view comind_pm.v_runbook_authority
with (security_invoker = true)
as
select
    a.id as authorization_id,
    a.effective_at,
    p.project_key,
    wi.work_key,
    wi.title as work_item_title,
    a.authorization_type,
    a.decision,
    a.scope,
    a.authorized_by,
    a.authorized_by_type,
    a.expires_at,
    a.conditions,
    a.evidence,
    a.source_system,
    a.source_ref,
    a.event_id,
    a.created_at
from comind_pm.pm_authorizations a
left join comind_pm.pm_work_items wi on wi.id = a.work_item_id
left join comind_pm.pm_projects p on p.id = coalesce(a.project_id, wi.project_id);

create or replace view comind_pm.v_runbook_verification
with (security_invoker = true)
as
select
    v.id as verification_id,
    v.verified_at,
    p.project_key,
    wi.work_key,
    wi.title as work_item_title,
    v.verification_type,
    v.check_name,
    v.outcome,
    v.result_summary,
    v.verified_by,
    v.verified_by_type,
    v.evidence,
    v.event_id,
    v.created_at
from comind_pm.pm_verifications v
left join comind_pm.pm_work_items wi on wi.id = v.work_item_id
left join comind_pm.pm_projects p on p.id = coalesce(v.project_id, wi.project_id);

create or replace view comind_pm.v_runbook_lane_state
with (security_invoker = true)
as
select
    p.project_key,
    p.name as project_name,
    wi.work_key,
    wi.title,
    wi.status,
    wi.priority,
    wi.area,
    wi.owner,
    wi.current_summary,
    wi.last_event_at,
    le.event_type as latest_event_type,
    le.outcome as latest_outcome,
    le.result_summary as latest_result,
    le.next_action,
    le.actor as latest_actor,
    le.occurred_at as latest_occurred_at
from comind_pm.pm_work_items wi
join comind_pm.pm_projects p on p.id = wi.project_id
left join lateral (
    select e.event_type, e.outcome, e.result_summary, e.next_action, e.actor, e.occurred_at
    from comind_pm.pm_events e
    where e.work_item_id = wi.id
      and e.consequential = true
    order by e.occurred_at desc, e.created_at desc
    limit 1
) le on true
where wi.item_type = 'lane';

with latest as (
    select distinct on (e.work_item_id)
           e.work_item_id,
           e.occurred_at,
           coalesce(e.result_summary, e.summary) as current_summary,
           e.status_to
    from comind_pm.pm_events e
    where e.work_item_id is not null
      and e.consequential = true
    order by e.work_item_id, e.occurred_at desc, e.created_at desc
)
update comind_pm.pm_work_items wi
set last_event_at = latest.occurred_at,
    current_summary = latest.current_summary,
    status = coalesce(latest.status_to, wi.status)
from latest
where wi.id = latest.work_item_id;

alter table comind_pm.pm_authorizations enable row level security;
alter table comind_pm.pm_verifications enable row level security;
alter table comind_pm.pm_event_links enable row level security;

revoke all on table comind_pm.pm_authorizations from anon, authenticated;
revoke all on table comind_pm.pm_verifications from anon, authenticated;
revoke all on table comind_pm.pm_event_links from anon, authenticated;
revoke all on table comind_pm.v_runbook_timeline from anon, authenticated;
revoke all on table comind_pm.v_runbook_authority from anon, authenticated;
revoke all on table comind_pm.v_runbook_verification from anon, authenticated;
revoke all on table comind_pm.v_runbook_lane_state from anon, authenticated;

revoke all on function comind_pm.record_runbook_event(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,boolean)
from public, anon, authenticated;

grant usage on schema comind_pm to service_role;
grant select, insert, references on table comind_pm.pm_authorizations to service_role;
grant select, insert, references on table comind_pm.pm_verifications to service_role;
grant select, insert, references on table comind_pm.pm_event_links to service_role;
grant select on table comind_pm.v_runbook_timeline to service_role;
grant select on table comind_pm.v_runbook_authority to service_role;
grant select on table comind_pm.v_runbook_verification to service_role;
grant select on table comind_pm.v_runbook_lane_state to service_role;
grant execute on function comind_pm.record_runbook_event(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz,boolean)
to service_role;

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'pm_authorizations',
        'pm_verifications',
        'pm_event_links'
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
