\set ON_ERROR_STOP on

begin;

do $$
declare
  v_rrr uuid;
  v_expected integer;
  v_ready integer;
begin
  select entity_id into v_rrr
  from comind_development.entity
  where tracking_key='RRR-001'
    and entity_type='artifact';
  if not found then
    raise exception 'EDG-002 requires the existing RRR-001 artifact projection before RRR rule edges can be seeded';
  end if;

  with mappings(rule_key,candidates) as (values
    ('RULE-ARCH-001',array['RRR-CAND-042']::text[]),
    ('RULE-ARCH-004',array['RRR-CAND-042']::text[]),
    ('RULE-CONT-003',array['RRR-CAND-010','RRR-CAND-011']::text[]),
    ('RULE-DEV-001',array['RRR-CAND-029']::text[]),
    ('RULE-DOC-001',array['RRR-CAND-023']::text[]),
    ('RULE-DOC-002',array['RRR-CAND-024']::text[]),
    ('RULE-DOC-003',array['RRR-CAND-025']::text[]),
    ('RULE-DOC-004',array['RRR-CAND-025']::text[]),
    ('RULE-DOC-005',array['RRR-CAND-026']::text[]),
    ('RULE-DOC-006',array['RRR-CAND-016','RRR-CAND-020']::text[]),
    ('RULE-DOC-007',array['RRR-CAND-027','RRR-CAND-028']::text[]),
    ('RULE-DOC-012',array['RRR-CAND-028','RRR-CAND-030']::text[]),
    ('RULE-EDG-003',array['RRR-CAND-021']::text[]),
    ('RULE-EDG-004',array['RRR-CAND-016']::text[]),
    ('RULE-EPI-001',array['RRR-CAND-012','RRR-CAND-041']::text[]),
    ('RULE-EPI-002',array['RRR-CAND-007']::text[]),
    ('RULE-EPI-003',array['RRR-CAND-008']::text[]),
    ('RULE-EPI-004',array['RRR-CAND-006']::text[]),
    ('RULE-EPI-005',array['RRR-CAND-009']::text[]),
    ('RULE-EVID-003',array['RRR-CAND-013','RRR-CAND-015','RRR-CAND-049']::text[]),
    ('RULE-EVID-004',array['RRR-CAND-020','RRR-CAND-021','RRR-CAND-049']::text[]),
    ('RULE-GP-001',array['RRR-CAND-001']::text[]),
    ('RULE-GP-002',array['RRR-CAND-003']::text[]),
    ('RULE-GP-003',array['RRR-CAND-004','RRR-CAND-041']::text[]),
    ('RULE-GP-004',array['RRR-CAND-002']::text[]),
    ('RULE-GP-005',array['RRR-CAND-005']::text[]),
    ('RULE-HIST-L0-SLA-001',array['RRR-CAND-044']::text[]),
    ('RULE-HIST-L0-SLA-002',array['RRR-CAND-044']::text[]),
    ('RULE-HIST-L0-SLA-003',array['RRR-CAND-044']::text[]),
    ('RULE-HIST-L0-SLA-004',array['RRR-CAND-044']::text[]),
    ('RULE-HIST-L0-SLA-005',array['RRR-CAND-044']::text[]),
    ('RULE-LC-007',array['RRR-CAND-018']::text[]),
    ('RULE-LC-009',array['RRR-CAND-019']::text[]),
    ('RULE-LC-010',array['RRR-CAND-017']::text[]),
    ('RULE-OPS-005',array['RRR-CAND-036']::text[])
  )
  select count(*),count(e.entity_id)
  into v_expected,v_ready
  from mappings m
  left join comind_development.entity e
    on e.tracking_key=m.rule_key
   and e.entity_type='rule'
   and e.source_of_truth='comind_pm.pm_rules'
   and e.status='projection_current';

  if v_expected<>35 then
    raise exception 'EDG-002 RRR mapping ledger expected 35 distinct rule keys, got %',v_expected;
  end if;
  if v_ready<>v_expected then
    raise exception 'EDG-002 RRR mapping ledger has only % of % required current rule projections',v_ready,v_expected;
  end if;
end;
$$;

