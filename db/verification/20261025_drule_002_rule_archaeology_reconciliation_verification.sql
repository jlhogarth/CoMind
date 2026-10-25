begin;

-- DRULE-002 schema verification. Read-only assertions only.

do $$
declare
  missing_tables text[];
  non_rls_tables text[];
  missing_views text[];
  service_role_missing text[];
begin
  select array_agg(required_name order by required_name)
  into missing_tables
  from unnest(array[
    'pm_rules','pm_rule_versions','pm_rule_sources','pm_rule_event_links',
    'pm_rule_source_documents','pm_rule_candidates','pm_rule_relationships',
    'pm_rule_reconciliation_cases','pm_rule_reconciliation_members','pm_rule_archaeology_queue'
  ]) required_name
  where to_regclass('comind_pm.' || required_name) is null;

  if missing_tables is not null then
    raise exception 'DRULE-002 missing tables: %', missing_tables;
  end if;

  select array_agg(c.relname order by c.relname)
  into non_rls_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'comind_pm'
    and c.relname = any(array[
      'pm_rules','pm_rule_versions','pm_rule_sources','pm_rule_event_links',
      'pm_rule_source_documents','pm_rule_candidates','pm_rule_relationships',
      'pm_rule_reconciliation_cases','pm_rule_reconciliation_members','pm_rule_archaeology_queue'
    ])
    and not c.relrowsecurity;

  if non_rls_tables is not null then
    raise exception 'DRULE-002 tables without RLS: %', non_rls_tables;
  end if;

  select array_agg(required_name order by required_name)
  into missing_views
  from unnest(array[
    'v_durable_rulebook','v_rule_reconciliation_queue','v_rule_candidate_review_queue','v_rule_archaeology_queue'
  ]) required_name
  where to_regclass('comind_pm.' || required_name) is null;

  if missing_views is not null then
    raise exception 'DRULE-002 missing views: %', missing_views;
  end if;

  select array_agg(t.table_name order by t.table_name)
  into service_role_missing
  from (values
    ('pm_rules'),('pm_rule_versions'),('pm_rule_sources'),('pm_rule_event_links'),
    ('pm_rule_source_documents'),('pm_rule_candidates'),('pm_rule_relationships'),
    ('pm_rule_reconciliation_cases'),('pm_rule_reconciliation_members'),('pm_rule_archaeology_queue')
  ) as t(table_name)
  where not exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'comind_pm'
      and g.table_name = t.table_name
      and g.grantee = 'service_role'
      and g.privilege_type = 'SELECT'
  );

  if service_role_missing is not null then
    raise exception 'DRULE-002 service_role SELECT missing: %', service_role_missing;
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'comind_pm'
      and g.table_name = any(array[
        'pm_rules','pm_rule_versions','pm_rule_sources','pm_rule_event_links',
        'pm_rule_source_documents','pm_rule_candidates','pm_rule_relationships',
        'pm_rule_reconciliation_cases','pm_rule_reconciliation_members','pm_rule_archaeology_queue'
      ])
      and g.grantee in ('anon','authenticated','PUBLIC')
  ) then
    raise exception 'DRULE-002 public/client grants detected';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'comind_pm.pm_rule_reconciliation_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%rule_id%candidate_id%'
  ) then
    raise exception 'DRULE-002 reconciliation-member XOR constraint missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'comind_pm'
      and indexname = 'uq_rule_reconciliation_member_rule'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'comind_pm'
      and indexname = 'uq_rule_reconciliation_member_candidate'
  ) then
    raise exception 'DRULE-002 reconciliation-member uniqueness indexes missing';
  end if;
end $$;

select
  (select count(*) from comind_pm.pm_rules) as rule_count,
  (select count(*) from comind_pm.pm_rule_versions) as version_count,
  (select count(*) from comind_pm.pm_rule_sources) as rule_source_count,
  (select count(*) from comind_pm.pm_rule_source_documents) as source_document_count,
  (select count(*) from comind_pm.pm_rule_candidates) as candidate_count,
  (select count(*) from comind_pm.pm_rule_relationships) as relationship_count,
  (select count(*) from comind_pm.pm_rule_reconciliation_cases) as reconciliation_case_count,
  (select count(*) from comind_pm.pm_rule_archaeology_queue) as archaeology_queue_count;

rollback;
