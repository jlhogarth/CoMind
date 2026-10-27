\set ON_ERROR_STOP on

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*)
    INTO missing_count
    FROM (VALUES
      ('idx_cm_threadkeeper_assessment_scope_checkpoint'),
      ('idx_cm_threadkeeper_case_scope_assessment'),
      ('idx_cm_threadkeeper_transition_successor_checkpoint')
    ) AS expected(indexname)
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_indexes i
      WHERE i.schemaname='comind'
        AND i.indexname=expected.indexname
   );

  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'ThreadKeeper foreign-key index hardening incomplete: % indexes missing', missing_count;
  END IF;
END;
$$;

SELECT 'ThreadKeeper foreign-key index verification passed' AS result;
