-- CoMind Operator Cockpit v2
-- Proposed browser-facing data contract for a governed Supabase implementation.
-- DESIGN ONLY. Do not apply to production without migration review, RLS review,
-- isolated verification, and explicit production authorization.

create schema if not exists comind_ops;

create table if not exists comind_ops.development_lanes (
  lane_id text primary key,
  name text not null,
  status text not null check (status in ('planned','active','review','held','complete','closed')),
  owner_agent_key text,
  authority_tier text not null check (authority_tier in ('T0','T1','T2','T3')),
  summary text not null,
  repository_url text,
  source_issue_url text,
  source_pr_url text,
  updated_at timestamptz not null default now()
);

create table if not exists comind_ops.human_actions (
  action_id bigint generated always as identity primary key,
  lane_id text references comind_ops.development_lanes(lane_id),
  title text not null,
  tier text not null check (tier in ('T1','T2','T3')),
  reason text not null,
  recommendation text,
  status text not null default 'open' check (status in ('open','approved','held','rejected','superseded')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

create table if not exists comind_ops.agent_registry (
  agent_key text primary key,
  display_name text not null,
  agent_kind text not null check (agent_kind in ('agent','virtual_employee','watchdog','governor','manager')),
  authority_ceiling text not null check (authority_ceiling in ('T0','T1','T2','T3')),
  active boolean not null default true,
  description text not null
);

create table if not exists comind_ops.agent_work_state (
  agent_key text primary key references comind_ops.agent_registry(agent_key),
  lane_id text references comind_ops.development_lanes(lane_id),
  work_summary text not null,
  load_percent smallint check (load_percent between 0 and 100),
  evidence_fresh_at timestamptz,
  state text not null check (state in ('idle','working','waiting','held','blocked','review')),
  updated_at timestamptz not null default now()
);

create table if not exists comind_ops.runbook_events (
  event_id bigint generated always as identity primary key,
  lane_id text references comind_ops.development_lanes(lane_id),
  event_type text not null,
  summary text not null,
  outcome text,
  authority_tier text check (authority_tier in ('T0','T1','T2','T3')),
  source_kind text,
  source_ref text,
  occurred_at timestamptz not null default now(),
  recorded_by text not null
);

create table if not exists comind_ops.evidence_records (
  evidence_id bigint generated always as identity primary key,
  lane_id text references comind_ops.development_lanes(lane_id),
  evidence_type text not null,
  title text not null,
  source_kind text not null,
  source_ref text not null,
  source_sha256 text,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz not null default now()
);

create table if not exists comind_ops.module_registry (
  module_key text primary key,
  display_name text not null,
  purpose text not null,
  owner_agent_key text references comind_ops.agent_registry(agent_key),
  active boolean not null default true
);

create table if not exists comind_ops.module_relationships (
  parent_module_key text not null references comind_ops.module_registry(module_key),
  child_module_key text not null references comind_ops.module_registry(module_key),
  relationship_type text not null,
  primary key (parent_module_key, child_module_key, relationship_type)
);

create or replace view comind_ops.operator_open_actions
with (security_invoker = true)
as
select
  action_id, lane_id, title, tier, reason, recommendation,
  status, requested_at
from comind_ops.human_actions
where status = 'open'
order by requested_at desc;

create or replace view comind_ops.operator_lane_summary
with (security_invoker = true)
as
select
  l.lane_id,
  l.name,
  l.status,
  l.authority_tier,
  l.summary,
  w.agent_key as owner_agent_key,
  w.state as agent_state,
  w.work_summary,
  w.evidence_fresh_at,
  l.updated_at
from comind_ops.development_lanes l
left join comind_ops.agent_work_state w on w.lane_id = l.lane_id;

-- Security intent for later migration:
-- 1. Keep comind_ops unexposed unless a deliberate Data API schema decision is made.
-- 2. If browser access is required, expose only reviewed security_invoker views.
-- 3. Grant browser roles only the minimal SELECT/UPDATE privileges required.
-- 4. Enable RLS on every exposed table and use explicit ownership/authority predicates.
-- 5. Never expose service_role or secret keys to browser code.
