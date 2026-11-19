-- Run only against the verified CoMind Test project after the rollback-only verifier passes.
-- Set comind.agcol.test_operator_id to the established Test Auth user's UUID in the same session.
BEGIN;
DO $$
DECLARE v_operator uuid := nullif(current_setting('comind.agcol.test_operator_id', true),'')::uuid;
BEGIN
  IF v_operator IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id=v_operator AND email_confirmed_at IS NOT NULL AND last_sign_in_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A verified existing Test operator is required';
  END IF;
  INSERT INTO comind.cm_agent_operations_operator(user_id) VALUES (v_operator) ON CONFLICT DO NOTHING;
END;
$$;
SELECT cron.schedule('agcol-test-operations','* * * * *',
  'SET statement_timeout = ''20s''; SELECT comind.cm_agent_operations_tick()');
COMMIT;
