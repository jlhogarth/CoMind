begin;

alter table comind_development.entity enable row level security;
alter table comind_development.relationship enable row level security;

revoke all on table comind_development.entity from public, anon, authenticated, service_role;
revoke all on table comind_development.relationship from public, anon, authenticated, service_role;

create index if not exists entity_rule_projection_idx
  on comind_development.entity(tracking_key,current_version)
  where entity_type='rule' and source_of_truth='comind_pm.pm_rules';

create or replace function comind_development.edg_sync_rulebook_projections(
  p_evidence_ref text,
  p_actor text default 'EDG-002'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_id uuid;
  v_canonical_count integer:=0;
  v_changed integer:=0;
  v_orphaned integer:=0;
  v_projected integer:=0;
begin
  if nullif(btrim(p_evidence_ref),'') is null then
    raise exception 'EDG-002 requires a non-empty evidence reference';
  end if;
  if nullif(btrim(p_actor),'') is null then
    raise exception 'EDG-002 requires a non-empty actor';
  end if;

  select id into v_project_id
  from comind_pm.pm_projects
  where project_key='COMIND';
  if not found then
    raise exception 'EDG-002 COMIND project not found';
  end if;

  if exists(
    select 1
    from comind_pm.pm_rules r
    join comind_development.entity e on e.tracking_key=r.rule_key
    where r.project_id=v_project_id
      and (e.entity_type<>'rule' or e.source_of_truth<>'comind_pm.pm_rules')
  ) then
    raise exception 'EDG-002 canonical RULE-* key collides with a non-Rulebook graph entity';
  end if;

  select count(*) into v_canonical_count
  from comind_pm.pm_rules
  where project_id=v_project_id;

  insert into comind_development.entity(
    tracking_key,entity_type,title,summary,status,project_key,lane_key,
    created_by,canonical_payload,current_version,source_of_truth,retention_class
  )
  select
    r.rule_key,
    'rule',
    r.title,
    'Pointer to the canonical Durable Rulebook record; authoritative content is resolved from comind_pm at query time.',
    'projection_current',
    'COMIND',
    'RULEBOOK',
    p_actor,
    jsonb_build_object(
      'canonical_rule_id',r.id,
      'canonical_rule_key',r.rule_key,
      'canonical_schema','comind_pm',
      'canonical_table','pm_rules',
      'canonical_version_table','pm_rule_versions',
      'projection_role','rule_index_pointer',
      'authority_boundary','Non-authoritative EDG projection; canonical Rulebook authority resides in comind_pm',
      'last_sync_evidence_ref',p_evidence_ref
    ),
    r.current_version,
    'comind_pm.pm_rules',
    'durable'
  from comind_pm.pm_rules r
  where r.project_id=v_project_id
  on conflict (tracking_key) do update
  set
    entity_type=excluded.entity_type,
    title=excluded.title,
    summary=excluded.summary,
    status=excluded.status,
    project_key=excluded.project_key,
    lane_key=excluded.lane_key,
    updated_at=statement_timestamp(),
    canonical_payload=excluded.canonical_payload,
    current_version=excluded.current_version,
    source_of_truth=excluded.source_of_truth,
    retention_class=excluded.retention_class
  where comind_development.entity.entity_type='rule'
    and comind_development.entity.source_of_truth='comind_pm.pm_rules'
    and (
      comind_development.entity.title is distinct from excluded.title
      or comind_development.entity.summary is distinct from excluded.summary
      or comind_development.entity.status is distinct from excluded.status
      or comind_development.entity.project_key is distinct from excluded.project_key
      or comind_development.entity.lane_key is distinct from excluded.lane_key
      or comind_development.entity.canonical_payload is distinct from excluded.canonical_payload
      or comind_development.entity.current_version is distinct from excluded.current_version
      or comind_development.entity.retention_class is distinct from excluded.retention_class
    );
  get diagnostics v_changed = row_count;

  update comind_development.entity e
  set
    status='projection_orphaned',
    updated_at=statement_timestamp(),
    canonical_payload=e.canonical_payload || jsonb_build_object(
      'authority_boundary','Historical EDG projection; canonical Rulebook row no longer resolves',
      'last_sync_evidence_ref',p_evidence_ref
    )
  where e.entity_type='rule'
    and e.source_of_truth='comind_pm.pm_rules'
    and e.project_key='COMIND'
    and not exists(
      select 1
      from comind_pm.pm_rules r
      where r.project_id=v_project_id
        and r.rule_key=e.tracking_key
        and r.id::text=e.canonical_payload->>'canonical_rule_id'
    )
    and (
      e.status is distinct from 'projection_orphaned'
      or e.canonical_payload->>'last_sync_evidence_ref' is distinct from p_evidence_ref
    );
  get diagnostics v_orphaned = row_count;

  select count(*) into v_projected
  from comind_development.entity e
  where e.entity_type='rule'
    and e.source_of_truth='comind_pm.pm_rules'
    and e.project_key='COMIND'
    and e.status='projection_current';

  return jsonb_build_object(
    'canonical_rule_count',v_canonical_count,
    'current_projection_count',v_projected,
    'changed_projection_count',v_changed,
    'orphaned_projection_updates',v_orphaned,
    'evidence_ref',p_evidence_ref
  );
end;
$$;

create or replace view comind_development.v_rulebook_graph
with (security_barrier=true)
as
select
  e.entity_id as graph_entity_id,
  e.tracking_key as rule_key,
  e.title as projection_title,
  e.status as projection_status,
  e.current_version as projection_current_version_pointer,
  e.canonical_payload as projection_metadata,
  false as projection_is_authoritative,
  'comind_pm.pm_rules + comind_pm.pm_rule_versions'::text as canonical_authority_locator,
  r.id as canonical_rule_id,
  r.project_id,
  r.title as canonical_title,
  r.domain,
  r.rule_type,
  r.modality,
  r.status as canonical_rule_status,
  r.scope,
  r.enforcement_mode,
  r.machine_checkable,
  r.current_version as canonical_current_version,
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
  coalesce(rv.effective_at,r.effective_at) as effective_at,
  r.review_due_at,
  r.owner as canonical_owner,
  r.supersedes_rule_id,
  r.metadata as canonical_rule_metadata,
  e.updated_at as projection_updated_at
from comind_development.entity e
left join comind_pm.pm_rules r
  on r.rule_key=e.tracking_key
 and r.id::text=e.canonical_payload->>'canonical_rule_id'
left join comind_pm.pm_rule_versions rv
  on rv.rule_id=r.id
 and rv.version=r.current_version
where e.entity_type='rule'
  and e.source_of_truth='comind_pm.pm_rules';

create or replace view comind_development.v_rule_graph_relationships
with (security_barrier=true)
as
select
  rel.relationship_id,
  rel.relationship_key,
  s.tracking_key as subject_key,
  s.entity_type as subject_type,
  rel.predicate,
  o.tracking_key as object_key,
  o.entity_type as object_type,
  ev.tracking_key as evidence_key,
  rel.confidence,
  rel.valid_from,
  rel.valid_to,
  case when rel.valid_to is null then 'current' else 'retired' end as relationship_lifecycle,
  rel.relationship_payload,
  false as relationship_establishes_rule_authority
from comind_development.relationship rel
join comind_development.entity s on s.entity_id=rel.subject_entity_id
join comind_development.entity o on o.entity_id=rel.object_entity_id
left join comind_development.entity ev on ev.entity_id=rel.evidence_entity_id
where s.entity_type='rule' or o.entity_type='rule';

comment on view comind_development.v_rulebook_graph is
  'EDG-002 read model. Graph metadata is non-authoritative; canonical rule state is joined from comind_pm at query time.';
comment on view comind_development.v_rule_graph_relationships is
  'EDG-002 relationship read model for Rulebook projections. Relationships provide navigation/provenance and do not establish Rulebook authority.';

revoke all on function comind_development.edg_sync_rulebook_projections(text,text) from public, anon, authenticated;
revoke all on table comind_development.v_rulebook_graph from public, anon, authenticated;
revoke all on table comind_development.v_rule_graph_relationships from public, anon, authenticated;

grant usage on schema comind_development to service_role;
grant execute on function comind_development.edg_sync_rulebook_projections(text,text) to service_role;
grant select on comind_development.v_rulebook_graph to service_role;
grant select on comind_development.v_rule_graph_relationships to service_role;

commit;
