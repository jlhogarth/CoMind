SELECT
    decision_key,
    decision_type,
    owner,
    status,
    metadata ->> 'effective_date' AS effective_date
FROM public.comind_governance_decisions
WHERE decision_key = 'development.no_placeholder_policy.v1';

SELECT
    c.relname AS table_name,
    c.relrowsecurity AS row_level_security_enabled
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'comind_workflow_blockers';

SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_catalog.pg_constraint
WHERE conrelid = 'public.comind_workflow_blockers'::regclass
ORDER BY conname;

SELECT
    routine_name,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'comind_open_workflow_blocker';

SELECT
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'comind_workflow_blockers'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');


