-- SCOUT-001 developmental Virtual Employee substrate.
-- Reuses cm_trait and cm_actor_trait as the canonical trait registry/current projection.
-- Adds only the governance, manifest, and append-only developmental history missing from the legacy trait layer.
-- Test-first. No Production activation, external provider mutation, or paid-provider authority is implied.

CREATE OR REPLACE FUNCTION comind.cm_reject_developmental_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'Developmental identity history is append-only';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_ve_developmental_manifest (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  org_id uuid NOT NULL REFERENCES comind.cm_org(org_id) ON DELETE RESTRICT,
  identity_owner_org_id uuid NOT NULL REFERENCES comind.cm_org(org_id) ON DELETE RESTRICT,
  accountable_human_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  supervisor_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  manifest_version integer NOT NULL CHECK (manifest_version > 0),
  supersedes_manifest_id uuid NULL REFERENCES comind.cm_ve_developmental_manifest(manifest_id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0 AND purpose = btrim(purpose)),
  role_code text NOT NULL CHECK (role_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  standard_version text NOT NULL CHECK (length(btrim(standard_version)) > 0 AND standard_version = btrim(standard_version)),
  constitution_version text NOT NULL CHECK (length(btrim(constitution_version)) > 0 AND constitution_version = btrim(constitution_version)),
  growth_policy_version text NOT NULL CHECK (length(btrim(growth_policy_version)) > 0 AND growth_policy_version = btrim(growth_policy_version)),
  affective_model_mode text NOT NULL DEFAULT 'modeled_only' CHECK (affective_model_mode IN ('disabled','modeled_only')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_by_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_id, manifest_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_ve_developmental_manifest_supersedes_uq
  ON comind.cm_ve_developmental_manifest(supersedes_manifest_id)
  WHERE supersedes_manifest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comind.cm_actor_trait_governance (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  trait_id uuid NOT NULL REFERENCES comind.cm_trait(trait_id) ON DELETE RESTRICT,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  supersedes_policy_id uuid NULL REFERENCES comind.cm_actor_trait_governance(policy_id) ON DELETE RESTRICT,
  characteristic_class text NOT NULL CHECK (characteristic_class IN (
    'constitutional','core_character','temperament','personality','values','interest','competence','social','affective','attention','situational'
  )),
  plasticity text NOT NULL CHECK (plasticity IN ('immutable','micro','meso','macro')),
  initial_weight real NOT NULL CHECK (initial_weight >= 0 AND initial_weight <= 1),
  min_weight real NOT NULL CHECK (min_weight >= 0 AND min_weight <= 1),
  max_weight real NOT NULL CHECK (max_weight >= 0 AND max_weight <= 1),
  max_delta_per_event real NOT NULL CHECK (max_delta_per_event >= 0 AND max_delta_per_event <= 1),
  self_modifiable boolean NOT NULL DEFAULT false,
  supervisor_review_required boolean NOT NULL DEFAULT true,
  evidence_required boolean NOT NULL DEFAULT true,
  policy_basis text NOT NULL CHECK (length(btrim(policy_basis)) > 0 AND policy_basis = btrim(policy_basis)),
  policy_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(policy_refs) = 'array'),
  created_by_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT cm_actor_trait_governance_range_ck CHECK (
    min_weight <= initial_weight AND initial_weight <= max_weight
  ),
  CONSTRAINT cm_actor_trait_governance_immutable_ck CHECK (
    plasticity <> 'immutable'
    OR (
      characteristic_class = 'constitutional'
      AND min_weight = initial_weight
      AND max_weight = initial_weight
      AND max_delta_per_event = 0
      AND self_modifiable = false
    )
  ),
  UNIQUE (actor_id, trait_id, policy_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_actor_trait_governance_supersedes_uq
  ON comind.cm_actor_trait_governance(supersedes_policy_id)
  WHERE supersedes_policy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comind.cm_actor_trait_development_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  trait_id uuid NOT NULL REFERENCES comind.cm_trait(trait_id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES comind.cm_actor_trait_governance(policy_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('initialize','adapt','stabilize','rollback','review')),
  previous_weight real NULL CHECK (previous_weight IS NULL OR (previous_weight >= 0 AND previous_weight <= 1)),
  new_weight real NOT NULL CHECK (new_weight >= 0 AND new_weight <= 1),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND reason = btrim(reason)),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  initiated_by_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  reviewed_by_actor_id uuid NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0 AND source_ref = btrim(source_ref)),
  idempotency_key text NOT NULL CHECK (
    length(btrim(idempotency_key)) > 0
    AND length(idempotency_key) <= 512
    AND idempotency_key = btrim(idempotency_key)
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_id, trait_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS cm_actor_trait_development_event_latest_idx
  ON comind.cm_actor_trait_development_event(actor_id,trait_id,created_at DESC,event_id DESC);

DROP TRIGGER IF EXISTS cm_ve_developmental_manifest_immutable ON comind.cm_ve_developmental_manifest;
CREATE TRIGGER cm_ve_developmental_manifest_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ve_developmental_manifest
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_developmental_history_mutation();

DROP TRIGGER IF EXISTS cm_actor_trait_governance_immutable ON comind.cm_actor_trait_governance;
CREATE TRIGGER cm_actor_trait_governance_immutable
BEFORE UPDATE OR DELETE ON comind.cm_actor_trait_governance
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_developmental_history_mutation();

DROP TRIGGER IF EXISTS cm_actor_trait_development_event_immutable ON comind.cm_actor_trait_development_event;
CREATE TRIGGER cm_actor_trait_development_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_actor_trait_development_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_developmental_history_mutation();

CREATE OR REPLACE VIEW comind.v_current_ve_developmental_manifest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (actor_id) *
FROM comind.cm_ve_developmental_manifest
ORDER BY actor_id, manifest_version DESC, created_at DESC, manifest_id DESC;

CREATE OR REPLACE VIEW comind.v_current_actor_trait_governance
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (actor_id,trait_id) *
FROM comind.cm_actor_trait_governance
ORDER BY actor_id,trait_id,policy_version DESC,created_at DESC,policy_id DESC;

CREATE OR REPLACE FUNCTION comind.record_actor_trait_development_event(
  p_actor_id uuid,
  p_trait_id uuid,
  p_event_type text,
  p_new_weight real,
  p_reason text,
  p_evidence_refs jsonb,
  p_initiated_by_actor_id uuid,
  p_reviewed_by_actor_id uuid,
  p_source_ref text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_policy comind.cm_actor_trait_governance%ROWTYPE;
  v_manifest comind.cm_ve_developmental_manifest%ROWTYPE;
  v_existing comind.cm_actor_trait_development_event%ROWTYPE;
  v_current_weight real;
  v_event_id uuid;
  v_evidence_refs jsonb := COALESCE(p_evidence_refs,'[]'::jsonb);
  v_delta real;
BEGIN
  IF p_actor_id IS NULL OR p_trait_id IS NULL OR p_initiated_by_actor_id IS NULL THEN
    RAISE EXCEPTION 'Developmental event requires actor, trait, and initiating actor' USING ERRCODE='check_violation';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('initialize','adapt','stabilize','rollback','review') THEN
    RAISE EXCEPTION 'Invalid developmental event type' USING ERRCODE='check_violation';
  END IF;
  IF p_new_weight IS NULL OR p_new_weight < 0 OR p_new_weight > 1 THEN
    RAISE EXCEPTION 'Developmental weight must be in [0,1]' USING ERRCODE='check_violation';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 OR p_reason <> btrim(p_reason) THEN
    RAISE EXCEPTION 'Developmental event reason is required and must be trimmed' USING ERRCODE='check_violation';
  END IF;
  IF jsonb_typeof(v_evidence_refs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Developmental evidence refs must be a JSON array' USING ERRCODE='check_violation';
  END IF;
  IF p_source_ref IS NULL OR length(btrim(p_source_ref)) = 0 OR p_source_ref <> btrim(p_source_ref) THEN
    RAISE EXCEPTION 'Developmental source_ref is required and must be trimmed' USING ERRCODE='check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 OR p_idempotency_key <> btrim(p_idempotency_key) OR length(p_idempotency_key) > 512 THEN
    RAISE EXCEPTION 'Developmental idempotency key is required and must be valid' USING ERRCODE='check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_trait_id::text,0));

  SELECT * INTO v_policy
  FROM comind.v_current_actor_trait_governance
  WHERE actor_id = p_actor_id AND trait_id = p_trait_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No developmental governance policy exists for actor trait' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_manifest
  FROM comind.v_current_ve_developmental_manifest
  WHERE actor_id = p_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No VE developmental manifest exists for actor' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_existing
  FROM comind.cm_actor_trait_development_event
  WHERE actor_id = p_actor_id
    AND trait_id = p_trait_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.policy_id = v_policy.policy_id
       AND v_existing.event_type = p_event_type
       AND v_existing.new_weight = p_new_weight
       AND v_existing.reason = p_reason
       AND v_existing.evidence_refs = v_evidence_refs
       AND v_existing.initiated_by_actor_id = p_initiated_by_actor_id
       AND v_existing.reviewed_by_actor_id IS NOT DISTINCT FROM p_reviewed_by_actor_id
       AND v_existing.source_ref = p_source_ref THEN
      RETURN v_existing.event_id;
    END IF;
    RAISE EXCEPTION 'Developmental idempotency key replay conflicts with existing event' USING ERRCODE='unique_violation';
  END IF;

  SELECT weight INTO v_current_weight
  FROM comind.cm_actor_trait
  WHERE actor_id = p_actor_id AND trait_id = p_trait_id;

  IF NOT FOUND THEN
    IF p_event_type <> 'initialize' THEN
      RAISE EXCEPTION 'First developmental event for a trait must be initialize' USING ERRCODE='check_violation';
    END IF;
    IF p_new_weight <> v_policy.initial_weight THEN
      RAISE EXCEPTION 'Initialization must use the policy initial_weight' USING ERRCODE='check_violation';
    END IF;
  ELSE
    IF p_event_type = 'initialize' THEN
      RAISE EXCEPTION 'Trait is already initialized' USING ERRCODE='check_violation';
    END IF;
    IF p_event_type IN ('review','stabilize') AND p_new_weight <> v_current_weight THEN
      RAISE EXCEPTION '% events cannot change trait weight', p_event_type USING ERRCODE='check_violation';
    END IF;
    IF v_policy.plasticity = 'immutable' AND p_new_weight <> v_current_weight THEN
      RAISE EXCEPTION 'Constitutional immutable characteristic cannot change through developmental events' USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF p_new_weight < v_policy.min_weight OR p_new_weight > v_policy.max_weight THEN
    RAISE EXCEPTION 'Developmental weight is outside governed range' USING ERRCODE='check_violation';
  END IF;

  IF v_current_weight IS NOT NULL AND p_new_weight <> v_current_weight THEN
    v_delta := abs(p_new_weight - v_current_weight);
    IF v_delta > v_policy.max_delta_per_event THEN
      RAISE EXCEPTION 'Developmental change exceeds max_delta_per_event' USING ERRCODE='check_violation';
    END IF;
    IF p_initiated_by_actor_id = p_actor_id AND NOT v_policy.self_modifiable THEN
      RAISE EXCEPTION 'Trait policy forbids self-modification' USING ERRCODE='check_violation';
    END IF;
    IF v_policy.supervisor_review_required THEN
      IF p_reviewed_by_actor_id IS NULL OR p_reviewed_by_actor_id <> v_manifest.supervisor_actor_id THEN
        RAISE EXCEPTION 'Trait change requires review by current VE supervisor' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF v_policy.evidence_required AND jsonb_array_length(v_evidence_refs) = 0 THEN
      RAISE EXCEPTION 'Trait change requires evidence' USING ERRCODE='check_violation';
    END IF;
  END IF;

  INSERT INTO comind.cm_actor_trait_development_event(
    actor_id,trait_id,policy_id,event_type,previous_weight,new_weight,reason,
    evidence_refs,initiated_by_actor_id,reviewed_by_actor_id,source_ref,idempotency_key
  ) VALUES (
    p_actor_id,p_trait_id,v_policy.policy_id,p_event_type,v_current_weight,p_new_weight,p_reason,
    v_evidence_refs,p_initiated_by_actor_id,p_reviewed_by_actor_id,p_source_ref,p_idempotency_key
  ) RETURNING event_id INTO v_event_id;

  IF v_current_weight IS NULL THEN
    INSERT INTO comind.cm_actor_trait(actor_id,trait_id,weight)
    VALUES (p_actor_id,p_trait_id,p_new_weight);
  ELSIF p_new_weight <> v_current_weight THEN
    UPDATE comind.cm_actor_trait
    SET weight = p_new_weight
    WHERE actor_id = p_actor_id AND trait_id = p_trait_id;
  END IF;

  RETURN v_event_id;
END;
$$;

ALTER TABLE comind.cm_ve_developmental_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ve_developmental_manifest FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_actor_trait_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_actor_trait_governance FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_actor_trait_development_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_actor_trait_development_event FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_ve_developmental_manifest_service_select ON comind.cm_ve_developmental_manifest;
CREATE POLICY cm_ve_developmental_manifest_service_select ON comind.cm_ve_developmental_manifest FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS cm_actor_trait_governance_service_select ON comind.cm_actor_trait_governance;
CREATE POLICY cm_actor_trait_governance_service_select ON comind.cm_actor_trait_governance FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS cm_actor_trait_development_event_service_select ON comind.cm_actor_trait_development_event;
CREATE POLICY cm_actor_trait_development_event_service_select ON comind.cm_actor_trait_development_event FOR SELECT TO service_role USING (true);

REVOKE ALL ON TABLE comind.cm_ve_developmental_manifest FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE comind.cm_actor_trait_governance FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE comind.cm_actor_trait_development_event FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON comind.v_current_ve_developmental_manifest FROM PUBLIC,anon,authenticated;
REVOKE ALL ON comind.v_current_actor_trait_governance FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION comind.record_actor_trait_development_event(uuid,uuid,text,real,text,jsonb,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

GRANT USAGE ON SCHEMA comind TO service_role;
GRANT SELECT ON TABLE comind.cm_ve_developmental_manifest TO service_role;
GRANT SELECT ON TABLE comind.cm_actor_trait_governance TO service_role;
GRANT SELECT ON TABLE comind.cm_actor_trait_development_event TO service_role;
GRANT SELECT ON comind.v_current_ve_developmental_manifest TO service_role;
GRANT SELECT ON comind.v_current_actor_trait_governance TO service_role;
GRANT EXECUTE ON FUNCTION comind.record_actor_trait_development_event(uuid,uuid,text,real,text,jsonb,uuid,uuid,text,text) TO service_role;

COMMENT ON TABLE comind.cm_ve_developmental_manifest IS
  'SCOUT-001 append-only versioned VE developmental identity manifest. Organizational identity, supervision, constitution and growth policy are explicit and do not imply runtime authority.';
COMMENT ON TABLE comind.cm_actor_trait_governance IS
  'SCOUT-001 append-only versioned governance policy for existing cm_trait definitions and actor-specific developmental plasticity.';
COMMENT ON TABLE comind.cm_actor_trait_development_event IS
  'SCOUT-001 append-only developmental biography for actor traits. cm_actor_trait remains the current projection.';
COMMENT ON FUNCTION comind.record_actor_trait_development_event(uuid,uuid,text,real,text,jsonb,uuid,uuid,text,text) IS
  'SCOUT-001 constrained developmental event writer enforcing initialization, plasticity, delta, self-modification, supervisor review, evidence, and idempotency.';