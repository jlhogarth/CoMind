-- GER-005B. Only the CoMind Test project may apply this migration.
-- The sole accepted purpose covers fictional Digital Twin eligibility testing.
BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_ger005_test_consent_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  purpose text NOT NULL DEFAULT 'digital-twin-synthetic-test'
    CHECK (purpose = 'digital-twin-synthetic-test'),
  decision text NOT NULL CHECK (decision IN ('allow','deny')),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS cm_ger005_test_consent_actor_latest
  ON comind.cm_ger005_test_consent_event(actor_id, decision_seq DESC);
DROP TRIGGER IF EXISTS cm_ger005_test_consent_immutable ON comind.cm_ger005_test_consent_event;
CREATE TRIGGER cm_ger005_test_consent_immutable
  BEFORE UPDATE OR DELETE ON comind.cm_ger005_test_consent_event
  FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_ger_mutation();
ALTER TABLE comind.cm_ger005_test_consent_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_ger005_test_consent_event FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION comind.cm_ger005_test_bound_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, comind, auth
AS $$
DECLARE v_actor uuid;
BEGIN
  -- The caller's signed JWT supplies the subject through auth.uid().
  -- No actor ID or provider subject is accepted as an RPC argument.
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT min(i.actor_id::text)::uuid INTO v_actor
  FROM comind.cm_identity i
  JOIN comind.cm_identity_provider p ON p.idp_id = i.idp_id
  JOIN comind.cm_actor a ON a.actor_id = i.actor_id
  JOIN auth.users u ON u.id::text = i.subject
  WHERE i.subject = auth.uid()::text
    AND u.email_confirmed_at IS NOT NULL
    AND p.name = 'supabase-auth-test'
    AND p.config = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb
    AND a.handle = 'prism-ger-005-synthetic-test-actor'
    AND a.kind = 'person' AND a.email IS NULL AND a.display_name IS NULL
    AND a.meta = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb
  HAVING count(*) = 1 AND count(DISTINCT i.actor_id::text) = 1;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_ger005_test_consent_decide(p_decision text)
RETURNS TABLE(event_id uuid, decision text, decided_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, comind, auth
AS $$
DECLARE v_actor uuid;
BEGIN
  IF p_decision NOT IN ('allow','deny') OR p_decision IS NULL THEN
    RAISE EXCEPTION 'invalid Test consent decision' USING ERRCODE = '22023';
  END IF;
  v_actor := comind.cm_ger005_test_bound_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'signed Test subject binding required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY INSERT INTO comind.cm_ger005_test_consent_event(actor_id,purpose,decision)
    VALUES (v_actor,'digital-twin-synthetic-test',p_decision)
    RETURNING cm_ger005_test_consent_event.event_id,
              cm_ger005_test_consent_event.decision,
              cm_ger005_test_consent_event.decided_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_ger005_test_consent_current()
RETURNS TABLE(event_id uuid, decision text, decided_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, comind, auth
AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := comind.cm_ger005_test_bound_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'signed Test subject binding required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT e.event_id,e.decision,e.decided_at
    FROM comind.cm_ger005_test_consent_event e
    WHERE e.actor_id = v_actor AND e.purpose = 'digital-twin-synthetic-test'
    ORDER BY e.decision_seq DESC LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_ger005_test_bound_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cm_ger005_test_consent_decide(text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.cm_ger005_test_consent_current() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cm_ger005_test_consent_decide(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cm_ger005_test_consent_current() TO authenticated;
COMMIT;
