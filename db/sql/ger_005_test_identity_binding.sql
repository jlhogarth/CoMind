-- GER-005: bind the sole confirmed Supabase Auth account to a synthetic Test actor.
-- No email, name, token, or real-person identity is copied into CoMind identity tables.
-- This script is for the existing CoMind Test project only. It fails closed if the
-- account population or existing synthetic binding is ambiguous.
BEGIN;

DO $ger005$
DECLARE
  v_auth_id uuid;
  v_count integer;
  v_provider_id uuid;
  v_actor_id uuid;
  v_identity_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('GER-005-SYNTHETIC-TEST-IDENTITY'));
  SELECT count(*), min(id::text)::uuid INTO v_count, v_auth_id
  FROM auth.users WHERE email_confirmed_at IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'GER-005 Test binding requires exactly one confirmed Auth account';
  END IF;
  INSERT INTO comind.cm_identity_provider (name, config)
  VALUES ('supabase-auth-test', '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb)
  ON CONFLICT (name) DO NOTHING;
  SELECT idp_id INTO v_provider_id FROM comind.cm_identity_provider
  WHERE name = 'supabase-auth-test'
    AND config = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb;
  IF v_provider_id IS NULL THEN RAISE EXCEPTION 'GER-005 provider collision'; END IF;

  INSERT INTO comind.cm_actor (kind, handle, meta)
  VALUES ('person', 'prism-ger-005-synthetic-test-actor',
          '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb)
  ON CONFLICT (handle) DO NOTHING;
  SELECT actor_id INTO v_actor_id FROM comind.cm_actor
  WHERE handle = 'prism-ger-005-synthetic-test-actor'
    AND kind = 'person'
    AND meta = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb
    AND email IS NULL AND display_name IS NULL;
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'GER-005 synthetic actor collision'; END IF;

  SELECT count(*) INTO v_identity_count FROM comind.cm_identity
  WHERE idp_id = v_provider_id AND subject = v_auth_id::text;
  IF v_identity_count = 0 THEN
    INSERT INTO comind.cm_identity (actor_id, idp_id, subject)
    VALUES (v_actor_id, v_provider_id, v_auth_id::text);
  ELSIF v_identity_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM comind.cm_identity
    WHERE idp_id = v_provider_id AND subject = v_auth_id::text AND actor_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'GER-005 existing Auth subject mapping is ambiguous';
  END IF;
END
$ger005$;
COMMIT;