with mappings(rule_key,candidates) as (values
  ('RULE-ARCH-001',array['RRR-CAND-042']::text[]),
  ('RULE-ARCH-004',array['RRR-CAND-042']::text[]),
  ('RULE-CONT-003',array['RRR-CAND-010','RRR-CAND-011']::text[]),
  ('RULE-DEV-001',array['RRR-CAND-029']::text[]),
  ('RULE-DOC-001',array['RRR-CAND-023']::text[]),
  ('RULE-DOC-002',array['RRR-CAND-024']::text[]),
  ('RULE-DOC-003',array['RRR-CAND-025']::text[]),
  ('RULE-DOC-004',array['RRR-CAND-025']::text[]),
  ('RULE-DOC-005',array['RRR-CAND-026']::text[]),
  ('RULE-DOC-006',array['RRR-CAND-016','RRR-CAND-020']::text[]),
  ('RULE-DOC-007',array['RRR-CAND-027','RRR-CAND-028']::text[]),
  ('RULE-DOC-012',array['RRR-CAND-028','RRR-CAND-030']::text[]),
  ('RULE-EDG-003',array['RRR-CAND-021']::text[]),
  ('RULE-EDG-004',array['RRR-CAND-016']::text[]),
  ('RULE-EPI-001',array['RRR-CAND-012','RRR-CAND-041']::text[]),
  ('RULE-EPI-002',array['RRR-CAND-007']::text[]),
  ('RULE-EPI-003',array['RRR-CAND-008']::text[]),
  ('RULE-EPI-004',array['RRR-CAND-006']::text[]),
  ('RULE-EPI-005',array['RRR-CAND-009']::text[]),
  ('RULE-EVID-003',array['RRR-CAND-013','RRR-CAND-015','RRR-CAND-049']::text[]),
  ('RULE-EVID-004',array['RRR-CAND-020','RRR-CAND-021','RRR-CAND-049']::text[]),
  ('RULE-GP-001',array['RRR-CAND-001']::text[]),
  ('RULE-GP-002',array['RRR-CAND-003']::text[]),
  ('RULE-GP-003',array['RRR-CAND-004','RRR-CAND-041']::text[]),
  ('RULE-GP-004',array['RRR-CAND-002']::text[]),
  ('RULE-GP-005',array['RRR-CAND-005']::text[]),
  ('RULE-HIST-L0-SLA-001',array['RRR-CAND-044']::text[]),
  ('RULE-HIST-L0-SLA-002',array['RRR-CAND-044']::text[]),
  ('RULE-HIST-L0-SLA-003',array['RRR-CAND-044']::text[]),
  ('RULE-HIST-L0-SLA-004',array['RRR-CAND-044']::text[]),
  ('RULE-HIST-L0-SLA-005',array['RRR-CAND-044']::text[]),
  ('RULE-LC-007',array['RRR-CAND-018']::text[]),
  ('RULE-LC-009',array['RRR-CAND-019']::text[]),
  ('RULE-LC-010',array['RRR-CAND-017']::text[]),
  ('RULE-OPS-005',array['RRR-CAND-036']::text[])
), rrr as (
  select entity_id
  from comind_development.entity
  where tracking_key='RRR-001' and entity_type='artifact'
), targets as (
  select m.rule_key,m.candidates,e.entity_id as rule_entity_id
  from mappings m
  join comind_development.entity e
    on e.tracking_key=m.rule_key
   and e.entity_type='rule'
   and e.source_of_truth='comind_pm.pm_rules'
   and e.status='projection_current'
)
insert into comind_development.relationship(
  relationship_key,subject_entity_id,predicate,object_entity_id,evidence_entity_id,
  confidence,created_by,relationship_payload
)
select
  'REL-RRR-001-V1-DESCRIBES-'||t.rule_key,
  rrr.entity_id,
  'DESCRIBES',
  t.rule_entity_id,
  rrr.entity_id,
  1.0,
  'EDG-002',
  jsonb_build_object(
    'assertion_type','explicit_canonical_mapping_ledger',
    'assertion_status','canonical_mapping',
    'source_projection','RRR-001',
    'source_document_id','19rAT1rHJRQW2GWEwe2mJs332C5yakd0nFIewekAZ87o',
    'source_url','https://docs.google.com/document/d/19rAT1rHJRQW2GWEwe2mJs332C5yakd0nFIewekAZ87o/edit',
    'source_version','0.1',
    'rrr_candidates',to_jsonb(t.candidates),
    'authority_boundary','DESCRIBES is documentary provenance only; canonical Rulebook authority remains comind_pm',
    'evidence_ref','EDG-002:RRR-001-canonical-mapping-ledger'
  )
from targets t
cross join rrr
on conflict (relationship_key) do nothing;

commit;
