BEGIN;

DO $$
DECLARE
  v_project uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_project FROM comind_pm.pm_projects WHERE project_key='COMIND';
  IF v_project IS NULL THEN RAISE EXCEPTION 'COMIND project missing'; END IF;

  SELECT count(*) INTO v_count FROM comind_pm.pm_governance_control_families WHERE project_id=v_project;
  IF v_count <> 12 THEN RAISE EXCEPTION 'Expected 12 successor-remediation control families, found %',v_count; END IF;

  SELECT count(*) INTO v_count FROM comind_pm.pm_governance_control_requirements r JOIN comind_pm.pm_governance_control_families f ON f.id=r.control_id WHERE f.project_id=v_project;
  IF v_count <> 36 THEN RAISE EXCEPTION 'Expected 36 atomic control requirements, found %',v_count; END IF;

  SELECT count(*) INTO v_count FROM comind_pm.pm_data_classification_levels WHERE project_id=v_project AND active;
  IF v_count <> 5 THEN RAISE EXCEPTION 'Expected five active classification levels, found %',v_count; END IF;

  SELECT count(*) INTO v_count FROM comind_pm.pm_compliance_obligations WHERE project_id=v_project;
  IF v_count < 6 THEN RAISE EXCEPTION 'Compliance applicability register is incomplete'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='comind_pm' AND c.relname IN (
    'pm_governance_control_families','pm_governance_control_requirements','pm_data_classification_levels','pm_residency_profiles',
    'pm_retention_profiles','pm_data_asset_governance','pm_crypto_key_registry','pm_compliance_obligations','pm_egress_destinations',
    'pm_governance_exceptions','pm_governance_runtime_decisions','pm_governance_assessments','pm_governance_control_health'
  ) AND c.relrowsecurity;
  IF v_count <> 13 THEN RAISE EXCEPTION 'All 13 private control-plane tables must have RLS enabled'; END IF;

  IF has_function_privilege('public','comind_pm.governance_preflight(text,jsonb,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute governance preflight';
  END IF;
END $$;

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'),
cls AS (SELECT id,classification_key FROM comind_pm.pm_data_classification_levels WHERE project_id=(SELECT id FROM p)),
res AS (SELECT id FROM comind_pm.pm_residency_profiles WHERE project_id=(SELECT id FROM p) AND profile_key='COMIND-TEST-US'),
ret AS (SELECT id FROM comind_pm.pm_retention_profiles WHERE project_id=(SELECT id FROM p) AND profile_key='OPERATIONAL')
INSERT INTO comind_pm.pm_data_asset_governance(project_id,asset_key,asset_type,classification_id,residency_profile_id,retention_profile_id,tenant_key,project_scope_key,allowed_purposes,metadata)
SELECT p.id,v.asset_key,'verification',cls.id,res.id,ret.id,'tenant-alpha','COMIND',ARRAY['governance-test'],'{"synthetic":true}'::jsonb
FROM p CROSS JOIN res CROSS JOIN ret JOIN (VALUES ('VERIFY-INTERNAL','INTERNAL'),('VERIFY-RESTRICTED','RESTRICTED'),('VERIFY-CONFIDENTIAL','CONFIDENTIAL')) v(asset_key,class_key) ON true JOIN cls ON cls.classification_key=v.class_key;

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_crypto_key_registry(project_id,key_key,provider,secret_ref,purpose,environment,algorithm_family,status,rotate_by,owner,metadata)
SELECT p.id,v.* FROM p CROSS JOIN (VALUES
 ('VERIFY-KEY-ACTIVE','Vault','vault://verify/key-active','governance-test','test','provider-managed','active',now()+interval '30 days','Verification','{"synthetic":true}'::jsonb),
 ('VERIFY-KEY-REVOKED','Vault','vault://verify/key-revoked','governance-test','test','provider-managed','revoked',now()+interval '30 days','Verification','{"synthetic":true}'::jsonb)
) v(key_key,provider,secret_ref,purpose,environment,algorithm_family,status,rotate_by,owner,metadata);

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_compliance_obligations(project_id,obligation_key,framework,version,jurisdiction,product_scope,applicability,satisfaction_state,rationale,owner,metadata)
SELECT p.id,'VERIFY-AIMS','ISO/IEC 42001','2023','verification','verification','conditional','planned','Rollback-only verification record.','Verification','{"synthetic":true}'::jsonb FROM p;

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'), c AS (SELECT f.id FROM comind_pm.pm_governance_control_families f,p WHERE f.project_id=p.id AND f.control_key='DRULE-C24')
INSERT INTO comind_pm.pm_governance_assessments(project_id,control_id,assessment_key,assessment_type,status,summary,verifier,verifier_independence,metadata)
SELECT p.id,c.id,'VERIFY-FAIRNESS-PASS','fairness','pass','Rollback-only scoped impact verification.','Verification','self_review','{"synthetic":true,"limitations":"verification only"}'::jsonb FROM p,c;

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'), c AS (SELECT f.id FROM comind_pm.pm_governance_control_families f,p WHERE f.project_id=p.id AND f.control_key='DRULE-C15')
INSERT INTO comind_pm.pm_governance_exceptions(project_id,control_id,exception_key,exception_type,status,scope,reason,authority_basis,approved_by,approved_at,valid_from,expires_at,post_review_due_at)
SELECT p.id,c.id,'VERIFY-BREAKGLASS','break_glass','approved','{"resource":"verification-resource","action":"read"}'::jsonb,'Rollback-only verification.','Verification authority.','Verifier',now(),now()-interval '1 minute',now()+interval '30 minutes',now()+interval '1 day' FROM p,c;

DO $$
DECLARE
  v_failures integer;
  v_sensitive_blocked boolean := false;
BEGIN
  WITH cases(label,control_key,ctx,expected) AS (VALUES
    ('C03 allow','DRULE-C03','{"classification_key":"INTERNAL","purpose":"governance-test"}'::jsonb,'allow'),
    ('C03 deny','DRULE-C03','{"classification_key":"UNKNOWN","purpose":"governance-test"}'::jsonb,'deny'),
    ('C04 allow','DRULE-C04','{"key_key":"VERIFY-KEY-ACTIVE"}'::jsonb,'allow'),
    ('C04 deny','DRULE-C04','{"key_key":"VERIFY-KEY-REVOKED"}'::jsonb,'deny'),
    ('C06 allow','DRULE-C06','{"asset_key":"VERIFY-INTERNAL","actor_clearance_key":"INTERNAL","tenant_key":"tenant-alpha","project_scope_key":"COMIND","purpose":"governance-test"}'::jsonb,'allow'),
    ('C06 deny','DRULE-C06','{"asset_key":"VERIFY-INTERNAL","actor_clearance_key":"PUBLIC","tenant_key":"tenant-alpha","project_scope_key":"COMIND","purpose":"governance-test"}'::jsonb,'deny'),
    ('C07 allow','DRULE-C07','{"asset_key":"VERIFY-INTERNAL","action":"soft_delete","disposition_authorized":true}'::jsonb,'allow'),
    ('C07 deny','DRULE-C07','{"asset_key":"VERIFY-INTERNAL","action":"hard_delete","disposition_authorized":true}'::jsonb,'deny'),
    ('C10 allow','DRULE-C10','{"obligation_key":"VERIFY-AIMS","action":"internal_review"}'::jsonb,'allow'),
    ('C10 deny','DRULE-C10','{"obligation_key":"VERIFY-AIMS","action":"external_claim"}'::jsonb,'deny'),
    ('C11 allow','DRULE-C11','{"untrusted_input":true,"asks_for_secrets":false,"authority_escalation":false,"side_effect":false}'::jsonb,'allow'),
    ('C11 deny','DRULE-C11','{"untrusted_input":true,"asks_for_secrets":true,"authority_escalation":false,"side_effect":false}'::jsonb,'deny'),
    ('C13 allow','DRULE-C13','{"asset_key":"VERIFY-INTERNAL","destination_key":"SUPABASE-TEST","region":"us-east-1","tenant_key":"tenant-alpha","purpose":"governance-test"}'::jsonb,'allow'),
    ('C13 deny','DRULE-C13','{"asset_key":"VERIFY-INTERNAL","destination_key":"UNREGISTERED","region":"us-east-1","tenant_key":"tenant-alpha","purpose":"governance-test"}'::jsonb,'deny'),
    ('C15 allow','DRULE-C15','{"exception_key":"VERIFY-BREAKGLASS","resource":"verification-resource","action":"read"}'::jsonb,'allow'),
    ('C15 deny','DRULE-C15','{"exception_key":"VERIFY-BREAKGLASS","resource":"other-resource","action":"read"}'::jsonb,'deny'),
    ('C17 allow','DRULE-C17','{"source_tenant":"tenant-alpha","target_tenant":"tenant-alpha","source_project":"COMIND","target_project":"COMIND","action":"read"}'::jsonb,'allow'),
    ('C17 deny','DRULE-C17','{"source_tenant":"tenant-alpha","target_tenant":"tenant-beta","source_project":"COMIND","target_project":"COMIND","action":"read"}'::jsonb,'deny'),
    ('C17 context deny','DRULE-C17','{"source_project":"COMIND","target_project":"COMIND","action":"read"}'::jsonb,'deny'),
    ('C19 allow','DRULE-C19','{"asset_key":"VERIFY-INTERNAL","region":"us-east-1","cross_jurisdiction":false}'::jsonb,'allow'),
    ('C19 deny','DRULE-C19','{"asset_key":"VERIFY-INTERNAL","region":"eu-west-1","cross_jurisdiction":false}'::jsonb,'deny'),
    ('C24 allow','DRULE-C24','{"high_consequence":true,"assessment_key":"VERIFY-FAIRNESS-PASS","human_oversight":true}'::jsonb,'allow'),
    ('C24 review','DRULE-C24','{"high_consequence":true,"assessment_key":"MISSING","human_oversight":true}'::jsonb,'review'),
    ('C27 allow','DRULE-C27','{"asset_key":"VERIFY-CONFIDENTIAL","log_mode":"metadata","durable":true}'::jsonb,'allow'),
    ('C27 deny','DRULE-C27','{"asset_key":"VERIFY-RESTRICTED","log_mode":"payload","durable":true}'::jsonb,'deny')
  ), results AS (
    SELECT label,expected,comind_pm.governance_preflight(control_key,ctx,false)->>'decision' actual FROM cases
  )
  SELECT count(*) INTO v_failures FROM results WHERE actual<>expected;
  IF v_failures<>0 THEN RAISE EXCEPTION 'Governance preflight matrix has % failure(s)',v_failures; END IF;

  BEGIN
    PERFORM comind_pm.governance_preflight('DRULE-C11','{"nested":{"prompt":"prohibited"}}'::jsonb,false);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%prohibited raw-sensitive field%' THEN v_sensitive_blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_sensitive_blocked THEN RAISE EXCEPTION 'Raw-sensitive governance context was not rejected'; END IF;
END $$;

ROLLBACK;
