begin;

create table if not exists comind_pm.pm_rule_source_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  source_system text not null,
  source_ref text not null,
  title text not null,
  source_class text not null,
  authority_status text not null default 'unverified',
  source_date timestamptz,
  version_label text,
  parent_source_id uuid references comind_pm.pm_rule_source_documents(id) on delete set null,
  ingestion_status text not null default 'discovered',
  retrieval_completeness text not null default 'unknown',
  content_fingerprint text,
  superseded_by_source_id uuid references comind_pm.pm_rule_source_documents(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, source_system, source_ref),
  check (source_class in ('conversation','drive_document','github_document','github_code','database','library_file','operational_evidence','external_research','other')),
  check (authority_status in ('canonical','current_supporting','approved','draft','historical','superseded','conflicting','unverified')),
  check (ingestion_status in ('discovered','fetched','extracted','partial','inaccessible','reviewed','superseded')),
  check (retrieval_completeness in ('unknown','complete','partial','metadata_only','inaccessible'))
);

create table if not exists comind_pm.pm_rule_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  candidate_key text not null,
  source_document_id uuid not null references comind_pm.pm_rule_source_documents(id) on delete restrict,
  source_locator text,
  source_excerpt text not null,
  normalized_statement text,
  proposed_title text,
  proposed_domain text,
  proposed_rule_type text,
  proposed_modality text,
  proposed_scope jsonb not null default '{}'::jsonb,
  discovery_confidence numeric(5,4),
  authority_confidence numeric(5,4),
  extraction_method text not null default 'manual_review',
  candidate_status text not null default 'discovered',
  duplicate_of_rule_id uuid references comind_pm.pm_rules(id) on delete set null,
  promoted_rule_id uuid references comind_pm.pm_rules(id) on delete set null,
  review_notes text,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, candidate_key),
  check (proposed_modality is null or proposed_modality in ('MUST','MUST_NOT','SHOULD','SHOULD_NOT','MAY')),
  check (candidate_status in ('discovered','normalized','duplicate','possible_conflict','ready_for_review','promoted','rejected','deferred','superseded')),
  check (discovery_confidence is null or (discovery_confidence >= 0 and discovery_confidence <= 1)),
  check (authority_confidence is null or (authority_confidence >= 0 and authority_confidence <= 1))
);

create table if not exists comind_pm.pm_rule_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  rule_id uuid not null references comind_pm.pm_rules(id) on delete cascade,
  related_rule_id uuid not null references comind_pm.pm_rules(id) on delete cascade,
  relationship_type text not null,
  relationship_status text not null default 'proposed',
  confidence numeric(5,4),
  rationale text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  decided_by text,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id, related_rule_id, relationship_type),
  check (rule_id <> related_rule_id),
  check (relationship_type in ('equivalent','overlaps','conflicts_with','supersedes','specializes','generalizes','implements','derived_from','predecessor_of','successor_of','supports','constrains')),
  check (relationship_status in ('proposed','confirmed','rejected','superseded')),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists comind_pm.pm_rule_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  case_key text not null,
  case_type text not null,
  title text not null,
  status text not null default 'open',
  severity text not null default 'normal',
  problem_statement text not null,
  resolution_criteria text,
  resolution_summary text,
  authority_owner text,
  opened_by text not null,
  resolved_by text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  evidence_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, case_key),
  check (case_type in ('duplicate','equivalence','conflict','supersession','authority','scope_overlap','ambiguity','source_gap','activation_review')),
  check (status in ('open','under_review','resolved','deferred','rejected','superseded')),
  check (severity in ('low','normal','high','critical'))
);

create table if not exists comind_pm.pm_rule_reconciliation_members (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references comind_pm.pm_rule_reconciliation_cases(id) on delete cascade,
  rule_id uuid references comind_pm.pm_rules(id) on delete cascade,
  candidate_id uuid references comind_pm.pm_rule_candidates(id) on delete cascade,
  role text not null default 'subject',
  position text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((rule_id is not null) <> (candidate_id is not null))
);

create unique index if not exists uq_rule_reconciliation_member_rule
  on comind_pm.pm_rule_reconciliation_members(case_id, role, rule_id)
  where rule_id is not null;
create unique index if not exists uq_rule_reconciliation_member_candidate
  on comind_pm.pm_rule_reconciliation_members(case_id, role, candidate_id)
  where candidate_id is not null;

create table if not exists comind_pm.pm_rule_archaeology_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  queue_key text not null,
  source_document_id uuid not null references comind_pm.pm_rule_source_documents(id) on delete restrict,
  section_number integer,
  section_title text not null,
  archaeology_status text not null default 'open',
  priority integer not null default 3,
  expected_rule_family text,
  known_evidence text,
  gap_statement text,
  assigned_to text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, queue_key),
  check (archaeology_status in ('open','in_progress','partial','complete','blocked','not_applicable')),
  check (priority between 1 and 5)
);

