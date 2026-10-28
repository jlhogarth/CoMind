BEGIN;

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_control_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  control_key text NOT NULL,
  layer0_section integer NOT NULL CHECK (layer0_section BETWEEN 1 AND 28),
  family_name text NOT NULL,
  source_coverage_state text NOT NULL CHECK (source_coverage_state IN ('modern_coverage_partial','modern_governance_gap','modern_coverage_adequate')),
  remediation_state text NOT NULL DEFAULT 'planned' CHECK (remediation_state IN ('planned','implemented_test','verified_test','operational_test','deferred','retired')),
  health_state text NOT NULL DEFAULT 'unknown' CHECK (health_state IN ('unknown','healthy','warning','blocking')),
  authority_owner text NOT NULL DEFAULT 'CoMind Governance',
  failure_mode text NOT NULL DEFAULT 'mixed' CHECK (failure_mode IN ('deny','review','alert','mixed')),
  standard_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, control_key),
  UNIQUE(project_id, layer0_section)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_control_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id uuid NOT NULL REFERENCES comind_pm.pm_governance_control_families(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  requirement_text text NOT NULL,
  capability_type text NOT NULL CHECK (capability_type IN ('policy','runtime','data','evidence','automation','hud','documentation','integration')),
  enforcement_mode text NOT NULL CHECK (enforcement_mode IN ('hard_deny','preflight','human_review','monitor','register','not_applicable')),
  status text NOT NULL DEFAULT 'implemented' CHECK (status IN ('implemented','verified','operational','deferred')),
  verification_method text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner text NOT NULL DEFAULT 'CoMind Governance',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(control_id, requirement_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_data_classification_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  classification_key text NOT NULL,
  display_name text NOT NULL,
  classification_rank integer NOT NULL CHECK (classification_rank BETWEEN 0 AND 100),
  external_transfer_default text NOT NULL CHECK (external_transfer_default IN ('allow','review','deny')),
  payload_logging_default text NOT NULL CHECK (payload_logging_default IN ('allow','metadata_only','deny')),
  requires_encryption boolean NOT NULL DEFAULT true,
  requires_purpose boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, classification_key),
  UNIQUE(project_id, classification_rank)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_residency_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  profile_key text NOT NULL,
  display_name text NOT NULL,
  allowed_regions text[] NOT NULL DEFAULT '{}',
  allowed_country_codes text[] NOT NULL DEFAULT '{}',
  cross_jurisdiction_mode text NOT NULL DEFAULT 'review' CHECK (cross_jurisdiction_mode IN ('deny','review','allow')),
  transfer_basis_required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, profile_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_retention_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  profile_key text NOT NULL,
  display_name text NOT NULL,
  minimum_retention_days integer CHECK (minimum_retention_days IS NULL OR minimum_retention_days >= 0),
  maximum_retention_days integer CHECK (maximum_retention_days IS NULL OR maximum_retention_days >= 0),
  disposition_authority_required boolean NOT NULL DEFAULT true,
  hard_delete_allowed boolean NOT NULL DEFAULT false,
  legal_hold_overrides_disposition boolean NOT NULL DEFAULT true,
  evidence_hold_overrides_disposition boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, profile_key),
  CHECK (minimum_retention_days IS NULL OR maximum_retention_days IS NULL OR minimum_retention_days <= maximum_retention_days)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_data_asset_governance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  asset_key text NOT NULL,
  asset_type text NOT NULL,
  classification_id uuid NOT NULL REFERENCES comind_pm.pm_data_classification_levels(id) ON DELETE RESTRICT,
  residency_profile_id uuid REFERENCES comind_pm.pm_residency_profiles(id) ON DELETE RESTRICT,
  retention_profile_id uuid REFERENCES comind_pm.pm_retention_profiles(id) ON DELETE RESTRICT,
  tenant_key text,
  project_scope_key text NOT NULL DEFAULT 'COMIND',
  allowed_purposes text[] NOT NULL DEFAULT '{}',
  legal_hold boolean NOT NULL DEFAULT false,
  evidence_hold boolean NOT NULL DEFAULT false,
  disposition_status text NOT NULL DEFAULT 'active' CHECK (disposition_status IN ('active','soft_deleted','hard_delete_approved','deleted')),
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, asset_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_crypto_key_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  key_key text NOT NULL,
  provider text NOT NULL,
  secret_ref text NOT NULL,
  purpose text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('development','test','production','shared')),
  algorithm_family text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotation_due','compromised','revoked','retired')),
  created_at_external timestamptz,
  rotate_by timestamptz,
  compromised_at timestamptz,
  retired_at timestamptz,
  owner text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, key_key),
  CONSTRAINT pm_crypto_key_registry_secret_ref_indirect CHECK (secret_ref ~ '^[a-z][a-z0-9+.-]*://[A-Za-z0-9._/-]+$')
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_compliance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  obligation_key text NOT NULL,
  framework text NOT NULL,
  version text,
  jurisdiction text,
  product_scope text NOT NULL,
  applicability text NOT NULL DEFAULT 'unassessed' CHECK (applicability IN ('applicable','not_applicable','conditional','unassessed')),
  satisfaction_state text NOT NULL DEFAULT 'unassessed' CHECK (satisfaction_state IN ('unassessed','planned','implemented','verified','independently_assessed','not_applicable')),
  rationale text NOT NULL,
  owner text NOT NULL DEFAULT 'CoMind Governance',
  review_due_at timestamptz,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, obligation_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_egress_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  destination_key text NOT NULL,
  destination_type text NOT NULL CHECK (destination_type IN ('provider','connector','service','browser','export','storage','other')),
  host_pattern text,
  max_classification_rank integer NOT NULL CHECK (max_classification_rank BETWEEN 0 AND 100),
  allowed_regions text[] NOT NULL DEFAULT '{}',
  allowed_tenant_keys text[] NOT NULL DEFAULT '{}',
  requires_purpose boolean NOT NULL DEFAULT true,
  requires_human_review boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, destination_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  control_id uuid NOT NULL REFERENCES comind_pm.pm_governance_control_families(id) ON DELETE RESTRICT,
  exception_key text NOT NULL,
  exception_type text NOT NULL CHECK (exception_type IN ('break_glass','policy_exception','legal_override','incident_response')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','revoked','expired','closed')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  authority_basis text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  valid_from timestamptz,
  expires_at timestamptz,
  post_review_due_at timestamptz,
  closed_at timestamptz,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, exception_key),
  CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at > valid_from),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND expires_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_runtime_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  control_id uuid NOT NULL REFERENCES comind_pm.pm_governance_control_families(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  decision text NOT NULL CHECK (decision IN ('allow','deny','review')),
  reason_code text NOT NULL,
  reason text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  exception_id uuid REFERENCES comind_pm.pm_governance_exceptions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind_pm.pm_projects(id) ON DELETE RESTRICT,
  control_id uuid NOT NULL REFERENCES comind_pm.pm_governance_control_families(id) ON DELETE CASCADE,
  assessment_key text NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN ('design','runtime','security','privacy','fairness','compliance','freshness','independent_review')),
  status text NOT NULL CHECK (status IN ('pass','warn','fail')),
  summary text NOT NULL,
  verifier text NOT NULL,
  verifier_independence text NOT NULL DEFAULT 'self_review',
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, assessment_key)
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_governance_control_health (
  control_id uuid PRIMARY KEY REFERENCES comind_pm.pm_governance_control_families(id) ON DELETE CASCADE,
  health_state text NOT NULL DEFAULT 'unknown' CHECK (health_state IN ('unknown','healthy','warning','blocking')),
  requirements_total integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  operational_count integer NOT NULL DEFAULT 0,
  open_exception_count integer NOT NULL DEFAULT 0,
  blocking_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_runtime_decision_at timestamptz,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pm_gov_requirements_control_status_idx ON comind_pm.pm_governance_control_requirements(control_id,status);
CREATE INDEX IF NOT EXISTS pm_data_assets_scope_idx ON comind_pm.pm_data_asset_governance(project_id,tenant_key,project_scope_key);
CREATE INDEX IF NOT EXISTS pm_data_assets_class_idx ON comind_pm.pm_data_asset_governance(classification_id);
CREATE INDEX IF NOT EXISTS pm_crypto_keys_status_rotate_idx ON comind_pm.pm_crypto_key_registry(project_id,status,rotate_by);
CREATE INDEX IF NOT EXISTS pm_compliance_review_idx ON comind_pm.pm_compliance_obligations(project_id,applicability,satisfaction_state,review_due_at);
CREATE INDEX IF NOT EXISTS pm_egress_active_idx ON comind_pm.pm_egress_destinations(project_id,active);
CREATE INDEX IF NOT EXISTS pm_gov_exceptions_control_status_expiry_idx ON comind_pm.pm_governance_exceptions(control_id,status,expires_at);
CREATE INDEX IF NOT EXISTS pm_gov_runtime_control_created_idx ON comind_pm.pm_governance_runtime_decisions(control_id,created_at DESC);
CREATE INDEX IF NOT EXISTS pm_gov_assessments_control_performed_idx ON comind_pm.pm_governance_assessments(control_id,performed_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels',
    'pm_residency_profiles','pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry',
    'pm_compliance_obligations','pm_egress_destinations','pm_governance_exceptions',
    'pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
  ] LOOP
    EXECUTE format('ALTER TABLE comind_pm.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM PUBLIC',t);
    IF to_regrole('anon') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM anon',t); END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON TABLE comind_pm.%I FROM authenticated',t); END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION comind_pm.governance_context_has_forbidden_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE k text; v jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR k,v IN SELECT key,value FROM jsonb_each(p_value) LOOP
      IF lower(k) = ANY(ARRAY['prompt','raw_prompt','secret','password','token','api_key','apikey','authorization','credential','credentials','key_material']) THEN RETURN true; END IF;
      IF comind_pm.governance_context_has_forbidden_key(v) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF comind_pm.governance_context_has_forbidden_key(v) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION comind_pm.governance_context_has_forbidden_key(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION comind_pm.governance_preflight_core(p_control_key text,p_context jsonb,p_record boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_control comind_pm.pm_governance_control_families%rowtype;
  v_decision text := 'deny'; v_code text := 'CONTROL_DENY'; v_reason text := 'Control conditions were not satisfied.';
  v_asset comind_pm.pm_data_asset_governance%rowtype; v_class comind_pm.pm_data_classification_levels%rowtype; v_actor_class comind_pm.pm_data_classification_levels%rowtype;
  v_retention comind_pm.pm_retention_profiles%rowtype; v_residency comind_pm.pm_residency_profiles%rowtype; v_destination comind_pm.pm_egress_destinations%rowtype;
  v_key comind_pm.pm_crypto_key_registry%rowtype; v_obligation comind_pm.pm_compliance_obligations%rowtype; v_exception comind_pm.pm_governance_exceptions%rowtype; v_assessment comind_pm.pm_governance_assessments%rowtype;
  v_purpose text := nullif(p_context->>'purpose',''); v_exception_key text := nullif(p_context->>'exception_key',''); v_now timestamptz := clock_timestamp();
BEGIN
  IF p_context IS NULL OR jsonb_typeof(p_context) <> 'object' THEN RAISE EXCEPTION 'Governance preflight context must be a JSON object'; END IF;
  IF comind_pm.governance_context_has_forbidden_key(p_context) THEN RAISE EXCEPTION 'Governance context contains a prohibited raw-sensitive field'; END IF;
  SELECT id INTO v_project_id FROM comind_pm.pm_projects WHERE project_key='COMIND';
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'COMIND project registry entry is missing'; END IF;
  SELECT * INTO v_control FROM comind_pm.pm_governance_control_families WHERE project_id=v_project_id AND control_key=p_control_key;
  IF NOT FOUND THEN v_decision:='deny'; v_code:='UNKNOWN_CONTROL'; v_reason:='Unknown governance control.';
  ELSIF p_control_key='DRULE-C03' THEN
    SELECT * INTO v_class FROM comind_pm.pm_data_classification_levels WHERE project_id=v_project_id AND classification_key=upper(coalesce(p_context->>'classification_key','')) AND active;
    IF NOT FOUND THEN v_code:='CLASSIFICATION_REQUIRED'; v_reason:='A registered active data classification is required.';
    ELSIF v_class.requires_purpose AND v_purpose IS NULL THEN v_code:='PURPOSE_REQUIRED'; v_reason:='This classification requires an explicit purpose.';
    ELSE v_decision:='allow'; v_code:='CLASSIFICATION_VALID'; v_reason:='Classification and handling prerequisites are registered.'; END IF;
  ELSIF p_control_key='DRULE-C04' THEN
    SELECT * INTO v_key FROM comind_pm.pm_crypto_key_registry WHERE project_id=v_project_id AND key_key=p_context->>'key_key';
    IF NOT FOUND THEN v_code:='KEY_NOT_REGISTERED'; v_reason:='Cryptographic key metadata is not registered.';
    ELSIF v_key.status <> 'active' THEN v_code:='KEY_NOT_ACTIVE'; v_reason:='Key lifecycle state does not permit use.';
    ELSIF v_key.rotate_by IS NOT NULL AND v_key.rotate_by <= v_now THEN v_code:='KEY_ROTATION_OVERDUE'; v_reason:='Key rotation deadline has elapsed.';
    ELSE v_decision:='allow'; v_code:='KEY_ACTIVE'; v_reason:='Key metadata is active and within lifecycle bounds.'; END IF;
  ELSIF p_control_key IN ('DRULE-C06','DRULE-C07','DRULE-C13','DRULE-C19','DRULE-C27') THEN
    SELECT * INTO v_asset FROM comind_pm.pm_data_asset_governance WHERE project_id=v_project_id AND asset_key=p_context->>'asset_key';
    IF NOT FOUND THEN v_code:='ASSET_NOT_GOVERNED'; v_reason:='A governed asset record is required.';
    ELSE
      SELECT * INTO v_class FROM comind_pm.pm_data_classification_levels WHERE id=v_asset.classification_id;
      IF p_control_key='DRULE-C06' THEN
        SELECT * INTO v_actor_class FROM comind_pm.pm_data_classification_levels WHERE project_id=v_project_id AND classification_key=upper(coalesce(p_context->>'actor_clearance_key','')) AND active;
        IF NOT FOUND THEN v_code:='CLEARANCE_REQUIRED'; v_reason:='A registered actor clearance is required.';
        ELSIF v_actor_class.classification_rank < v_class.classification_rank THEN v_code:='CLEARANCE_INSUFFICIENT'; v_reason:='Actor clearance is below asset classification.';
        ELSIF v_asset.tenant_key IS NOT NULL AND coalesce(p_context->>'tenant_key','') <> v_asset.tenant_key THEN v_code:='TENANT_SCOPE_MISMATCH'; v_reason:='Retrieval tenant scope does not match asset scope.';
        ELSIF coalesce(p_context->>'project_scope_key','COMIND') <> v_asset.project_scope_key THEN v_code:='PROJECT_SCOPE_MISMATCH'; v_reason:='Retrieval project scope does not match asset scope.';
        ELSIF cardinality(v_asset.allowed_purposes)>0 AND (v_purpose IS NULL OR NOT(v_purpose=ANY(v_asset.allowed_purposes))) THEN v_code:='PURPOSE_NOT_ALLOWED'; v_reason:='Requested retrieval purpose is not registered for the asset.';
        ELSIF v_asset.disposition_status='deleted' THEN v_code:='ASSET_DELETED'; v_reason:='Deleted asset cannot be retrieved.';
        ELSE v_decision:='allow'; v_code:='RETRIEVAL_AUTHORIZED'; v_reason:='Clearance, tenant, project and purpose checks passed.'; END IF;
      ELSIF p_control_key='DRULE-C07' THEN
        IF v_asset.retention_profile_id IS NULL THEN v_code:='RETENTION_PROFILE_REQUIRED'; v_reason:='Disposition requires a retention profile.';
        ELSE SELECT * INTO v_retention FROM comind_pm.pm_retention_profiles WHERE id=v_asset.retention_profile_id;
          IF v_asset.legal_hold THEN v_code:='LEGAL_HOLD'; v_reason:='Legal hold blocks disposition.';
          ELSIF v_asset.evidence_hold THEN v_code:='EVIDENCE_HOLD'; v_reason:='Evidence hold blocks disposition.';
          ELSIF coalesce((p_context->>'disposition_authorized')::boolean,false) IS false THEN v_decision:='review'; v_code:='DISPOSITION_AUTHORITY_REQUIRED'; v_reason:='Explicit disposition authority is required.';
          ELSIF coalesce(p_context->>'action','')='hard_delete' AND NOT v_retention.hard_delete_allowed THEN v_code:='HARD_DELETE_NOT_ALLOWED'; v_reason:='Retention profile does not permit hard deletion.';
          ELSE v_decision:='allow'; v_code:='DISPOSITION_AUTHORIZED'; v_reason:='Hold, retention and authority checks passed.'; END IF;
        END IF;
      ELSIF p_control_key='DRULE-C13' THEN
        SELECT * INTO v_destination FROM comind_pm.pm_egress_destinations WHERE project_id=v_project_id AND destination_key=p_context->>'destination_key' AND active;
        IF NOT FOUND THEN v_code:='DESTINATION_NOT_REGISTERED'; v_reason:='Outbound destination is not registered and active.';
        ELSIF v_class.classification_rank > v_destination.max_classification_rank THEN v_code:='CLASSIFICATION_EXCEEDS_DESTINATION'; v_reason:='Asset classification exceeds destination allowance.';
        ELSIF cardinality(v_destination.allowed_regions)>0 AND NOT(coalesce(p_context->>'region','')=ANY(v_destination.allowed_regions)) THEN v_code:='EGRESS_REGION_NOT_ALLOWED'; v_reason:='Requested egress region is not allowed.';
        ELSIF v_destination.requires_purpose AND v_purpose IS NULL THEN v_code:='PURPOSE_REQUIRED'; v_reason:='Destination requires an explicit purpose.';
        ELSIF cardinality(v_destination.allowed_tenant_keys)>0 AND NOT(coalesce(p_context->>'tenant_key','')=ANY(v_destination.allowed_tenant_keys)) THEN v_code:='EGRESS_TENANT_NOT_ALLOWED'; v_reason:='Destination is not approved for this tenant.';
        ELSIF v_destination.requires_human_review AND coalesce((p_context->>'human_approved')::boolean,false) IS false THEN v_decision:='review'; v_code:='EGRESS_HUMAN_REVIEW'; v_reason:='Destination requires explicit human review.';
        ELSE v_decision:='allow'; v_code:='EGRESS_AUTHORIZED'; v_reason:='Destination, classification, region, tenant and purpose checks passed.'; END IF;
      ELSIF p_control_key='DRULE-C19' THEN
        IF v_asset.residency_profile_id IS NULL THEN v_decision:='review'; v_code:='RESIDENCY_PROFILE_REQUIRED'; v_reason:='Asset has no residency profile.';
        ELSE SELECT * INTO v_residency FROM comind_pm.pm_residency_profiles WHERE id=v_asset.residency_profile_id;
          IF cardinality(v_residency.allowed_regions)>0 AND NOT(coalesce(p_context->>'region','')=ANY(v_residency.allowed_regions)) THEN v_code:='RESIDENCY_REGION_DENIED'; v_reason:='Requested region is outside the asset residency profile.';
          ELSIF coalesce((p_context->>'cross_jurisdiction')::boolean,false) AND v_residency.cross_jurisdiction_mode='deny' THEN v_code:='CROSS_JURISDICTION_DENIED'; v_reason:='Residency profile denies cross-jurisdiction transfer.';
          ELSIF coalesce((p_context->>'cross_jurisdiction')::boolean,false) AND v_residency.transfer_basis_required AND nullif(p_context->>'transfer_basis','') IS NULL THEN v_decision:='review'; v_code:='TRANSFER_BASIS_REQUIRED'; v_reason:='Cross-jurisdiction transfer requires a recorded basis.';
          ELSE v_decision:='allow'; v_code:='RESIDENCY_AUTHORIZED'; v_reason:='Residency and transfer-basis checks passed.'; END IF;
        END IF;
      ELSIF p_control_key='DRULE-C27' THEN
        IF coalesce(p_context->>'log_mode','metadata')='payload' AND v_class.payload_logging_default='deny' THEN v_code:='PAYLOAD_LOGGING_DENIED'; v_reason:='Payload logging is denied for this classification.';
        ELSIF coalesce(p_context->>'log_mode','metadata')='payload' AND v_class.payload_logging_default='metadata_only' THEN v_decision:='review'; v_code:='METADATA_ONLY_DEFAULT'; v_reason:='Classification defaults to metadata-only logging.';
        ELSIF coalesce((p_context->>'durable')::boolean,false) AND v_asset.retention_profile_id IS NULL THEN v_code:='RETENTION_PROFILE_REQUIRED'; v_reason:='Durable logging requires retention semantics.';
        ELSE v_decision:='allow'; v_code:='LOGGING_MINIMIZED'; v_reason:='Logging mode and retention prerequisites satisfy the privacy control.'; END IF;
      END IF;
    END IF;
  ELSIF p_control_key='DRULE-C10' THEN
    SELECT * INTO v_obligation FROM comind_pm.pm_compliance_obligations WHERE project_id=v_project_id AND obligation_key=p_context->>'obligation_key';
    IF NOT FOUND THEN v_decision:='review'; v_code:='APPLICABILITY_UNASSESSED'; v_reason:='Compliance applicability has not been registered.';
    ELSIF coalesce(p_context->>'action','')='external_claim' AND v_obligation.applicability IN ('applicable','conditional') AND v_obligation.satisfaction_state NOT IN ('verified','independently_assessed') THEN v_code:='CLAIM_NOT_EVIDENCED'; v_reason:='External conformity or certification claim lacks verified evidence.';
    ELSIF v_obligation.applicability='unassessed' THEN v_decision:='review'; v_code:='APPLICABILITY_UNASSESSED'; v_reason:='Obligation applicability is unassessed.';
    ELSE v_decision:='allow'; v_code:='COMPLIANCE_STATE_ACCEPTABLE'; v_reason:='Recorded applicability state permits this action without asserting unsupported conformity.'; END IF;
  ELSIF p_control_key='DRULE-C11' THEN
    IF coalesce((p_context->>'untrusted_input')::boolean,false) AND coalesce((p_context->>'asks_for_secrets')::boolean,false) THEN v_code:='UNTRUSTED_SECRET_REQUEST'; v_reason:='Untrusted input requested secret disclosure.';
    ELSIF coalesce((p_context->>'untrusted_input')::boolean,false) AND coalesce((p_context->>'authority_escalation')::boolean,false) THEN v_code:='UNTRUSTED_AUTHORITY_ESCALATION'; v_reason:='Untrusted input attempted authority escalation.';
    ELSIF coalesce((p_context->>'untrusted_input')::boolean,false) AND coalesce((p_context->>'side_effect')::boolean,false) AND NOT coalesce((p_context->>'human_approved')::boolean,false) THEN v_decision:='review'; v_code:='SIDE_EFFECT_REVIEW_REQUIRED'; v_reason:='Untrusted consequential side effect requires explicit review.';
    ELSE v_decision:='allow'; v_code:='TRUST_BOUNDARY_ACCEPTABLE'; v_reason:='Structured trust-boundary checks passed.'; END IF;
  ELSIF p_control_key='DRULE-C15' THEN
    SELECT * INTO v_exception FROM comind_pm.pm_governance_exceptions WHERE project_id=v_project_id AND control_id=v_control.id AND exception_key=v_exception_key AND exception_type='break_glass';
    IF NOT FOUND THEN v_code:='BREAK_GLASS_NOT_APPROVED'; v_reason:='No governed break-glass exception was found.';
    ELSIF v_exception.status <> 'approved' THEN v_code:='BREAK_GLASS_NOT_ACTIVE'; v_reason:='Break-glass exception is not approved.';
    ELSIF v_exception.valid_from IS NOT NULL AND v_now < v_exception.valid_from THEN v_code:='BREAK_GLASS_NOT_YET_VALID'; v_reason:='Break-glass window has not started.';
    ELSIF v_exception.expires_at IS NULL OR v_now >= v_exception.expires_at THEN v_code:='BREAK_GLASS_EXPIRED'; v_reason:='Break-glass authority has expired.';
    ELSIF v_exception.scope ? 'resource' AND v_exception.scope->>'resource' <> p_context->>'resource' THEN v_code:='BREAK_GLASS_SCOPE_MISMATCH'; v_reason:='Requested resource is outside break-glass scope.';
    ELSIF v_exception.scope ? 'action' AND v_exception.scope->>'action' <> p_context->>'action' THEN v_code:='BREAK_GLASS_SCOPE_MISMATCH'; v_reason:='Requested action is outside break-glass scope.';
    ELSE v_decision:='allow'; v_code:='BREAK_GLASS_ACTIVE'; v_reason:='Approved, time-bounded and scoped break-glass authority is active.'; END IF;
  ELSIF p_control_key='DRULE-C17' THEN
    IF coalesce(p_context->>'source_tenant','')=coalesce(p_context->>'target_tenant','') AND coalesce(p_context->>'source_project','COMIND')=coalesce(p_context->>'target_project','COMIND') THEN v_decision:='allow'; v_code:='SAME_SCOPE'; v_reason:='Tenant and project scopes match.';
    ELSIF v_exception_key IS NOT NULL THEN
      SELECT * INTO v_exception FROM comind_pm.pm_governance_exceptions WHERE project_id=v_project_id AND control_id=v_control.id AND exception_key=v_exception_key AND status='approved' AND (valid_from IS NULL OR valid_from<=v_now) AND expires_at>v_now;
      IF NOT FOUND THEN v_code:='CROSS_SCOPE_DENIED'; v_reason:='Cross-scope access has no active governed exception.';
      ELSIF v_exception.scope ? 'source_tenant' AND v_exception.scope->>'source_tenant' <> p_context->>'source_tenant' THEN v_code:='CROSS_SCOPE_EXCEPTION_MISMATCH'; v_reason:='Exception source tenant does not match.';
      ELSIF v_exception.scope ? 'target_tenant' AND v_exception.scope->>'target_tenant' <> p_context->>'target_tenant' THEN v_code:='CROSS_SCOPE_EXCEPTION_MISMATCH'; v_reason:='Exception target tenant does not match.';
      ELSIF v_exception.scope ? 'action' AND v_exception.scope->>'action' <> p_context->>'action' THEN v_code:='CROSS_SCOPE_EXCEPTION_MISMATCH'; v_reason:='Exception action does not match.';
      ELSE v_decision:='allow'; v_code:='CROSS_SCOPE_EXCEPTION_ACTIVE'; v_reason:='Explicit active scoped exception authorizes the cross-scope operation.'; END IF;
    ELSE v_code:='CROSS_SCOPE_DENIED'; v_reason:='Cross-tenant or cross-project access is denied by default.'; END IF;
  ELSIF p_control_key='DRULE-C24' THEN
    IF NOT coalesce((p_context->>'high_consequence')::boolean,false) THEN v_decision:='allow'; v_code:='STANDARD_CONSEQUENCE'; v_reason:='Request is not marked high-consequence.';
    ELSE
      SELECT * INTO v_assessment FROM comind_pm.pm_governance_assessments WHERE project_id=v_project_id AND control_id=v_control.id AND assessment_key=p_context->>'assessment_key' AND assessment_type='fairness';
      IF NOT FOUND OR v_assessment.status<>'pass' THEN v_decision:='review'; v_code:='IMPACT_ASSESSMENT_REQUIRED'; v_reason:='High-consequence use requires a passing scoped impact assessment.';
      ELSIF NOT coalesce((p_context->>'human_oversight')::boolean,false) THEN v_decision:='review'; v_code:='HUMAN_OVERSIGHT_REQUIRED'; v_reason:='High-consequence use requires explicit human oversight.';
      ELSE v_decision:='allow'; v_code:='HIGH_CONSEQUENCE_REVIEWED'; v_reason:='Scoped impact assessment and human oversight are present.'; END IF;
    END IF;
  END IF;

  IF p_record AND v_control.id IS NOT NULL THEN
    INSERT INTO comind_pm.pm_governance_runtime_decisions(project_id,control_id,decision,reason_code,reason,context,exception_id)
    VALUES(v_project_id,v_control.id,v_decision,v_code,v_reason,p_context,CASE WHEN v_exception.id IS NOT NULL THEN v_exception.id ELSE NULL END);
  END IF;
  RETURN jsonb_build_object('control_key',p_control_key,'decision',v_decision,'reason_code',v_code,'reason',v_reason,'evaluated_at',v_now);
END;
$$;
REVOKE ALL ON FUNCTION comind_pm.governance_preflight_core(text,jsonb,boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION comind_pm.governance_preflight(p_control_key text,p_context jsonb,p_record boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_control_key='DRULE-C17' AND (
    nullif(p_context->>'source_tenant','') IS NULL OR nullif(p_context->>'target_tenant','') IS NULL OR
    nullif(p_context->>'source_project','') IS NULL OR nullif(p_context->>'target_project','') IS NULL
  ) THEN
    RETURN jsonb_build_object('control_key',p_control_key,'decision','deny','reason_code','TENANCY_CONTEXT_REQUIRED','reason','Explicit source and target tenant/project scope is required for tenancy isolation checks.','evaluated_at',clock_timestamp());
  END IF;
  RETURN comind_pm.governance_preflight_core(p_control_key,p_context,p_record);
END;
$$;
REVOKE ALL ON FUNCTION comind_pm.governance_preflight(text,jsonb,boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION comind_pm.refresh_governance_control_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE comind_pm.pm_governance_exceptions SET status='expired',updated_at=clock_timestamp() WHERE status='approved' AND expires_at IS NOT NULL AND expires_at<=clock_timestamp();
  INSERT INTO comind_pm.pm_governance_control_health(control_id,health_state,requirements_total,verified_count,operational_count,open_exception_count,blocking_reasons,last_runtime_decision_at,last_checked_at,next_review_at)
  SELECT f.id,
    CASE WHEN coalesce(rs.requirements_total,0)=0 THEN 'blocking' WHEN coalesce(rs.verified_count,0)<rs.requirements_total THEN 'warning' WHEN coalesce(fs.fail_count,0)>0 THEN 'blocking' ELSE 'healthy' END,
    coalesce(rs.requirements_total,0),coalesce(rs.verified_count,0),coalesce(rs.operational_count,0),coalesce(es.open_exception_count,0),coalesce(fs.blocking_reasons,'[]'::jsonb),ds.last_runtime_decision_at,clock_timestamp(),clock_timestamp()+interval '30 days'
  FROM comind_pm.pm_governance_control_families f
  LEFT JOIN LATERAL (SELECT count(*)::int requirements_total,count(*) FILTER(WHERE r.status IN ('verified','operational'))::int verified_count,count(*) FILTER(WHERE r.status='operational')::int operational_count FROM comind_pm.pm_governance_control_requirements r WHERE r.control_id=f.id) rs ON true
  LEFT JOIN LATERAL (SELECT count(*)::int open_exception_count FROM comind_pm.pm_governance_exceptions e WHERE e.control_id=f.id AND e.status IN ('requested','approved')) es ON true
  LEFT JOIN LATERAL (SELECT count(*)::int fail_count,coalesce(jsonb_agg(jsonb_build_object('assessment_key',a.assessment_key,'summary',a.summary)) FILTER(WHERE a.status='fail'),'[]'::jsonb) blocking_reasons FROM comind_pm.pm_governance_assessments a WHERE a.control_id=f.id AND a.status='fail' AND a.performed_at>=clock_timestamp()-interval '30 days') fs ON true
  LEFT JOIN LATERAL (SELECT max(d.created_at) last_runtime_decision_at FROM comind_pm.pm_governance_runtime_decisions d WHERE d.control_id=f.id) ds ON true
  ON CONFLICT(control_id) DO UPDATE SET health_state=excluded.health_state,requirements_total=excluded.requirements_total,verified_count=excluded.verified_count,operational_count=excluded.operational_count,open_exception_count=excluded.open_exception_count,blocking_reasons=excluded.blocking_reasons,last_runtime_decision_at=excluded.last_runtime_decision_at,last_checked_at=excluded.last_checked_at,next_review_at=excluded.next_review_at;
  UPDATE comind_pm.pm_governance_control_families f SET health_state=h.health_state,remediation_state=CASE WHEN h.health_state='healthy' THEN 'verified_test' ELSE 'implemented_test' END,updated_at=clock_timestamp() FROM comind_pm.pm_governance_control_health h WHERE h.control_id=f.id;
END;
$$;
REVOKE ALL ON FUNCTION comind_pm.refresh_governance_control_health() FROM PUBLIC;

COMMIT;
