\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_project uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_first uuid;
  v_duplicate_rejected boolean := false;
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='comind'
      AND tablename='cm_ce_continuity_capsule'
      AND indexname='cm_ce_recovery_capsule_source_uq'
      AND indexdef ILIKE '%UNIQUE INDEX%'
      AND indexdef ILIKE '%NULLS NOT DISTINCT%'
      AND indexdef ILIKE '%source_system = ''continuous_excellence''%'
      AND indexdef ILIKE '%ce-recovery://%'
  ) THEN
    RAISE EXCEPTION 'CE-002 recovery idempotency index is missing or malformed';
  END IF;

  v_first := comind.capture_ce_continuity_capsule(
    v_project,
    NULL,
    'CE-002-VERIFY',
    'Verify recovery replay idempotency',
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'first recovery',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'continue',
    'rollback transaction',
    'ready',
    'verified',
    'continuous_excellence',
    'ce-recovery://00000000-0000-4000-8000-000000000001/taskless/verify-replay',
    NULL
  );

  IF v_first IS NULL THEN
    RAISE EXCEPTION 'CE-002 first recovery capsule was not created';
  END IF;

  BEGIN
    PERFORM comind.capture_ce_continuity_capsule(
      v_project,
      NULL,
      'CE-002-VERIFY',
      'Verify recovery replay idempotency',
      '[]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      'duplicate recovery replay',
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      'continue',
      'rollback transaction',
      'ready',
      'verified',
      'continuous_excellence',
      'ce-recovery://00000000-0000-4000-8000-000000000001/taskless/verify-replay',
      NULL
    );
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_rejected := true;
  END;

  IF NOT v_duplicate_rejected THEN
    RAISE EXCEPTION 'CE-002 duplicate recovery capsule was not rejected';
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.cm_ce_continuity_capsule
  WHERE project_id=v_project
    AND task_id IS NULL
    AND capsule_key='CE-002-VERIFY'
    AND source_system='continuous_excellence'
    AND source_ref='ce-recovery://00000000-0000-4000-8000-000000000001/taskless/verify-replay';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CE-002 recovery idempotency expected one capsule, found %', v_count;
  END IF;
END;
$$;

ROLLBACK;
