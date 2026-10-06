-- CoMind Project Management Ledger Schema v0.1
-- Target: Supabase Postgres
-- Purpose: Lightweight source of truth for projects, work items, agent progress,
--          cross-system links, recovery snapshots, decisions, and risks.
-- Notes:
-- 1. This schema is private by default. Do not expose it through the Data API
--    until access policies are intentionally designed.
-- 2. pm_events is append-only. Current state lives on pm_work_items, while
--    historical truth lives in pm_events.
-- 3. Deployed to the CoMind Supabase project on 2026-10-06 before GitHub capture.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists comind_pm;

revoke all on schema comind_pm from public;
revoke all on schema comind_pm from anon;
revoke all on schema comind_pm from authenticated;

grant usage on schema comind_pm to service_role;

create table if not exists comind_pm.pm_projects (
    id uuid primary key default gen_random_uuid(),
    project_key text not null unique,
    name text not null,
    summary text,
    status text not null default 'active'
        check (status in ('active', 'paused', 'completed', 'archived')),
    priority integer not null default 3
        check (priority between 1 and 5),
    owner text,
    source_system text,
    source_ref text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists comind_pm.pm_work_items (
    id uuid primary key default gen_random_uuid(),
    work_key text not null unique,
    project_id uuid not null references comind_pm.pm_projects(id) on delete cascade,
    parent_id uuid references comind_pm.pm_work_items(id) on delete set null,
    title text not null,
    description text,
    item_type text not null default 'task'
        check (item_type in (
            'epic',
            'task',
            'bug',
            'decision',
            'risk',
            'blocker',
            'research',
            'milestone',
            'audit',
            'document'
        )),
    status text not null default 'backlog'
        check (status in (
            'backlog',
            'ready',
            'in_progress',
            'blocked',
            'review',
            'done',
            'canceled',
            'deferred'
        )),
    priority text not null default 'medium'
        check (priority in ('urgent', 'high', 'medium', 'low')),
    area text,
    owner text,
    assignee text,
    due_date date,
    canonical_source text not null default 'supabase'
        check (canonical_source in ('supabase', 'github', 'notion', 'drive', 'linear')),
    confidence text not null default 'medium'
        check (confidence in ('low', 'medium', 'high')),
    current_summary text,
    last_event_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists comind_pm.pm_work_item_dependencies (
    work_item_id uuid not null references comind_pm.pm_work_items(id) on delete cascade,
    depends_on_work_item_id uuid not null references comind_pm.pm_work_items(id) on delete cascade,
    relationship text not null default 'blocks'
        check (relationship in ('blocks', 'depends_on', 'related_to', 'duplicates', 'supersedes')),
    note text,
    created_at timestamptz not null default now(),
    primary key (work_item_id, depends_on_work_item_id, relationship),
    check (work_item_id <> depends_on_work_item_id)
);

create table if not exists comind_pm.pm_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references comind_pm.pm_projects(id) on delete cascade,
    work_item_id uuid references comind_pm.pm_work_items(id) on delete cascade,
    event_type text not null
        check (event_type in (
            'created',
            'status_change',
            'agent_update',
            'human_update',
            'sync',
            'comment',
            'decision',
            'risk_update',
            'blocker_update',
            'snapshot',
            'recovery',
            'link_added'
        )),
    actor text not null,
    actor_type text not null default 'human'
        check (actor_type in ('human', 'agent', 'system', 'connector')),
    source_system text not null default 'supabase'
        check (source_system in ('supabase', 'github', 'notion', 'drive', 'linear', 'chatgpt', 'manual')),
    source_ref text,
    summary text not null,
    details jsonb not null default '{}'::jsonb,
    evidence jsonb not null default '[]'::jsonb,
    next_action text,
    status_from text,
    status_to text,
    created_at timestamptz not null default now(),
    check (project_id is not null or work_item_id is not null)
);

create table if not exists comind_pm.pm_links (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references comind_pm.pm_projects(id) on delete cascade,
    work_item_id uuid references comind_pm.pm_work_items(id) on delete cascade,
    link_type text not null
        check (link_type in (
            'github_issue',
            'github_pr',
            'notion_page',
            'drive_file',
            'drive_folder',
            'linear_issue',
            'supabase_record',
            'chatgpt_conversation',
            'external_reference',
            'artifact'
        )),
    system text not null
        check (system in ('github', 'notion', 'drive', 'linear', 'supabase', 'chatgpt', 'external')),
    title text,
    url text,
    external_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (project_id is not null or work_item_id is not null),
    check (url is not null or external_id is not null)
);

create table if not exists comind_pm.pm_agent_runs (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references comind_pm.pm_projects(id) on delete set null,
    work_item_id uuid references comind_pm.pm_work_items(id) on delete set null,
    agent_name text not null,
    agent_role text,
    run_status text not null default 'started'
        check (run_status in ('started', 'succeeded', 'failed', 'blocked', 'needs_review')),
    prompt_summary text,
    input_refs jsonb not null default '[]'::jsonb,
    output_summary text,
    output_refs jsonb not null default '[]'::jsonb,
    evidence jsonb not null default '[]'::jsonb,
    needs_human_review boolean not null default false,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists comind_pm.pm_decision_records (
    id uuid primary key default gen_random_uuid(),
    work_item_id uuid not null unique references comind_pm.pm_work_items(id) on delete cascade,
    decision_needed text not null,
    options jsonb not null default '[]'::jsonb,
    selected_option text,
    rationale text,
    reversibility text not null default 'unknown'
        check (reversibility in ('easy', 'moderate', 'hard', 'irreversible', 'unknown')),
    decided_by text,
    decided_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists comind_pm.pm_risk_records (
    id uuid primary key default gen_random_uuid(),
    work_item_id uuid not null unique references comind_pm.pm_work_items(id) on delete cascade,
    risk_statement text not null,
    impact text not null default 'medium'
        check (impact in ('low', 'medium', 'high', 'critical')),
    likelihood text not null default 'medium'
        check (likelihood in ('low', 'medium', 'high')),
    mitigation text,
    contingency text,
    risk_owner text,
    review_date date,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists comind_pm.pm_snapshots (
    id uuid primary key default gen_random_uuid(),
    snapshot_key text not null unique,
    project_id uuid references comind_pm.pm_projects(id) on delete set null,
    title text not null,
    snapshot_type text not null default 'status'
        check (snapshot_type in ('status', 'recovery', 'weekly_digest', 'export', 'audit')),
    summary text,
    status_json jsonb not null default '{}'::jsonb,
    file_url text,
    source_system text not null default 'supabase'
        check (source_system in ('supabase', 'github', 'notion', 'drive', 'linear', 'chatgpt', 'manual')),
    created_by text not null,
    created_at timestamptz not null default now()
);

create table if not exists comind_pm.pm_sync_cursors (
    system text primary key
        check (system in ('github', 'notion', 'drive', 'linear', 'supabase', 'chatgpt')),
    last_seen_at timestamptz,
    cursor_value text,
    sync_status text not null default 'unknown'
        check (sync_status in ('unknown', 'healthy', 'degraded', 'failed', 'paused')),
    details jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists idx_pm_work_items_project_status
    on comind_pm.pm_work_items(project_id, status);

create index if not exists idx_pm_work_items_type_status
    on comind_pm.pm_work_items(item_type, status);

create index if not exists idx_pm_work_items_area
    on comind_pm.pm_work_items(area);

create index if not exists idx_pm_events_work_item_created
    on comind_pm.pm_events(work_item_id, created_at desc);

create index if not exists idx_pm_events_project_created
    on comind_pm.pm_events(project_id, created_at desc);

create index if not exists idx_pm_links_work_item
    on comind_pm.pm_links(work_item_id);

create index if not exists idx_pm_agent_runs_work_item_started
    on comind_pm.pm_agent_runs(work_item_id, started_at desc);

create or replace function comind_pm.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = comind_pm, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_pm_projects_updated_at on comind_pm.pm_projects;
create trigger trg_pm_projects_updated_at
before update on comind_pm.pm_projects
for each row execute function comind_pm.set_updated_at();

drop trigger if exists trg_pm_work_items_updated_at on comind_pm.pm_work_items;
create trigger trg_pm_work_items_updated_at
before update on comind_pm.pm_work_items
for each row execute function comind_pm.set_updated_at();

drop trigger if exists trg_pm_decision_records_updated_at on comind_pm.pm_decision_records;
create trigger trg_pm_decision_records_updated_at
before update on comind_pm.pm_decision_records
for each row execute function comind_pm.set_updated_at();

drop trigger if exists trg_pm_risk_records_updated_at on comind_pm.pm_risk_records;
create trigger trg_pm_risk_records_updated_at
before update on comind_pm.pm_risk_records
for each row execute function comind_pm.set_updated_at();

create or replace function comind_pm.prevent_pm_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = comind_pm, pg_temp
as $$
begin
    raise exception 'pm_events is append-only. Insert a corrective event instead.';
end;
$$;

drop trigger if exists trg_pm_events_no_update on comind_pm.pm_events;
create trigger trg_pm_events_no_update
before update on comind_pm.pm_events
for each row execute function comind_pm.prevent_pm_event_mutation();

drop trigger if exists trg_pm_events_no_delete on comind_pm.pm_events;
create trigger trg_pm_events_no_delete
before delete on comind_pm.pm_events
for each row execute function comind_pm.prevent_pm_event_mutation();

create or replace function comind_pm.log_work_item_event(
    p_work_key text,
    p_event_type text,
    p_actor text,
    p_actor_type text,
    p_summary text,
    p_source_system text default 'manual',
    p_source_ref text default null,
    p_details jsonb default '{}'::jsonb,
    p_evidence jsonb default '[]'::jsonb,
    p_next_action text default null,
    p_status_to text default null
)
returns uuid
language plpgsql
security invoker
set search_path = comind_pm, pg_temp
as $$
declare
    v_work_item comind_pm.pm_work_items%rowtype;
    v_event_id uuid;
begin
    select *
      into v_work_item
      from comind_pm.pm_work_items
     where work_key = p_work_key;

    if not found then
        raise exception 'Unknown work_key: %', p_work_key;
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
        details,
        evidence,
        next_action,
        status_from,
        status_to
    )
    values (
        v_work_item.project_id,
        v_work_item.id,
        p_event_type,
        p_actor,
        p_actor_type,
        p_source_system,
        p_source_ref,
        p_summary,
        p_details,
        p_evidence,
        p_next_action,
        v_work_item.status,
        p_status_to
    )
    returning id into v_event_id;

    update comind_pm.pm_work_items
       set status = coalesce(p_status_to, status),
           current_summary = p_summary,
           last_event_at = now()
     where id = v_work_item.id;

    return v_event_id;
end;
$$;

create or replace view comind_pm.v_work_item_overview as
select
    p.project_key,
    p.name as project_name,
    wi.work_key,
    wi.title,
    wi.item_type,
    wi.status,
    wi.priority,
    wi.area,
    wi.owner,
    wi.assignee,
    wi.due_date,
    wi.current_summary,
    wi.last_event_at,
    wi.created_at,
    wi.updated_at
from comind_pm.pm_work_items wi
join comind_pm.pm_projects p on p.id = wi.project_id;

create or replace view comind_pm.v_open_blockers as
select
    p.project_key,
    wi.work_key,
    wi.title,
    wi.priority,
    wi.area,
    wi.owner,
    wi.assignee,
    wi.current_summary,
    wi.last_event_at
from comind_pm.pm_work_items wi
join comind_pm.pm_projects p on p.id = wi.project_id
where wi.status = 'blocked'
   or wi.item_type = 'blocker';

create or replace view comind_pm.v_recent_agent_activity as
select
    ar.agent_name,
    ar.agent_role,
    ar.run_status,
    p.project_key,
    wi.work_key,
    wi.title as work_item_title,
    ar.output_summary,
    ar.needs_human_review,
    ar.started_at,
    ar.completed_at
from comind_pm.pm_agent_runs ar
left join comind_pm.pm_projects p on p.id = ar.project_id
left join comind_pm.pm_work_items wi on wi.id = ar.work_item_id
order by ar.started_at desc;

create or replace view comind_pm.v_recovery_export as
select
    p.project_key,
    wi.work_key,
    wi.title,
    wi.item_type,
    wi.status,
    wi.priority,
    wi.area,
    wi.current_summary,
    coalesce(
        jsonb_agg(
            distinct jsonb_build_object(
                'system', l.system,
                'link_type', l.link_type,
                'title', l.title,
                'url', l.url,
                'external_id', l.external_id
            )
        ) filter (where l.id is not null),
        '[]'::jsonb
    ) as links,
    wi.last_event_at,
    wi.updated_at
from comind_pm.pm_work_items wi
join comind_pm.pm_projects p on p.id = wi.project_id
left join comind_pm.pm_links l on l.work_item_id = wi.id
group by
    p.project_key,
    wi.work_key,
    wi.title,
    wi.item_type,
    wi.status,
    wi.priority,
    wi.area,
    wi.current_summary,
    wi.last_event_at,
    wi.updated_at;

alter table comind_pm.pm_projects enable row level security;
alter table comind_pm.pm_work_items enable row level security;
alter table comind_pm.pm_work_item_dependencies enable row level security;
alter table comind_pm.pm_events enable row level security;
alter table comind_pm.pm_links enable row level security;
alter table comind_pm.pm_agent_runs enable row level security;
alter table comind_pm.pm_decision_records enable row level security;
alter table comind_pm.pm_risk_records enable row level security;
alter table comind_pm.pm_snapshots enable row level security;
alter table comind_pm.pm_sync_cursors enable row level security;

grant all on all tables in schema comind_pm to service_role;
grant all on all sequences in schema comind_pm to service_role;
grant execute on all functions in schema comind_pm to service_role;

insert into comind_pm.pm_projects (
    project_key,
    name,
    summary,
    status,
    priority,
    owner,
    source_system,
    source_ref
)
values (
    'COMIND',
    'CoMind',
    'Governed persistent cognition platform with memory, agent routing, provenance, and human oversight.',
    'active',
    1,
    'Joseph Hogarth',
    'manual',
    'conversation:2026-10-06'
)
on conflict (project_key) do nothing;

insert into comind_pm.pm_work_items (
    work_key,
    project_id,
    title,
    description,
    item_type,
    status,
    priority,
    area,
    owner,
    canonical_source,
    current_summary
)
select
    seed.work_key,
    p.id,
    seed.title,
    seed.description,
    seed.item_type,
    seed.status,
    seed.priority,
    seed.area,
    seed.owner,
    'supabase',
    seed.current_summary
from comind_pm.pm_projects p
cross join (
    values
    (
        'CM-PM-001',
        'Establish project management recovery system',
        'Create a resilient project tracking architecture using Supabase, GitHub, Notion, Drive, and optional Linear mirroring.',
        'task',
        'ready',
        'high',
        'Project Management',
        'Joseph Hogarth',
        'Supabase ledger proposed. Next step is schema review and controlled execution.'
    ),
    (
        'CM-DB-001',
        'Confirm authoritative Supabase project and database path',
        'Identify the correct Supabase project, connection method, and migration path before executing PM ledger DDL.',
        'task',
        'ready',
        'high',
        'Data and Database',
        'Joseph Hogarth',
        'Blocked until authoritative Supabase project is confirmed.'
    ),
    (
        'CM-AGENT-001',
        'Define Virtual Employee progress logging contract',
        'Standardize how agents record work, evidence, status changes, links, and next actions into the PM ledger.',
        'task',
        'backlog',
        'medium',
        'Agents',
        'Joseph Hogarth',
        'Use pm_agent_runs and pm_events as the base contract.'
    )
) as seed(work_key, title, description, item_type, status, priority, area, owner, current_summary)
where p.project_key = 'COMIND'
on conflict (work_key) do nothing;

insert into comind_pm.pm_events (
    project_id,
    work_item_id,
    event_type,
    actor,
    actor_type,
    source_system,
    source_ref,
    summary,
    details,
    evidence,
    next_action
)
select
    wi.project_id,
    wi.id,
    'created',
    'Codex',
    'agent',
    'chatgpt',
    'conversation:2026-10-06',
    'Seeded initial CoMind PM ledger work item.',
    jsonb_build_object('work_key', wi.work_key),
    jsonb_build_array('conversation:2026-10-06'),
    'Review schema, confirm target Supabase project, then execute in a controlled migration.'
from comind_pm.pm_work_items wi
where wi.work_key in ('CM-PM-001', 'CM-DB-001', 'CM-AGENT-001')
  and not exists (
      select 1
        from comind_pm.pm_events e
       where e.work_item_id = wi.id
         and e.event_type = 'created'
         and e.source_ref = 'conversation:2026-10-06'
  );
