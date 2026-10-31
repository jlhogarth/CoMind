BEGIN;

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND'),
controls(control_key,section_no,family_name,source_state,failure_mode,standard_refs,notes) AS (
 VALUES
 ('DRULE-C03',3,'Data Classification & Tagging','modern_governance_gap','deny','["NIST SP 800-60 Rev. 2 draft","NIST SP 800-53 Rev. 5"]'::jsonb,'Canonical classification drives handling, access, retention, logging, transfer and enforcement.'),
 ('DRULE-C04',4,'Secrets, Keys & Cryptography','modern_coverage_partial','deny','["NIST SP 800-57 Part 1 Rev. 5"]'::jsonb,'Metadata-only key lifecycle registry; secret material is never stored here.'),
 ('DRULE-C06',6,'Memory Retrieval','modern_coverage_partial','deny','["NIST SP 800-53 AC family"]'::jsonb,'Cross-system retrieval authorization based on authority, purpose, scope and data classification.'),
 ('DRULE-C07',7,'Episodic Edit & Selective Forget','modern_coverage_partial','deny','["NIST Privacy Framework 1.0"]'::jsonb,'Disposition must respect retention, evidence hold, legal hold, and explicit authority.'),
 ('DRULE-C10',10,'Compliance Applicability','modern_coverage_partial','review','["ISO/IEC 42001:2023","ISO/IEC 23894:2023","NIST AI RMF 1.0"]'::jsonb,'Applicability register separates framework relevance from claims of conformity or certification.'),
 ('DRULE-C11',11,'Prompt Injection & Exfiltration','modern_coverage_partial','deny','["OWASP LLM Top 10 2025","OWASP Agentic Top 10 2026","NIST AI 600-1"]'::jsonb,'Structured trust-boundary preflight rejects secret requests, authority escalation, and unsafe side effects.'),
 ('DRULE-C13',13,'Network & Egress Control','modern_governance_gap','deny','["NIST SP 800-207","NIST SP 800-207A","NIST SP 800-53 AC-4"]'::jsonb,'Deny-by-default destination registry ties egress to classification, region, tenant and purpose.'),
 ('DRULE-C15',15,'Break-Glass & Overrides','modern_coverage_partial','deny','["NIST SP 800-53 AC-2","NIST SP 800-53 AC-3(10)"]'::jsonb,'Emergency authority is scoped, time-bounded, evidenced, revocable and post-reviewed.'),
 ('DRULE-C17',17,'Multi-Tenancy & Isolation','modern_governance_gap','deny','["NIST SP 800-207A","Supabase RLS guidance"]'::jsonb,'Tenant and project scope is deny-by-default; cross-scope access requires explicit governed authority.'),
 ('DRULE-C19',19,'Export, Portability & Data Residency','modern_coverage_partial','review','["NIST Privacy Framework 1.0"]'::jsonb,'Residency profiles make permitted regions and cross-jurisdiction transfer basis explicit.'),
 ('DRULE-C24',24,'Fairness, Bias & Sensitive Use','modern_coverage_partial','review','["NIST AI RMF 1.0","NIST AI 600-1"]'::jsonb,'High-consequence use requires impact assessment, human oversight and evidence before operation.'),
 ('DRULE-C27',27,'Research, Logging & Privacy','modern_coverage_partial','deny','["NIST Privacy Framework 1.0","NIST SP 800-53 Rev. 5"]'::jsonb,'Logging is classification-aware and minimizes payload capture; retention and deletion are governed.')
)
INSERT INTO comind_pm.pm_governance_control_families(project_id,control_key,layer0_section,family_name,source_coverage_state,remediation_state,health_state,authority_owner,failure_mode,standard_refs,notes)
SELECT p.id,c.control_key,c.section_no,c.family_name,c.source_state,'implemented_test','warning','CoMind Governance',c.failure_mode,c.standard_refs,c.notes FROM p CROSS JOIN controls c
ON CONFLICT(project_id,control_key) DO UPDATE SET layer0_section=excluded.layer0_section,family_name=excluded.family_name,source_coverage_state=excluded.source_coverage_state,remediation_state='implemented_test',authority_owner=excluded.authority_owner,failure_mode=excluded.failure_mode,standard_refs=excluded.standard_refs,notes=excluded.notes,updated_at=now();

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_data_classification_levels(project_id,classification_key,display_name,classification_rank,external_transfer_default,payload_logging_default,requires_encryption,requires_purpose,metadata)
SELECT p.id,v.* FROM p CROSS JOIN (VALUES
 ('PUBLIC','Public',0,'allow','allow',false,false,'{"meaning":"approved for public release; no statutory meaning implied"}'::jsonb),
 ('INTERNAL','Internal',10,'review','metadata_only',true,true,'{"meaning":"routine internal CoMind information"}'::jsonb),
 ('CONFIDENTIAL','Confidential',20,'review','metadata_only',true,true,'{"meaning":"sensitive business or personal information requiring controlled access"}'::jsonb),
 ('RESTRICTED','Restricted',30,'deny','deny',true,true,'{"meaning":"high-impact information with tightly bounded handling"}'::jsonb),
 ('SECRET','Secret',40,'deny','deny',true,true,'{"meaning":"highest CoMind handling class; includes secret-classified proprietary material"}'::jsonb)
) v(classification_key,display_name,classification_rank,external_transfer_default,payload_logging_default,requires_encryption,requires_purpose,metadata)
ON CONFLICT(project_id,classification_key) DO UPDATE SET display_name=excluded.display_name,classification_rank=excluded.classification_rank,external_transfer_default=excluded.external_transfer_default,payload_logging_default=excluded.payload_logging_default,requires_encryption=excluded.requires_encryption,requires_purpose=excluded.requires_purpose,metadata=excluded.metadata,updated_at=now();

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_residency_profiles(project_id,profile_key,display_name,allowed_regions,allowed_country_codes,cross_jurisdiction_mode,transfer_basis_required,metadata)
SELECT p.id,'COMIND-TEST-US','CoMind Test US',ARRAY['us-east-1'],ARRAY['US'],'review',true,'{"environment":"test","basis":"CoMind Test Supabase region; not a legal residency determination"}'::jsonb FROM p
ON CONFLICT(project_id,profile_key) DO UPDATE SET allowed_regions=excluded.allowed_regions,allowed_country_codes=excluded.allowed_country_codes,cross_jurisdiction_mode=excluded.cross_jurisdiction_mode,transfer_basis_required=excluded.transfer_basis_required,metadata=excluded.metadata,updated_at=now();

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_retention_profiles(project_id,profile_key,display_name,minimum_retention_days,maximum_retention_days,disposition_authority_required,hard_delete_allowed,legal_hold_overrides_disposition,evidence_hold_overrides_disposition,metadata)
SELECT p.id,v.* FROM p CROSS JOIN (VALUES
 ('EPHEMERAL','Ephemeral',0,30,true,true,true,true,'{"use":"temporary material only; product and legal requirements can narrow this"}'::jsonb),
 ('OPERATIONAL','Operational',NULL::integer,NULL::integer,true,false,true,true,'{"use":"duration must be assigned by applicable product or legal policy"}'::jsonb),
 ('DURABLE-EVIDENCE','Durable Evidence',NULL::integer,NULL::integer,true,false,true,true,'{"use":"governed evidence; no arbitrary deletion period is asserted"}'::jsonb)
) v(profile_key,display_name,minimum_retention_days,maximum_retention_days,disposition_authority_required,hard_delete_allowed,legal_hold_overrides_disposition,evidence_hold_overrides_disposition,metadata)
ON CONFLICT(project_id,profile_key) DO UPDATE SET display_name=excluded.display_name,minimum_retention_days=excluded.minimum_retention_days,maximum_retention_days=excluded.maximum_retention_days,disposition_authority_required=excluded.disposition_authority_required,hard_delete_allowed=excluded.hard_delete_allowed,legal_hold_overrides_disposition=excluded.legal_hold_overrides_disposition,evidence_hold_overrides_disposition=excluded.evidence_hold_overrides_disposition,metadata=excluded.metadata,updated_at=now();

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_egress_destinations(project_id,destination_key,destination_type,host_pattern,max_classification_rank,allowed_regions,requires_purpose,requires_human_review,metadata)
SELECT p.id,'SUPABASE-TEST','service','sbgfuanxiqepcoboxzcl.supabase.co',40,ARRAY['us-east-1'],true,false,'{"environment":"test","scope":"known CoMind Test Supabase project only"}'::jsonb FROM p
ON CONFLICT(project_id,destination_key) DO UPDATE SET host_pattern=excluded.host_pattern,max_classification_rank=excluded.max_classification_rank,allowed_regions=excluded.allowed_regions,requires_purpose=excluded.requires_purpose,requires_human_review=excluded.requires_human_review,metadata=excluded.metadata,updated_at=now();