create index if not exists idx_rule_candidates_status on comind_pm.pm_rule_candidates(project_id,candidate_status,proposed_domain);
create index if not exists idx_rule_relationships_type on comind_pm.pm_rule_relationships(project_id,relationship_type,relationship_status);
create index if not exists idx_rule_reconciliation_status on comind_pm.pm_rule_reconciliation_cases(project_id,status,severity);
create index if not exists idx_rule_archaeology_status on comind_pm.pm_rule_archaeology_queue(project_id,archaeology_status,priority);
create index if not exists idx_rule_source_documents_authority on comind_pm.pm_rule_source_documents(project_id,authority_status,source_date);

create or replace view comind_pm.v_rule_reconciliation_queue as
select c.id,c.project_id,c.case_key,c.case_type,c.title,c.status,c.severity,c.problem_statement,c.resolution_criteria,c.authority_owner,c.opened_at,
       count(m.*) as member_count,
       coalesce(jsonb_agg(jsonb_build_object('role',m.role,'rule_id',m.rule_id,'candidate_id',m.candidate_id,'position',m.position)) filter (where m.case_id is not null),'[]'::jsonb) as members,
       c.evidence_refs,c.metadata
from comind_pm.pm_rule_reconciliation_cases c
left join comind_pm.pm_rule_reconciliation_members m on m.case_id=c.id
group by c.id;

create or replace view comind_pm.v_rule_candidate_review_queue as
select c.*, d.title as source_title,d.source_system,d.source_ref,d.authority_status,d.source_date,d.retrieval_completeness
from comind_pm.pm_rule_candidates c
join comind_pm.pm_rule_source_documents d on d.id=c.source_document_id
where c.candidate_status in ('discovered','normalized','possible_conflict','ready_for_review','deferred');

create or replace view comind_pm.v_rule_archaeology_queue as
select q.*,d.title as source_title,d.source_system,d.source_ref,d.authority_status,d.source_date,d.retrieval_completeness
from comind_pm.pm_rule_archaeology_queue q
join comind_pm.pm_rule_source_documents d on d.id=q.source_document_id;

create or replace function comind_pm.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pm_rule_source_documents_touch on comind_pm.pm_rule_source_documents;
create trigger trg_pm_rule_source_documents_touch before update on comind_pm.pm_rule_source_documents for each row execute function comind_pm.touch_updated_at();
drop trigger if exists trg_pm_rule_candidates_touch on comind_pm.pm_rule_candidates;
create trigger trg_pm_rule_candidates_touch before update on comind_pm.pm_rule_candidates for each row execute function comind_pm.touch_updated_at();
drop trigger if exists trg_pm_rule_relationships_touch on comind_pm.pm_rule_relationships;
create trigger trg_pm_rule_relationships_touch before update on comind_pm.pm_rule_relationships for each row execute function comind_pm.touch_updated_at();
drop trigger if exists trg_pm_rule_reconciliation_cases_touch on comind_pm.pm_rule_reconciliation_cases;
create trigger trg_pm_rule_reconciliation_cases_touch before update on comind_pm.pm_rule_reconciliation_cases for each row execute function comind_pm.touch_updated_at();
drop trigger if exists trg_pm_rule_archaeology_queue_touch on comind_pm.pm_rule_archaeology_queue;
create trigger trg_pm_rule_archaeology_queue_touch before update on comind_pm.pm_rule_archaeology_queue for each row execute function comind_pm.touch_updated_at();

alter table comind_pm.pm_rule_source_documents enable row level security;
alter table comind_pm.pm_rule_candidates enable row level security;
alter table comind_pm.pm_rule_relationships enable row level security;
alter table comind_pm.pm_rule_reconciliation_cases enable row level security;
alter table comind_pm.pm_rule_reconciliation_members enable row level security;
alter table comind_pm.pm_rule_archaeology_queue enable row level security;

create policy service_role_full_access on comind_pm.pm_rule_source_documents for all to service_role using (true) with check (true);
create policy service_role_full_access on comind_pm.pm_rule_candidates for all to service_role using (true) with check (true);
create policy service_role_full_access on comind_pm.pm_rule_relationships for all to service_role using (true) with check (true);
create policy service_role_full_access on comind_pm.pm_rule_reconciliation_cases for all to service_role using (true) with check (true);
create policy service_role_full_access on comind_pm.pm_rule_reconciliation_members for all to service_role using (true) with check (true);
create policy service_role_full_access on comind_pm.pm_rule_archaeology_queue for all to service_role using (true) with check (true);

revoke all on table comind_pm.pm_rule_source_documents from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_candidates from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_relationships from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_reconciliation_cases from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_reconciliation_members from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_archaeology_queue from public, anon, authenticated;

grant all on table comind_pm.pm_rule_source_documents to service_role;
grant all on table comind_pm.pm_rule_candidates to service_role;
grant all on table comind_pm.pm_rule_relationships to service_role;
grant all on table comind_pm.pm_rule_reconciliation_cases to service_role;
grant all on table comind_pm.pm_rule_reconciliation_members to service_role;
grant all on table comind_pm.pm_rule_archaeology_queue to service_role;
grant select on comind_pm.v_rule_reconciliation_queue to service_role;
grant select on comind_pm.v_rule_candidate_review_queue to service_role;
grant select on comind_pm.v_rule_archaeology_queue to service_role;

commit;
