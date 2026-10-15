\set ON_ERROR_STOP on

DO $$
DECLARE
    v_policy_count integer;
BEGIN
    SELECT count(*)
    INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'operator_console_relation_registry',
          'operator_console_verification_records',
          'operator_console_mutation_audit'
      )
      AND policyname = 'operator_console_deny_ordinary_roles'
      AND permissive = 'RESTRICTIVE'
      AND cmd = 'ALL'
      AND roles @> ARRAY['anon'::name, 'authenticated'::name]
      AND qual = 'false'
      AND with_check = 'false';

    IF v_policy_count <> 3 THEN
        RAISE EXCEPTION 'expected 3 explicit restrictive ordinary-role deny policies, found %', v_policy_count;
    END IF;
END;
$$;

SELECT 'OC-002 explicit ordinary-role deny policies verified' AS verification_result;
