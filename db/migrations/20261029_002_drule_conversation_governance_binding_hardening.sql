BEGIN;

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
  v_review_decision text;
  v_reviewed_at timestamptz;
  v_review_expires_at timestamptz;
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

  SELECT e.decision, e.reviewed_at, e.expires_at
    INTO v_review_decision, v_reviewed_at, v_review_expires_at
  FROM comind_pm.pm_conversation_egress_review_events e
  WHERE e.project_id = v_project_id
    AND e.binding_id = v_binding.id
    AND e.destination_id = v_destination_id
  ORDER BY e.reviewed_at DESC, e.created_at DESC, e.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_review_decision = 'approved'
       AND (v_review_expires_at IS NULL OR v_review_expires_at > now()) THEN
      v_human_approved := true;
      v_review_state := 'approved';
    ELSIF v_review_decision = 'approved' THEN
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
    'egress_reviewed_at', v_reviewed_at,
    'egress_review_expires_at', v_review_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) TO service_role;
  END IF;
END $$;

COMMIT;
