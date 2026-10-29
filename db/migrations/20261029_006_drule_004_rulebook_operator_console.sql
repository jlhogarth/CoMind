BEGIN;

CREATE OR REPLACE FUNCTION public.comind_rulebook_operator_conversation_status(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  conversation_id uuid,
  asset_key text,
  classification_key text,
  classification_rank integer,
  purpose text,
  tenant_key text,
  project_scope_key text,
  destination_key text,
  human_approved boolean,
  egress_review_state text,
  egress_reviewed_at timestamptz,
  egress_review_expires_at timestamptz,
  reviewed_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, comind_pm, comind
AS $$
DECLARE
  v_project_id uuid;
  v_destination_id uuid;
  v_effective_limit integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_LIMIT_OUT_OF_RANGE';
  END IF;
  v_effective_limit := p_limit;

  SELECT id INTO v_project_id
  FROM comind_pm.pm_projects
  WHERE project_key = 'COMIND';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_PROJECT_UNAVAILABLE';
  END IF;

  SELECT id INTO v_destination_id
  FROM comind_pm.pm_egress_destinations
  WHERE project_id = v_project_id
    AND destination_key = 'OPENAI-API'
    AND active;
  IF v_destination_id IS NULL THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_DESTINATION_UNAVAILABLE';
  END IF;

  RETURN QUERY
  SELECT
    b.conversation_id,
    a.asset_key,
    c.classification_key,
    c.classification_rank,
    b.purpose,
    a.tenant_key,
    a.project_scope_key,
    'OPENAI-API'::text AS destination_key,
    CASE
      WHEN latest.decision = 'approved' AND latest.expires_at > now() THEN true
      ELSE false
    END AS human_approved,
    CASE
      WHEN latest.decision IS NULL THEN 'pending'
      WHEN latest.decision = 'approved' AND latest.expires_at > now() THEN 'approved'
      WHEN latest.decision = 'approved' THEN 'expired'
      ELSE 'denied'
    END AS egress_review_state,
    latest.reviewed_at,
    latest.expires_at,
    latest.reviewed_by
  FROM comind_pm.pm_conversation_governance_bindings b
  JOIN comind_pm.pm_data_asset_governance a
    ON a.id = b.asset_id
   AND a.project_id = b.project_id
  JOIN comind_pm.pm_data_classification_levels c
    ON c.id = a.classification_id
   AND c.project_id = b.project_id
  JOIN comind.cm_conversation conv
    ON conv.conv_id = b.conversation_id
  LEFT JOIN LATERAL (
    SELECT e.decision, e.reviewed_at, e.expires_at, e.reviewed_by
    FROM comind_pm.pm_conversation_egress_review_events e
    WHERE e.project_id = b.project_id
      AND e.binding_id = b.id
      AND e.destination_id = v_destination_id
    ORDER BY e.reviewed_at DESC, e.created_at DESC, e.id DESC
    LIMIT 1
  ) latest ON true
  WHERE b.project_id = v_project_id
    AND a.disposition_status = 'active'
    AND a.tenant_key = 'org:' || conv.org_id::text
    AND a.project_scope_key = 'project:' || conv.project_id::text
    AND b.purpose = ANY(a.allowed_purposes)
  ORDER BY b.updated_at DESC, b.conversation_id
  LIMIT v_effective_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.comind_rulebook_operator_review_conversation(
  p_conversation_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_authority_basis text,
  p_approval_hours integer DEFAULT NULL,
  p_evidence_ref text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_expires_at timestamptz;
  v_result jsonb;
BEGIN
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_CONVERSATION_REQUIRED';
  END IF;
  IF p_decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_DECISION_INVALID';
  END IF;
  IF p_reviewed_by IS NULL OR length(btrim(p_reviewed_by)) = 0 OR length(p_reviewed_by) > 200 THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_REVIEWER_INVALID';
  END IF;
  IF p_authority_basis IS NULL OR length(btrim(p_authority_basis)) = 0 OR length(p_authority_basis) > 2000 THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_AUTHORITY_BASIS_INVALID';
  END IF;
  IF p_evidence_ref IS NOT NULL AND length(p_evidence_ref) > 1000 THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_EVIDENCE_REF_TOO_LONG';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'RULEBOOK_OPERATOR_REQUEST_ID_REQUIRED';
  END IF;

  IF p_decision = 'approved' THEN
    IF p_approval_hours IS NULL OR p_approval_hours NOT IN (1, 4, 8, 24) THEN
      RAISE EXCEPTION 'RULEBOOK_OPERATOR_APPROVAL_WINDOW_INVALID';
    END IF;
    v_expires_at := clock_timestamp() + make_interval(hours => p_approval_hours);
  ELSE
    IF p_approval_hours IS NOT NULL THEN
      RAISE EXCEPTION 'RULEBOOK_OPERATOR_DENIAL_CANNOT_HAVE_APPROVAL_WINDOW';
    END IF;
    v_expires_at := NULL;
  END IF;

  v_result := comind_pm.record_conversation_egress_review(
    'COMIND',
    p_conversation_id,
    'OPENAI-API',
    p_decision,
    btrim(p_reviewed_by),
    btrim(p_authority_basis),
    v_expires_at,
    NULLIF(btrim(p_evidence_ref), ''),
    jsonb_build_object(
      'source', 'operator-console',
      'drule', 'DRULE-004',
      'request_id', p_request_id::text
    )
  );

  RETURN v_result || jsonb_build_object(
    'project_key', 'COMIND',
    'destination_key', 'OPENAI-API',
    'request_id', p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.comind_rulebook_operator_conversation_status(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid) FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.comind_rulebook_operator_conversation_status(integer) FROM anon;
    REVOKE ALL ON FUNCTION public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.comind_rulebook_operator_conversation_status(integer) FROM authenticated;
    REVOKE ALL ON FUNCTION public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.comind_rulebook_operator_conversation_status(integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid) TO service_role;
  END IF;
END $$;

COMMIT;
