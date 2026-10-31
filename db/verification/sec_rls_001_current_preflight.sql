-- SEC-RLS-001 read-only current-state preflight.
-- Safe to execute against the connected Test project. It performs no mutation.

WITH custom_tables AS (
  SELECT n.nspname AS schema_name,
         c.relname AS table_name,
         c.oid,
         c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('comind','comind_pm')
    AND c.relkind IN ('r','p')
),
policy_inventory AS (
  SELECT n.nspname AS schema_name,
         c.relname AS table_name,
         p.polname,
         pg_get_expr(p.polqual,p.polrelid) AS using_expr,
         pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('comind','comind_pm')
),
role_access AS (
  SELECT r.rolname AS role_name,
         t.schema_name,
         t.table_name,
         has_table_privilege(r.rolname,t.oid,'SELECT') AS can_select,
         has_table_privilege(r.rolname,t.oid,'INSERT') AS can_insert,
         has_table_privilege(r.rolname,t.oid,'UPDATE') AS can_update,
         has_table_privilege(r.rolname,t.oid,'DELETE') AS can_delete
  FROM custom_tables t
  CROSS JOIN pg_roles r
  WHERE r.rolname IN (
    'anon','authenticated','service_role',
    'comind_conversation_deriver','comind_conversation_reconciler'
  )
)
SELECT jsonb_build_object(
  'status','observed',
  'custom_schema_tables',(SELECT count(*) FROM custom_tables),
  'rls_disabled_tables',(SELECT count(*) FROM custom_tables WHERE NOT relrowsecurity),
  'total_policies',(SELECT count(*) FROM policy_inventory),
  'literal_true_policies',(
    SELECT count(*) FROM policy_inventory
    WHERE COALESCE(using_expr,'')='true' OR COALESCE(check_expr,'')='true'
  ),
  'anon_schema_usage',jsonb_build_object(
    'comind',CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN has_schema_privilege('anon','comind','USAGE') ELSE false END,
    'comind_pm',CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN has_schema_privilege('anon','comind_pm','USAGE') ELSE false END
  ),
  'authenticated_schema_usage',jsonb_build_object(
    'comind',CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN has_schema_privilege('authenticated','comind','USAGE') ELSE false END,
    'comind_pm',CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN has_schema_privilege('authenticated','comind_pm','USAGE') ELSE false END
  ),
  'anon_dml_tables',(
    SELECT count(*) FROM role_access WHERE role_name='anon' AND (can_select OR can_insert OR can_update OR can_delete)
  ),
  'authenticated_dml_tables',(
    SELECT count(*) FROM role_access WHERE role_name='authenticated' AND (can_select OR can_insert OR can_update OR can_delete)
  ),
  'dedicated_non_bypass_access',(
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'role',role_name,'schema',schema_name,'table',table_name,
      'select',can_select,'insert',can_insert,'update',can_update,'delete',can_delete
    ) ORDER BY role_name,schema_name,table_name),'[]'::jsonb)
    FROM role_access
    WHERE role_name IN ('comind_conversation_deriver','comind_conversation_reconciler')
      AND (can_select OR can_insert OR can_update OR can_delete)
  )
) AS sec_rls_001_preflight;
