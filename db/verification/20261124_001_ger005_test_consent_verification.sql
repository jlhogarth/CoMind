-- Run against the CoMind Test project after migration. No signed JWT is
-- fabricated here; a positive decision requires the actual signed-in client.
DO $$
BEGIN
  IF to_regclass('comind.cm_ger005_test_consent_event') IS NULL THEN
    RAISE EXCEPTION 'GER-005B consent event table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_ger005_test_consent_event' AND c.relrowsecurity)
    OR has_table_privilege('authenticated','comind.cm_ger005_test_consent_event','SELECT')
    OR has_table_privilege('authenticated','comind.cm_ger005_test_consent_event','INSERT')
    OR has_table_privilege('anon','comind.cm_ger005_test_consent_event','SELECT') THEN
    RAISE EXCEPTION 'GER-005B private event table grant/RLS mismatch';
  END IF;
  IF NOT has_function_privilege('authenticated','public.cm_ger005_test_consent_decide(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.cm_ger005_test_consent_current()','EXECUTE')
    OR has_function_privilege('anon','public.cm_ger005_test_consent_decide(text)','EXECUTE')
    OR has_function_privilege('anon','public.cm_ger005_test_consent_current()','EXECUTE')
    OR has_function_privilege('authenticated','comind.cm_ger005_test_bound_actor()','EXECUTE') THEN
    RAISE EXCEPTION 'GER-005B RPC grant mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='comind.cm_ger005_test_consent_event'::regclass
    AND tgname='cm_ger005_test_consent_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'GER-005B immutable audit trigger missing';
  END IF;
END $$;

-- Expected: no event until a signed-in human grants or denies in the Test UI.
SELECT count(*) AS decisions_total,
       count(*) FILTER (WHERE decision='allow') AS allow_events,
       count(*) FILTER (WHERE decision='deny') AS deny_events
FROM comind.cm_ger005_test_consent_event;
