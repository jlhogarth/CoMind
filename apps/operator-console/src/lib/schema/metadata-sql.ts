export const PUBLIC_SCHEMA_METADATA_SQL = String.raw`
with primary_key_columns as (
  select
    tc.table_schema,
    tc.table_name,
    kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.constraint_schema = tc.constraint_schema
  where tc.constraint_type = 'PRIMARY KEY'
    and tc.table_schema = 'public'
),
columns as (
  select
    c.table_schema as schema_name,
    c.table_name as relation_name,
    c.column_name,
    c.ordinal_position,
    c.data_type,
    c.udt_name,
    c.is_nullable = 'YES' as nullable,
    c.column_default,
    c.is_generated <> 'NEVER' as generated,
    c.is_identity = 'YES' as identity,
    pk.column_name is not null as primary_key
  from information_schema.columns c
  left join primary_key_columns pk
    on pk.table_schema = c.table_schema
   and pk.table_name = c.table_name
   and pk.column_name = c.column_name
  where c.table_schema = 'public'
),
foreign_keys as (
  select
    ns.nspname as source_schema,
    src.relname as source_relation,
    con.conname as constraint_name,
    tns.nspname as target_schema,
    tgt.relname as target_relation,
    con.confdeltype as delete_action_code,
    con.confupdtype as update_action_code,
    con.conkey,
    con.confkey
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace ns on ns.oid = src.relnamespace
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace tns on tns.oid = tgt.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
)
select jsonb_build_object(
  'relations', coalesce((
    select jsonb_agg(relation_record order by relation_record->>'schema', relation_record->>'name')
    from (
      select jsonb_build_object(
        'schema', t.table_schema,
        'name', t.table_name,
        'kind', case when t.table_type = 'VIEW' then 'view' else 'table' end,
        'columns', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', c.column_name,
            'ordinalPosition', c.ordinal_position,
            'dataType', c.data_type,
            'udtName', c.udt_name,
            'nullable', c.nullable,
            'defaultExpression', c.column_default,
            'generated', c.generated,
            'identity', c.identity,
            'primaryKey', c.primary_key
          ) order by c.ordinal_position)
          from columns c
          where c.schema_name = t.table_schema and c.relation_name = t.table_name
        ), '[]'::jsonb)
      ) as relation_record
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_type in ('BASE TABLE', 'VIEW')
    ) relations
  ), '[]'::jsonb),
  'foreignKeys', '[]'::jsonb
) as metadata;
`;

// FK column-pair expansion and action-code normalization are deliberately not
// represented as complete until execution against isolated PostgreSQL proves the
// catalog query. OC-001 must not ship guessed catalog semantics as verified code.
