begin;

create schema if not exists comind_development;

create table if not exists comind_development.entity (
  entity_id uuid primary key default gen_random_uuid(),
  tracking_key text not null unique,
  entity_type text not null,
  title text,
  summary text,
  status text not null default 'active',
  project_key text,
  lane_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  canonical_payload jsonb not null default '{}'::jsonb,
  current_version bigint not null default 1,
  source_of_truth text not null default 'postgresql',
  retention_class text not null default 'durable',
  constraint entity_tracking_key_nonempty check (btrim(tracking_key) <> ''),
  constraint entity_type_nonempty check (btrim(entity_type) <> ''),
  constraint entity_current_version_check check (current_version > 0)
);

create table if not exists comind_development.relationship (
  relationship_id uuid primary key default gen_random_uuid(),
  relationship_key text not null unique,
  subject_entity_id uuid not null references comind_development.entity(entity_id) on delete restrict,
  predicate text not null,
  object_entity_id uuid not null references comind_development.entity(entity_id) on delete restrict,
  evidence_entity_id uuid references comind_development.entity(entity_id) on delete restrict,
  confidence numeric,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  relationship_payload jsonb not null default '{}'::jsonb,
  constraint relationship_key_nonempty check (btrim(relationship_key) <> ''),
  constraint relationship_predicate_nonempty check (btrim(predicate) <> ''),
  constraint relationship_not_self check (subject_entity_id <> object_entity_id),
  constraint relationship_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint relationship_valid_window check (valid_to is null or valid_to >= valid_from)
);

create index if not exists entity_created_at_idx
  on comind_development.entity(created_at desc);
create index if not exists entity_project_lane_idx
  on comind_development.entity(project_key,lane_key);
create index if not exists entity_type_status_idx
  on comind_development.entity(entity_type,status);

create unique index if not exists relationship_active_unique_idx
  on comind_development.relationship(subject_entity_id,predicate,object_entity_id)
  where valid_to is null;
create index if not exists relationship_object_idx
  on comind_development.relationship(object_entity_id,predicate);
create index if not exists relationship_subject_idx
  on comind_development.relationship(subject_entity_id,predicate);

create or replace view comind_development.v_architecture_evolution as
select * from comind_development.entity
where entity_type in ('architecture_change','architecture_state');

create or replace view comind_development.v_assumptions as
select * from comind_development.entity
where entity_type='assumption';

create or replace view comind_development.v_authority as
select * from comind_development.entity
where entity_type in ('authority','approval');

create or replace view comind_development.v_decisions as
select * from comind_development.entity
where entity_type='decision';

create or replace view comind_development.v_dependencies as
select * from comind_development.entity
where entity_type in ('dependency','technology','external_capability');

create or replace view comind_development.v_failures as
select * from comind_development.entity
where entity_type in ('failure','incident','workaround');

create or replace view comind_development.v_lessons as
select * from comind_development.entity
where entity_type='lesson';

create or replace view comind_development.v_open_questions as
select * from comind_development.entity
where entity_type='question' and status not in ('resolved','closed');

create or replace view comind_development.v_research as
select * from comind_development.entity
where entity_type in ('research_source','research_finding');

create or replace view comind_development.v_tests as
select * from comind_development.entity
where entity_type in ('test','verification');

revoke all on schema comind_development from public, anon, authenticated;
revoke all on table comind_development.entity from public, anon, authenticated, service_role;
revoke all on table comind_development.relationship from public, anon, authenticated, service_role;

commit;
