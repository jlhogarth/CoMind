BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_aed_crp_origin (
  origin_id uuid PRIMARY KEY,
  owner_binding text NOT NULL CHECK (length(owner_binding) BETWEEN 1 AND 1024),
  origin jsonb NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  CHECK (origin->>'originId' = origin_id::text),
  CHECK (origin->>'ownerBinding' = owner_binding)
);

CREATE TABLE IF NOT EXISTS comind.cm_aed_crp_return (
  return_id uuid PRIMARY KEY,
  logical_key text NOT NULL UNIQUE CHECK (logical_key ~ '^[0-9a-f]{64}$'),
  origin_id uuid NOT NULL REFERENCES comind.cm_aed_crp_origin(origin_id),
  owner_binding text NOT NULL,
  envelope jsonb NOT NULL,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN (
    'QUEUED','DISPATCHING','RETRY_PENDING','TRANSPORT_ACCEPTED',
    'RECEIPT_VERIFIED','ACKNOWLEDGED','DELIVERY_UNCERTAIN',
    'AUTHORIZATION_REJECTED','DESTINATION_UNAVAILABLE','DEAD_LETTERED','CANCELLED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_id text,
  claim_token uuid,
  claim_expires_at timestamptz,
  provider_item_id text,
  receipt_digest text CHECK (receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'),
  last_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (envelope->>'returnId' = return_id::text),
  CHECK (envelope->>'logicalKey' = logical_key),
  CHECK (envelope->'origin'->>'originId' = origin_id::text)
);

CREATE TABLE IF NOT EXISTS comind.cm_aed_crp_event (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id uuid NOT NULL REFERENCES comind.cm_aed_crp_return(return_id),
  event_type text NOT NULL,
  state text NOT NULL,
  attempt_count integer NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION comind.cm_aed_crp_event_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'AED-CRP evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS cm_aed_crp_event_immutable ON comind.cm_aed_crp_event;
CREATE TRIGGER cm_aed_crp_event_immutable
  BEFORE UPDATE OR DELETE ON comind.cm_aed_crp_event
  FOR EACH ROW EXECUTE FUNCTION comind.cm_aed_crp_event_immutable();

CREATE INDEX IF NOT EXISTS cm_aed_crp_return_dispatch_idx
  ON comind.cm_aed_crp_return (state, updated_at)
  WHERE state IN ('QUEUED','RETRY_PENDING','DELIVERY_UNCERTAIN','DISPATCHING');

ALTER TABLE comind.cm_aed_crp_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_aed_crp_return ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_aed_crp_event ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON comind.cm_aed_crp_origin, comind.cm_aed_crp_return,
  comind.cm_aed_crp_event FROM PUBLIC;
REVOKE ALL ON SEQUENCE comind.cm_aed_crp_event_event_id_seq FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON comind.cm_aed_crp_origin, comind.cm_aed_crp_return,
      comind.cm_aed_crp_event FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON comind.cm_aed_crp_origin, comind.cm_aed_crp_return,
      comind.cm_aed_crp_event FROM authenticated;
  END IF;
END $$;

COMMENT ON TABLE comind.cm_aed_crp_return IS
  'AED-CRP private transactional return outbox. Use an approved least-privilege server principal; never expose this table through browser credentials.';
COMMENT ON TABLE comind.cm_aed_crp_event IS
  'AED-CRP append-only transition evidence, including uncertain delivery. No private result text in evidence.';

COMMIT;