WITH p AS (SELECT id FROM comind_pm.pm_projects WHERE project_key='COMIND')
INSERT INTO comind_pm.pm_compliance_obligations(project_id,obligation_key,framework,version,jurisdiction,product_scope,applicability,satisfaction_state,rationale,owner,review_due_at,evidence_refs,metadata)
SELECT p.id,v.* FROM p CROSS JOIN (VALUES
 ('STD-ISO-42001','ISO/IEC 42001','2023','organizational','CoMind AIMS','applicable','implemented','Primary AIMS certification-readiness direction. Implementation evidence exists, but certification or conformity is not claimed.','CoMind Governance',now()+interval '90 days','[]'::jsonb,'{"source":"STANDARDS-APPLICABILITY-REGISTER","claim_boundary":"no certification claim"}'::jsonb),
 ('STD-ISO-23894','ISO/IEC 23894','2023','organizational','AI risk management','applicable','implemented','AI risk-management guidance supporting the AIMS risk process; detailed licensed-source mapping remains separate.','CoMind Governance',now()+interval '90 days','[]'::jsonb,'{"source":"STANDARDS-APPLICABILITY-REGISTER"}'::jsonb),
 ('STD-NIST-AIRMF','NIST AI RMF','1.0','United States voluntary framework','CoMind AI governance','applicable','implemented','Voluntary trustworthy-AI risk framework used as supporting governance guidance; revision surveillance remains required.','CoMind Governance',now()+interval '60 days','[]'::jsonb,'{"source":"STANDARDS-APPLICABILITY-REGISTER","living_revision":true}'::jsonb),
 ('LAW-EU-AI-ACT','EU AI Act','Regulation (EU) 2024/1689','European Union','Future EU-facing CoMind products','conditional','planned','Applicability depends on market, role, use case, system classification and effective dates; no universal applicability is asserted.','CoMind Governance',now()+interval '60 days','[]'::jsonb,'{"claim_boundary":"jurisdiction and use-case analysis required"}'::jsonb),
 ('LAW-HIPAA','HIPAA','current applicability to be assessed','United States','Health-related CoMind products','unassessed','unassessed','Applicability depends on product role, covered-entity or business-associate relationships, data flows and contracts.','CoMind Governance',now()+interval '60 days','[]'::jsonb,'{"claim_boundary":"no HIPAA compliance claim"}'::jsonb),
 ('ASSURANCE-SOC2','SOC 2','current Trust Services Criteria to be assessed','contractual assurance','Commercial CoMind services','unassessed','unassessed','SOC 2 is an assurance framework, not a general legal obligation. Scope and readiness require an explicit management decision.','CoMind Governance',now()+interval '90 days','[]'::jsonb,'{"claim_boundary":"no SOC 2 attestation claim"}'::jsonb)
) v(obligation_key,framework,version,jurisdiction,product_scope,applicability,satisfaction_state,rationale,owner,review_due_at,evidence_refs,metadata)
ON CONFLICT(project_id,obligation_key) DO UPDATE SET framework=excluded.framework,version=excluded.version,jurisdiction=excluded.jurisdiction,product_scope=excluded.product_scope,applicability=excluded.applicability,satisfaction_state=excluded.satisfaction_state,rationale=excluded.rationale,owner=excluded.owner,review_due_at=excluded.review_due_at,metadata=excluded.metadata,updated_at=now();

