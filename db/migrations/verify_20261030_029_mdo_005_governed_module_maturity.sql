\set ON_ERROR_STOP on

WITH capability AS (
    SELECT capability_code, target_kind, max_authority, cost_bearing, adapter
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'mdo.module.maturity_transition'
), tables AS (
    SELECT c.relname,
           c.relrowsecurity,
           has_table_privilege('anon', format('comind.%I', c.relname), 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
           has_table_privilege('authenticated', format('comind.%I', c.relname), 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='comind'
      AND c.relname IN ('cm_module_lifecycle_event','cm_module_lifecycle_event_evidence')
), fn AS (
    SELECT p.oid,
           p.prosecdef,
           pg_get_functiondef(p.oid) AS definition,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='comind'
      AND p.proname='cm_mdo_transition_module_maturity'
), triggers AS (
    SELECT count(*)::int AS immutable_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind'
      AND c.relname IN ('cm_module_lifecycle_event','cm_module_lifecycle_event_evidence')
      AND NOT t.tgisinternal
      AND t.tgname IN ('trg_cm_module_lifecycle_event_immutable','trg_cm_module_lifecycle_event_evidence_immutable')
)
SELECT CASE
    WHEN (SELECT count(*) FROM capability) <> 1 THEN 'fail'
    WHEN (SELECT target_kind FROM capability) <> 'module' THEN 'fail'
    WHEN (SELECT max_authority FROM capability) <> 'C2' THEN 'fail'
    WHEN (SELECT cost_bearing FROM capability) IS DISTINCT FROM false THEN 'fail'
    WHEN (SELECT adapter FROM capability) <> 'mdo' THEN 'fail'
    WHEN (SELECT count(*) FROM tables) <> 2 THEN 'fail'
    WHEN EXISTS (SELECT 1 FROM tables WHERE NOT relrowsecurity OR anon_access OR authenticated_access) THEN 'fail'
    WHEN (SELECT count(*) FROM fn) <> 1 THEN 'fail'
    WHEN NOT (SELECT prosecdef FROM fn) THEN 'fail'
    WHEN (SELECT anon_execute FROM fn) OR (SELECT authenticated_execute FROM fn) OR NOT (SELECT service_execute FROM fn) THEN 'fail'
    WHEN (SELECT definition FROM fn) NOT LIKE '%requires an attributable human person actor%' THEN 'fail'
    WHEN (SELECT definition FROM fn) NOT LIKE '%accepted exact-module plan%' THEN 'fail'
    WHEN (SELECT definition FROM fn) NOT LIKE '%evidence linked to the governed plan acceptance%' THEN 'fail'
    WHEN (SELECT definition FROM fn) NOT LIKE '%mdo.module.maturity_transition%' THEN 'fail'
    WHEN (SELECT definition FROM fn) NOT LIKE '%Only a conceived module can transition to specified in MDO-005%' THEN 'fail'
    WHEN (SELECT immutable_trigger_count FROM triggers) <> 2 THEN 'fail'
    ELSE 'pass'
END
|| '|tables=' || (SELECT count(*) FROM tables)
|| '|immutable_triggers=' || (SELECT immutable_trigger_count FROM triggers)
|| '|service_execute=' || (SELECT service_execute FROM fn)
|| '|browser_execute=' || ((SELECT anon_execute FROM fn) OR (SELECT authenticated_execute FROM fn));
