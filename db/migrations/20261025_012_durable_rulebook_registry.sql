begin;

create table if not exists comind_pm.pm_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  rule_key text not null,
  title text not null,
  domain text not null,
  rule_type text not null,
  modality text not null default 'MUST',
  status text not null default 'candidate',
  scope jsonb not null default '{}'::jsonb,
  enforcement_mode text not null default 'informational',
  machine_checkable boolean not null default false,
  current_version integer not null default 1,
  decided_at timestamptz,
  effective_at timestamptz,
  recorded_at timestamptz not null default now(),
  review_due_at timestamptz,
  owner text,
  supersedes_rule_id uuid references comind_pm.pm_rules(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_rules_project_key_unique unique (project_id, rule_key),
  constraint pm_rules_modality_check check (modality in ('MUST','MUST_NOT','SHOULD','SHOULD_NOT','MAY')),
  constraint pm_rules_status_check check (status in ('candidate','proposed','specified','approved','active','superseded','deprecated','retired')),
  constraint pm_rules_enforcement_check check (enforcement_mode in ('informational','review_required','automated_gate','hard_constraint'))
);

create table if not exists comind_pm.pm_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references comind_pm.pm_rules(id) on delete cascade,
  version integer not null,
  rule_text text not null,
  formal_rule jsonb not null default '{}'::jsonb,
  rationale text,
  authority text,
  authority_type text,
  approval_status text not null default 'unreviewed',
  decision_ref text,
  source_refs jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  effective_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pm_rule_versions_unique unique (rule_id, version),
  constraint pm_rule_versions_approval_check check (approval_status in ('unreviewed','candidate','proposed','approved','rejected','superseded'))
);

create table if not exists comind_pm.pm_rule_sources (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references comind_pm.pm_rules(id) on delete cascade,
  rule_version integer not null,
  source_system text not null,
  source_ref text not null,
  source_title text,
  source_date timestamptz,
  source_locator text,
  evidence_class text not null,
  source_excerpt text,
  discovery_confidence numeric(5,4),
  discovered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint pm_rule_sources_version_fk foreign key (rule_id, rule_version)
    references comind_pm.pm_rule_versions(rule_id, version) on delete cascade,
  constraint pm_rule_sources_evidence_class_check check (evidence_class in ('conversation','document','code','integration','operational','database','policy')),
  constraint pm_rule_sources_confidence_check check (discovery_confidence is null or (discovery_confidence >= 0 and discovery_confidence <= 1))
);

create table if not exists comind_pm.pm_rule_event_links (
  rule_id uuid not null references comind_pm.pm_rules(id) on delete cascade,
  event_id uuid not null references comind_pm.pm_events(id) on delete cascade,
  relation_type text not null,
  created_at timestamptz not null default now(),
  primary key (rule_id, event_id, relation_type)
);

create index if not exists idx_pm_rules_status_domain on comind_pm.pm_rules(status, domain);
create index if not exists idx_pm_rules_effective_at on comind_pm.pm_rules(effective_at);
create index if not exists idx_pm_rule_sources_ref on comind_pm.pm_rule_sources(source_system, source_ref);
create index if not exists idx_pm_rule_event_links_event on comind_pm.pm_rule_event_links(event_id);

create or replace view comind_pm.v_durable_rulebook as
select
  r.id,
  r.project_id,
  r.rule_key,
  r.title,
  r.domain,
  r.rule_type,
  r.modality,
  r.status,
  r.scope,
  r.enforcement_mode,
  r.machine_checkable,
  r.current_version,
  rv.rule_text,
  rv.formal_rule,
  rv.rationale,
  rv.authority,
  rv.authority_type,
  rv.approval_status,
  rv.decision_ref,
  rv.source_refs,
  rv.evidence_refs,
  rv.exceptions,
  rv.validation,
  r.decided_at,
  coalesce(rv.effective_at, r.effective_at) as effective_at,
  r.recorded_at,
  r.review_due_at,
  r.owner,
  r.supersedes_rule_id,
  r.metadata,
  r.created_at,
  r.updated_at
from comind_pm.pm_rules r
join comind_pm.pm_rule_versions rv
  on rv.rule_id = r.id
 and rv.version = r.current_version;

alter table comind_pm.pm_rules enable row level security;
alter table comind_pm.pm_rule_versions enable row level security;
alter table comind_pm.pm_rule_sources enable row level security;
alter table comind_pm.pm_rule_event_links enable row level security;

drop policy if exists service_role_full_access on comind_pm.pm_rules;
create policy service_role_full_access on comind_pm.pm_rules for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_versions;
create policy service_role_full_access on comind_pm.pm_rule_versions for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_sources;
create policy service_role_full_access on comind_pm.pm_rule_sources for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_event_links;
create policy service_role_full_access on comind_pm.pm_rule_event_links for all to service_role using (true) with check (true);

revoke all on table comind_pm.pm_rules from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_versions from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_sources from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_event_links from public, anon, authenticated;

grant all on table comind_pm.pm_rules to service_role;
grant all on table comind_pm.pm_rule_versions to service_role;
grant all on table comind_pm.pm_rule_sources to service_role;
grant all on table comind_pm.pm_rule_event_links to service_role;
grant select on comind_pm.v_durable_rulebook to service_role;

commit;
