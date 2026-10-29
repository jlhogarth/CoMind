BEGIN;

CREATE TABLE IF NOT EXISTS comind_pm.pm_conversation_governance_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES comind_pm.pm_data_asset_governance(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, conversation_id),
  UNIQUE (project_id, asset_id)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_conversation_egress_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES comind_pm.pm_conversation_governance_bindings(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES comind_pm.pm_egress_destinations(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','denied')),
  reviewed_by text NOT NULL CHECK (length(btrim(reviewed_by)) > 0),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  authority_basis text NOT NULL CHECK (length(btrim(authority_basis)) > 0),
  evidence_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision = 'approved' AND (expires_at IS NULL OR expires_at > reviewed_at))
    OR (decision = 'denied' AND expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS pm_conversation_governance_conversation_idx
  ON comind_pm.pm_conversation_governance_bindings(conversation_id);
CREATE INDEX IF NOT EXISTS pm_conversation_egress_review_lookup_idx
  ON comind_pm.pm_conversation_egress_review_events(binding_id,destination_id,reviewed_at DESC,created_at DESC);

ALTER TABLE comind_pm.pm_conversation_governance_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind_pm.pm_conversation_egress_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_deny_all ON comind_pm.pm_conversation_governance_bindings;
CREATE POLICY private_deny_all ON comind_pm.pm_conversation_governance_bindings
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS private_deny_all ON comind_pm.pm_conversation_egress_review_events;
CREATE POLICY private_deny_all ON comind_pm.pm_conversation_egress_review_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE comind_pm.pm_conversation_governance_bindings FROM PUBLIC;
REVOKE ALL ON TABLE comind_pm.pm_conversation_egress_review_events FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_conversation_governance_bindings FROM anon;
    REVOKE ALL ON TABLE comind_pm.pm_conversation_egress_review_events FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_conversation_governance_bindings FROM authenticated;
    REVOKE ALL ON TABLE comind_pm.pm_conversation_egress_review_events FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_conversation_governance_bindings FROM service_role;
    REVOKE ALL ON TABLE comind_pm.pm_conversation_egress_review_events FROM service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION comind_pm.reject_conversation_egress_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind_pm
AS $$
BEGIN
  RAISE EXCEPTION 'Conversation egress review events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_egress_review_append_only
  ON comind_pm.pm_conversation_egress_review_events;
CREATE TRIGGER trg_conversation_egress_review_append_only
BEFORE UPDATE OR DELETE ON comind_pm.pm_conversation_egress_review_events
FOR EACH ROW EXECUTE FUNCTION comind_pm.reject_conversation_egress_review_mutation();

CREATE OR REPLACE FUNCTION comind_pm.conversation_asset_key(p_conversation_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT 'conversation:' || p_conversation_id::text
$$;

CREATE OR REPLACE FUNCTION comind_pm.bind_conversation_governance(
  p_governance_project_key text,
  p_conversation_id uuid,
  p_classification_key text,
  p_residency_profile_key text,
  p_retention_profile_key text,
  p_purpose text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm, comind
AS $$
DECLARE
  v_project_id uuid;
  v_classification_id uuid;
  v_residency_id uuid;
  v_retention_id uuid;
  v_org_id uuid;
  v_conversation_project_id uuid;
  v_asset_key text;
  v_tenant_key text;
  v_project_scope_key text;
  v_asset comind_pm.pm_data_asset_governance%ROWTYPE;
  v_binding comind_pm.pm_conversation_governance_bindings%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'CONVERSATION_ID_REQUIRED';
  END IF;
  IF p_governance_project_key IS NULL OR length(btrim(p_governance_project_key)) = 0 THEN
    RAISE EXCEPTION 'GOVERNANCE_PROJECT_KEY_REQUIRED';
  END IF;
  IF p_classification_key IS NULL OR length(btrim(p_classification_key)) = 0 THEN
    RAISE EXCEPTION 'CLASSIFICATION_KEY_REQUIRED';
  END IF;
  IF p_residency_profile_key IS NULL OR length(btrim(p_residency_profile_key)) = 0 THEN
    RAISE EXCEPTION 'RESIDENCY_PROFILE_KEY_REQUIRED';
  END IF;
  IF p_retention_profile_key IS NULL OR length(btrim(p_retention_profile_key)) = 0 THEN
    RAISE EXCEPTION 'RETENTION_PROFILE_KEY_REQUIRED';
  END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) = 0 THEN
    RAISE EXCEPTION 'CONVERSATION_PURPOSE_REQUIRED';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_METADATA_MUST_BE_OBJECT';
  END IF;
  IF comind_pm.governance_context_has_forbidden_key(p_metadata) THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_METADATA_CONTAINS_RAW_SENSITIVE_KEY';
  END IF;

  SELECT id INTO v_project_id
  FROM comind_pm.pm_projects
  WHERE project_key = p_governance_project_key;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_GOVERNANCE_PROJECT:%', p_governance_project_key;
  END IF;

  SELECT id INTO v_classification_id
  FROM comind_pm.pm_data_classification_levels
  WHERE project_id = v_project_id
    AND classification_key = p_classification_key;
  IF v_classification_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_CLASSIFICATION:%', p_classification_key;
  END IF;

  SELECT id INTO v_residency_id
  FROM comind_pm.pm_residency_profiles
  WHERE project_id = v_project_id
    AND profile_key = p_residency_profile_key;
  IF v_residency_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_RESIDENCY_PROFILE:%', p_residency_profile_key;
  END IF;

  SELECT id INTO v_retention_id
  FROM comind_pm.pm_retention_profiles
  WHERE project_id = v_project_id
    AND profile_key = p_retention_profile_key;
  IF v_retention_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_RETENTION_PROFILE:%', p_retention_profile_key;
  END IF;

  SELECT c.org_id, c.project_id
    INTO v_org_id, v_conversation_project_id
  FROM comind.cm_conversation c
  WHERE c.conv_id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_NOT_FOUND:%', p_conversation_id;
  END IF;
  IF v_org_id IS NULL OR v_conversation_project_id IS NULL THEN
    RAISE EXCEPTION 'CONVERSATION_SCOPE_INCOMPLETE:%', p_conversation_id;
  END IF;

  v_asset_key := comind_pm.conversation_asset_key(p_conversation_id);
  v_tenant_key := 'org:' || v_org_id::text;
  v_project_scope_key := 'project:' || v_conversation_project_id::text;

  SELECT * INTO v_asset
  FROM comind_pm.pm_data_asset_governance
  WHERE project_id = v_project_id
    AND asset_key = v_asset_key;

  IF FOUND THEN
    IF v_asset.asset_type <> 'conversation'
       OR v_asset.classification_id <> v_classification_id
       OR v_asset.residency_profile_id IS DISTINCT FROM v_residency_id
       OR v_asset.retention_profile_id IS DISTINCT FROM v_retention_id
       OR v_asset.tenant_key IS DISTINCT FROM v_tenant_key
       OR v_asset.project_scope_key <> v_project_scope_key
       OR NOT (p_purpose = ANY(v_asset.allowed_purposes))
       OR v_asset.disposition_status <> 'active' THEN
      RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_ASSET_CONFLICT:%', p_conversation_id;
    END IF;
  ELSE
    INSERT INTO comind_pm.pm_data_asset_governance(
      project_id,
      asset_key,
      asset_type,
      classification_id,
      residency_profile_id,
      retention_profile_id,
      tenant_key,
      project_scope_key,
      allowed_purposes,
      source_ref,
      metadata
    ) VALUES (
      v_project_id,
      v_asset_key,
      'conversation',
      v_classification_id,
      v_residency_id,
      v_retention_id,
      v_tenant_key,
      v_project_scope_key,
      ARRAY[p_purpose],
      'comind.cm_conversation:' || p_conversation_id::text,
      p_metadata || jsonb_build_object(
        'conversation_id', p_conversation_id::text,
        'governance_binding', true
      )
    )
    RETURNING * INTO v_asset;
    v_created := true;
  END IF;

  SELECT * INTO v_binding
  FROM comind_pm.pm_conversation_governance_bindings
  WHERE project_id = v_project_id
    AND conversation_id = p_conversation_id;

  IF FOUND THEN
    IF v_binding.asset_id <> v_asset.id
       OR v_binding.purpose <> p_purpose THEN
      RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_BINDING_CONFLICT:%', p_conversation_id;
    END IF;
  ELSE
    INSERT INTO comind_pm.pm_conversation_governance_bindings(
      project_id,
      conversation_id,
      asset_id,
      purpose,
      source_ref,
      metadata
    ) VALUES (
      v_project_id,
      p_conversation_id,
      v_asset.id,
      p_purpose,
      'comind.cm_conversation:' || p_conversation_id::text,
      p_metadata
    )
    RETURNING * INTO v_binding;
    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'binding_id', v_binding.id,
    'conversation_id', p_conversation_id,
    'asset_key', v_asset.asset_key,
    'classification_key', p_classification_key,
    'tenant_key', v_tenant_key,
    'project_scope_key', v_project_scope_key,
    'purpose', v_binding.purpose,
    'created', v_created
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.record_conversation_egress_review(
  p_governance_project_key text,
  p_conversation_id uuid,
  p_destination_key text,
  p_decision text,
  p_reviewed_by text,
  p_authority_basis text,
  p_expires_at timestamptz DEFAULT NULL,
  p_evidence_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_project_id uuid;
  v_binding_id uuid;
  v_destination_id uuid;
  v_event_id uuid;
  v_reviewed_at timestamptz := clock_timestamp();
BEGIN
  IF p_decision NOT IN ('approved','denied') THEN
    RAISE EXCEPTION 'INVALID_EGRESS_REVIEW_DECISION:%', p_decision;
  END IF;
  IF p_reviewed_by IS NULL OR length(btrim(p_reviewed_by)) = 0 THEN
    RAISE EXCEPTION 'EGRESS_REVIEWER_REQUIRED';
  END IF;
  IF p_authority_basis IS NULL OR length(btrim(p_authority_basis)) = 0 THEN
    RAISE EXCEPTION 'EGRESS_REVIEW_AUTHORITY_BASIS_REQUIRED';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'EGRESS_REVIEW_METADATA_MUST_BE_OBJECT';
  END IF;
  IF comind_pm.governance_context_has_forbidden_key(p_metadata) THEN
    RAISE EXCEPTION 'EGRESS_REVIEW_METADATA_CONTAINS_RAW_SENSITIVE_KEY';
  END IF;
  IF p_decision = 'approved' AND p_expires_at IS NOT NULL AND p_expires_at <= v_reviewed_at THEN
    RAISE EXCEPTION 'EGRESS_REVIEW_EXPIRY_MUST_BE_FUTURE';
  END IF;
  IF p_decision = 'denied' AND p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'DENIED_EGRESS_REVIEW_CANNOT_EXPIRE';
  END IF;

  SELECT id INTO v_project_id
  FROM comind_pm.pm_projects
  WHERE project_key = p_governance_project_key;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_GOVERNANCE_PROJECT:%', p_governance_project_key;
  END IF;

  SELECT id INTO v_binding_id
  FROM comind_pm.pm_conversation_governance_bindings
  WHERE project_id = v_project_id
    AND conversation_id = p_conversation_id;
  IF v_binding_id IS NULL THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_BINDING_MISSING:%', p_conversation_id;
  END IF;

  SELECT id INTO v_destination_id
  FROM comind_pm.pm_egress_destinations
  WHERE project_id = v_project_id
    AND destination_key = p_destination_key
    AND active;
  IF v_destination_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_OR_INACTIVE_EGRESS_DESTINATION:%', p_destination_key;
  END IF;

  INSERT INTO comind_pm.pm_conversation_egress_review_events(
    project_id,
    binding_id,
    destination_id,
    decision,
    reviewed_by,
    reviewed_at,
    expires_at,
    authority_basis,
    evidence_ref,
    metadata
  ) VALUES (
    v_project_id,
    v_binding_id,
    v_destination_id,
    p_decision,
    p_reviewed_by,
    v_reviewed_at,
    p_expires_at,
    p_authority_basis,
    p_evidence_ref,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'review_event_id', v_event_id,
    'conversation_id', p_conversation_id,
    'destination_key', p_destination_key,
    'decision', p_decision,
    'reviewed_at', v_reviewed_at,
    'expires_at', p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.resolve_conversation_execution_governance(
  p_governance_project_key text,
  p_conversation_id uuid,
  p_destination_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, comind_pm, comind
AS $$
DECLARE
  v_project_id uuid;
  v_org_id uuid;
  v_conversation_project_id uuid;
  v_expected_tenant_key text;
  v_expected_project_scope_key text;
  v_destination_id uuid;
  v_asset comind_pm.pm_data_asset_governance%ROWTYPE;
  v_binding comind_pm.pm_conversation_governance_bindings%ROWTYPE;
  v_classification_key text;
  v_classification_rank integer;
  v_review record;
  v_human_approved boolean := false;
  v_review_state text := 'pending';
BEGIN
  SELECT id INTO v_project_id
  FROM comind_pm.pm_projects
  WHERE project_key = p_governance_project_key;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_GOVERNANCE_PROJECT:%', p_governance_project_key;
  END IF;

  SELECT c.org_id, c.project_id
    INTO v_org_id, v_conversation_project_id
  FROM comind.cm_conversation c
  WHERE c.conv_id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_NOT_FOUND:%', p_conversation_id;
  END IF;
  IF v_org_id IS NULL OR v_conversation_project_id IS NULL THEN
    RAISE EXCEPTION 'CONVERSATION_SCOPE_INCOMPLETE:%', p_conversation_id;
  END IF;

  v_expected_tenant_key := 'org:' || v_org_id::text;
  v_expected_project_scope_key := 'project:' || v_conversation_project_id::text;

  SELECT * INTO v_binding
  FROM comind_pm.pm_conversation_governance_bindings
  WHERE project_id = v_project_id
    AND conversation_id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_BINDING_MISSING:%', p_conversation_id;
  END IF;

  SELECT * INTO v_asset
  FROM comind_pm.pm_data_asset_governance
  WHERE id = v_binding.asset_id
    AND project_id = v_project_id;
  IF NOT FOUND OR v_asset.disposition_status <> 'active' THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_ASSET_UNAVAILABLE:%', p_conversation_id;
  END IF;

  IF v_asset.tenant_key IS DISTINCT FROM v_expected_tenant_key
     OR v_asset.project_scope_key <> v_expected_project_scope_key THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_SCOPE_MISMATCH:%', p_conversation_id;
  END IF;
  IF NOT (v_binding.purpose = ANY(v_asset.allowed_purposes)) THEN
    RAISE EXCEPTION 'CONVERSATION_GOVERNANCE_PURPOSE_NOT_ALLOWED:%', p_conversation_id;
  END IF;

  SELECT classification_key, rank
    INTO v_classification_key, v_classification_rank
  FROM comind_pm.pm_data_classification_levels
  WHERE id = v_asset.classification_id
    AND project_id = v_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_CLASSIFICATION_UNAVAILABLE:%', p_conversation_id;
  END IF;

  SELECT id INTO v_destination_id
  FROM comind_pm.pm_egress_destinations
  WHERE project_id = v_project_id
    AND destination_key = p_destination_key
    AND active;
  IF v_destination_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_OR_INACTIVE_EGRESS_DESTINATION:%', p_destination_key;
  END IF;

  SELECT e.decision, e.reviewed_at, e.expires_at, e.reviewed_by, e.authority_basis, e.evidence_ref
    INTO v_review
  FROM comind_pm.pm_conversation_egress_review_events e
  WHERE e.project_id = v_project_id
    AND e.binding_id = v_binding.id
    AND e.destination_id = v_destination_id
  ORDER BY e.reviewed_at DESC, e.created_at DESC, e.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_review.decision = 'approved' AND (v_review.expires_at IS NULL OR v_review.expires_at > clock_timestamp()) THEN
      v_human_approved := true;
      v_review_state := 'approved';
    ELSIF v_review.decision = 'approved' THEN
      v_review_state := 'expired';
    ELSE
      v_review_state := 'denied';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'asset_key', v_asset.asset_key,
    'classification_key', v_classification_key,
    'classification_rank', v_classification_rank,
    'purpose', v_binding.purpose,
    'tenant_key', v_expected_tenant_key,
    'project_scope_key', v_expected_project_scope_key,
    'source_tenant', v_expected_tenant_key,
    'target_tenant', v_expected_tenant_key,
    'source_project', v_expected_project_scope_key,
    'target_project', v_expected_project_scope_key,
    'destination_key', p_destination_key,
    'human_approved', v_human_approved,
    'egress_review_state', v_review_state,
    'egress_reviewed_at', CASE WHEN v_review.reviewed_at IS NULL THEN NULL ELSE to_jsonb(v_review.reviewed_at) END,
    'egress_review_expires_at', CASE WHEN v_review.expires_at IS NULL THEN NULL ELSE to_jsonb(v_review.expires_at) END
  );
END;
$$;

REVOKE ALL ON FUNCTION comind_pm.reject_conversation_egress_review_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM service_role;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) TO service_role;
  END IF;
END $$;

COMMIT;
