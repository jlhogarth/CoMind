\set ON_ERROR_STOP on

DO $$
DECLARE
  v_extra bigint;
  v_select bigint;
  v_updatable text;
  v_insertable text;
BEGIN
  SELECT count(*) INTO v_extra
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('v_ce_operator_summary','v_ce_operator_state_counts')
    AND grantee='service_role'
    AND privilege_type <> 'SELECT';

  IF v_extra <> 0 THEN
    RAISE EXCEPTION 'CE-001 operator view verification failed: service_role retains % non-SELECT grants', v_extra;
  END IF;

  SELECT count(*) INTO v_select
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('v_ce_operator_summary','v_ce_operator_state_counts')
    AND grantee='service_role'
    AND privilege_type='SELECT';

  IF v_select <> 2 THEN
    RAISE EXCEPTION 'CE-001 operator view verification failed: expected exactly two service_role SELECT grants, found %', v_select;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('v_ce_operator_summary','v_ce_operator_state_counts')
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'CE-001 operator view verification failed: browser roles retain view privileges';
  END IF;

  FOR v_updatable,v_insertable IN
    SELECT is_updatable,is_insertable_into
    FROM information_schema.views
    WHERE table_schema='public'
      AND table_name IN ('v_ce_operator_summary','v_ce_operator_state_counts')
  LOOP
    IF v_updatable <> 'NO' OR v_insertable <> 'NO' THEN
      RAISE EXCEPTION 'CE-001 operator view verification failed: operator projection is writable';
    END IF;
  END LOOP;

  RAISE NOTICE 'CE-001 operator view least-privilege verification passed';
END;
$$;