WITH req(section_no,req_key,req_text,capability,enforcement,verification) AS (VALUES
 (3,'classification-taxonomy','Canonical five-level CoMind handling taxonomy exists and each governed asset can reference one level.','data','register','Verify five unique ordered levels and asset foreign key.'),
 (3,'classification-handling','Classification determines default external transfer, payload logging, encryption and purpose requirements.','policy','preflight','Exercise preflight across classification levels.'),
 (3,'classification-hud','Classification control health is visible in RuleBook HUD without exposing classified payload.','hud','monitor','Verify safe HUD projection contains status only.'),
 (4,'key-registry','Cryptographic key metadata is inventoried without storing key material.','data','register','Verify metadata-only registry and secret-reference indirection.'),
 (4,'key-lifecycle','Compromised, revoked, retired or overdue keys fail preflight.','runtime','hard_deny','Negative test disallowed lifecycle states.'),
 (4,'crypto-review','Algorithm and baseline changes require review and evidence rather than implicit upgrade.','policy','human_review','Verify algorithm metadata and assessment evidence contract.'),
 (6,'retrieval-scope','Retrieval requires matching tenant and project scope unless governed authority exists.','runtime','hard_deny','Negative cross-tenant and cross-project tests.'),
 (6,'retrieval-clearance','Actor clearance must meet or exceed asset classification.','runtime','hard_deny','Negative lower-clearance test.'),
 (6,'retrieval-purpose','Declared asset purposes constrain retrieval purpose.','runtime','hard_deny','Negative unapproved-purpose test.'),
 (7,'hold-precedence','Legal hold and evidence hold block deletion.','runtime','hard_deny','Negative deletion tests under both hold types.'),
 (7,'retention-authority','Disposition requires retention semantics and explicit authority.','policy','preflight','Verify missing authority returns review or deny.'),
 (7,'hard-delete-boundary','Hard deletion requires a profile that permits it or separately governed authority.','runtime','hard_deny','Negative hard-delete test on durable evidence.'),
 (10,'applicability-register','Framework, version, jurisdiction, product scope and rationale are separately recorded.','data','register','Verify controlled obligation entries.'),
 (10,'claim-control','External conformity or certification claims require verified applicable evidence.','runtime','hard_deny','Negative unsupported-claim test.'),
 (10,'version-review','Living or revised standards create review obligations rather than silently changing acceptance.','automation','monitor','Verify review-due health signal.'),
 (11,'trust-boundary-input','Untrusted input requesting secrets or authority escalation fails closed.','runtime','hard_deny','Negative structured threat tests.'),
 (11,'side-effect-review','Untrusted requests for consequential tool side effects require explicit review.','runtime','human_review','Verify review decision for side-effect context.'),
 (11,'no-raw-prompt-log','Governance evidence stores structured context, not raw prompts or secrets.','evidence','hard_deny','Verify forbidden context-key rejection.'),
 (13,'destination-registry','Outbound destinations are deny-by-default and must be explicitly registered.','data','hard_deny','Negative unknown-destination test.'),
 (13,'classification-egress','Asset classification cannot exceed destination maximum classification.','runtime','hard_deny','Negative high-classification egress test.'),
 (13,'egress-purpose-region','Destination purpose and region restrictions are enforced.','runtime','hard_deny','Negative missing-purpose and wrong-region tests.'),
 (15,'bounded-exception','Break-glass authority has scope, reason, authority basis, approver and mandatory expiry.','data','register','Verify approved exception cannot omit expiry or approver.'),
 (15,'exception-expiry','Expired emergency authority cannot authorize runtime access.','runtime','hard_deny','Negative expired-exception test.'),
 (15,'post-review','Emergency use requires retained evidence and post-event review due date.','evidence','human_review','Verify post-review fields and health warning.'),
 (17,'tenant-default-deny','Cross-tenant and cross-project operations are denied by default.','runtime','hard_deny','Negative cross-scope tests.'),
 (17,'service-exception','Cross-scope service access requires explicit active scoped authority.','runtime','hard_deny','Verify scoped authority cannot authorize unrelated tenant or action.'),
 (17,'isolation-evidence','Isolation negative-test evidence is tracked as control assessment.','evidence','monitor','Verify assessment record and HUD state.'),
 (19,'residency-profile','Assets can reference explicit allowed regions, countries and transfer mode.','data','register','Verify Test profile is scoped to us-east-1 and US.'),
 (19,'region-enforcement','Operation region must satisfy asset residency profile.','runtime','hard_deny','Negative wrong-region test.'),
 (19,'transfer-basis','Cross-jurisdiction transfer requiring a basis cannot proceed without one.','runtime','human_review','Verify missing transfer basis produces review.'),
 (24,'impact-assessment','High-consequence use requires a scoped impact assessment.','data','human_review','Negative request without passing assessment.'),
 (24,'human-oversight','High-consequence consequential action requires explicit human oversight.','runtime','human_review','Negative missing-human-oversight test.'),
 (24,'fairness-evidence','Fairness and bias evidence records scope and limitations without asserting universal fairness.','evidence','monitor','Verify assessment metadata supports scope and limitations.'),
 (27,'logging-minimization','Confidential or higher payload logging is denied or reviewed by classification; metadata-only evidence is preferred.','runtime','hard_deny','Negative payload-logging tests.'),
 (27,'privacy-retention','Governed durable logging requires retention and disposition semantics.','policy','preflight','Verify missing retention profile is rejected.'),
 (27,'privacy-hud','HUD exposes health and status only, never raw sensitive payload or secret references.','hud','monitor','Verify projection columns and privileges.')
), c AS (SELECT f.id,f.layer0_section FROM comind_pm.pm_governance_control_families f JOIN comind_pm.pm_projects p ON p.id=f.project_id WHERE p.project_key='COMIND')
INSERT INTO comind_pm.pm_governance_control_requirements(control_id,requirement_key,requirement_text,capability_type,enforcement_mode,status,verification_method)
SELECT c.id,r.req_key,r.req_text,r.capability,r.enforcement,'implemented',r.verification FROM req r JOIN c ON c.layer0_section=r.section_no
ON CONFLICT(control_id,requirement_key) DO UPDATE SET requirement_text=excluded.requirement_text,capability_type=excluded.capability_type,enforcement_mode=excluded.enforcement_mode,verification_method=excluded.verification_method,updated_at=now();

COMMIT;
