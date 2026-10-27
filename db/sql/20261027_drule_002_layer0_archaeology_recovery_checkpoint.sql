begin;

-- DRULE-002 Layer-0 archaeology recovery checkpoint, 2026-10-27.
-- Idempotent data-state parity for the reviewed recovery sweep.
-- Stable project/source/rule keys only. No generated UUID is hard-coded.
-- Archaeology completion is distinct from rule activation or reconciliation closure.

with project as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), source_document as (
  select d.id
  from comind_pm.pm_rule_source_documents d
  join project p on p.id = d.project_id
  where d.source_system = 'gdrive'
    and d.source_ref = 'https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view'
)
update comind_pm.pm_rule_source_documents d
set ingestion_status = 'reviewed',
    retrieval_completeness = 'partial',
    notes = 'Canonical August 30, 2025 Layer-0 v2 artifact reviewed. Complete 32-section taxonomy is present. Substantive original clause text survives for sections 29-32 only. Sections 1-28 remain explicit source-recovery gaps after Google Drive content search, Drive revision-history review, and independent ChatGPT Library search on 2026-10-27. Successor doctrine may support reconciliation but must not be represented as recovered verbatim Layer-0 text.',
    reviewed_at = now(),
    metadata = d.metadata || jsonb_build_object(
      'recovery_sweep_2026_10_27', jsonb_build_object(
        'drive_revision_count', 1,
        'alternate_rulebook_source_found', false,
        'sections_missing_original_clause_text',
          jsonb_build_array(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28),
        'sections_with_surviving_original_clause_text', jsonb_build_array(29,30,31,32),
        'reviewed_at', now()
      )
    )
from source_document s
where d.id = s.id;

with project as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), source_document as (
  select d.id
  from comind_pm.pm_rule_source_documents d
  join project p on p.id = d.project_id
  where d.source_system = 'gdrive'
    and d.source_ref = 'https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view'
)
update comind_pm.pm_rule_archaeology_queue q
set archaeology_status = 'in_progress',
    completed_at = null,
    metadata = q.metadata || jsonb_build_object(
      'recovery_sweep_2026_10_27', jsonb_build_object(
        'surfaces', jsonb_build_array(
          'google_drive_content_search',
          'google_drive_revision_history',
          'chatgpt_library_semantic_search'
        ),
        'result', 'no_alternate_complete_layer0_source_recovered',
        'source_text_status', 'original_clause_text_missing',
        'successor_evidence_treatment', 'reconciliation_only_not_verbatim_recovery',
        'reviewed_at', now()
      )
    )
from source_document s
where q.source_document_id = s.id
  and q.section_number between 1 and 28;

with project as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), standards_case as (
  insert into comind_pm.pm_rule_reconciliation_cases (
    project_id,
    case_key,
    case_type,
    title,
    status,
    severity,
    problem_statement,
    resolution_criteria,
    authority_owner,
    opened_by,
    evidence_refs,
    metadata
  )
  select
    p.id,
    'RC-L0-INT-001',
    'activation_review',
    'Reconcile historical Layer-0 interoperability and standards references',
    'open',
    'normal',
    'Historical Layer-0 Section 30 groups NIST AI RMF, an ISO/IEC AI RMF label, GAIA-X portability, EU AI Act cross-mapping, CSA audit recommendations, SKOS/OWL tagging, and placeholders. Current authoritative review confirms NIST owns AI RMF, ISO/IEC 42001 is the AI management-system standard, ISO/IEC 23894 provides AI risk-management guidance, and Regulation (EU) 2024/1689 is in force with version-sensitive application dates.',
    'Replace dated or malformed labels with versioned source-linked mappings; separate voluntary frameworks, management-system standards, legal obligations, interoperability specifications, and placeholders; activate only mappings applicable to CoMind scope and jurisdiction.',
    'CoMind Governance',
    'DRULE-002 archaeology',
    jsonb_build_array(
      jsonb_build_object('rule_key','RULE-HIST-L0-INT-001'),
      jsonb_build_object('source','NIST AI RMF','url','https://www.nist.gov/itl/ai-risk-management-framework'),
      jsonb_build_object('source','ISO/IEC 42001','url','https://www.iso.org/standard/81230.html'),
      jsonb_build_object('source','ISO/IEC 23894:2023','url','https://www.iso.org/standard/77304.html'),
      jsonb_build_object('source','EU AI Act','url','https://eur-lex.europa.eu/eli/reg/2024/1689/oj')
    ),
    jsonb_build_object(
      'layer0_section', 30,
      'archaeology_separate_from_activation', true,
      'external_review_date', '2026-10-27'
    )
  from project p
  on conflict (project_id, case_key) do update set
    problem_statement = excluded.problem_statement,
    resolution_criteria = excluded.resolution_criteria,
    evidence_refs = excluded.evidence_refs,
    metadata = comind_pm.pm_rule_reconciliation_cases.metadata || excluded.metadata,
    updated_at = now()
  returning id, project_id
)
insert into comind_pm.pm_rule_reconciliation_members (
  case_id,
  rule_id,
  role,
  position,
  metadata
)
select
  c.id,
  r.id,
  'historical_subject',
  'Historical Section 30 aggregate standards candidate',
  '{}'::jsonb
from standards_case c
join comind_pm.pm_rules r
  on r.project_id = c.project_id
 and r.rule_key = 'RULE-HIST-L0-INT-001'
on conflict do nothing;

with project as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), forward_case as (
  insert into comind_pm.pm_rule_reconciliation_cases (
    project_id,
    case_key,
    case_type,
    title,
    status,
    severity,
    problem_statement,
    resolution_criteria,
    authority_owner,
    opened_by,
    evidence_refs,
    metadata
  )
  select
    p.id,
    'RC-L0-FWD-001',
    'activation_review',
    'Reconcile historical Layer-0 forward controls with current governance',
    'open',
    'normal',
    'Historical Layer-0 Section 32 contains quarterly adversarial probes, a high-risk purpose-of-use ledger, Future Continuity migration persistence, sandbox promotion checks, and explicit deferred future-control fields for quantum-resistant cryptography and cross-jurisdiction treaty compliance.',
    'Map each non-placeholder historical control to current canonical governance, testing, continuity, purpose, and promotion mechanisms; retain genuinely useful predecessor intent; do not activate placeholder controls without a separately approved current rule and evidence.',
    'CoMind Governance',
    'DRULE-002 archaeology',
    jsonb_build_array(
      jsonb_build_object('rule_key','RULE-HIST-L0-FWD-001'),
      jsonb_build_object('rule_key','RULE-HIST-L0-FWD-002'),
      jsonb_build_object('rule_key','RULE-HIST-L0-FWD-003'),
      jsonb_build_object('rule_key','RULE-HIST-L0-FWD-004')
    ),
    jsonb_build_object(
      'layer0_section', 32,
      'archaeology_separate_from_activation', true,
      'placeholder_controls_not_approved', true
    )
  from project p
  on conflict (project_id, case_key) do update set
    problem_statement = excluded.problem_statement,
    resolution_criteria = excluded.resolution_criteria,
    evidence_refs = excluded.evidence_refs,
    metadata = comind_pm.pm_rule_reconciliation_cases.metadata || excluded.metadata,
    updated_at = now()
  returning id, project_id
)
insert into comind_pm.pm_rule_reconciliation_members (
  case_id,
  rule_id,
  role,
  position,
  metadata
)
select
  c.id,
  r.id,
  'historical_subject',
  'Historical Section 32 forward-control candidate',
  '{}'::jsonb
from forward_case c
join comind_pm.pm_rules r
  on r.project_id = c.project_id
 and r.rule_key in (
   'RULE-HIST-L0-FWD-001',
   'RULE-HIST-L0-FWD-002',
   'RULE-HIST-L0-FWD-003',
   'RULE-HIST-L0-FWD-004'
 )
on conflict do nothing;

with project as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), source_document as (
  select d.id
  from comind_pm.pm_rule_source_documents d
  join project p on p.id = d.project_id
  where d.source_system = 'gdrive'
    and d.source_ref = 'https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view'
)
update comind_pm.pm_rule_archaeology_queue q
set archaeology_status = 'complete',
    completed_at = coalesce(q.completed_at, now()),
    metadata = q.metadata || case q.section_number
      when 29 then jsonb_build_object(
        'archaeology_disposition', 'original_text_recovered_and_preserved_as_historical_candidates',
        'policy_reconciliation_state', 'open',
        'reconciliation_cases', jsonb_build_array('RC-L0-SLA-001'),
        'historical_rule_keys', jsonb_build_array(
          'RULE-HIST-L0-SLA-001',
          'RULE-HIST-L0-SLA-002',
          'RULE-HIST-L0-SLA-003',
          'RULE-HIST-L0-SLA-004',
          'RULE-HIST-L0-SLA-005'
        ),
        'candidate_keys', jsonb_build_array('CAND-L0-SLA-PAD-001'),
        'completion_semantics', 'archaeology_complete_does_not_imply_activation'
      )
      when 30 then jsonb_build_object(
        'archaeology_disposition', 'original_text_recovered_and_preserved_as_historical_standards_candidate',
        'policy_reconciliation_state', 'open',
        'reconciliation_cases', jsonb_build_array('RC-L0-INT-001'),
        'historical_rule_keys', jsonb_build_array('RULE-HIST-L0-INT-001'),
        'completion_semantics', 'archaeology_complete_does_not_imply_current_compliance_or_activation'
      )
      when 31 then jsonb_build_object(
        'archaeology_disposition', 'original_text_recovered_and_preserved_as_historical_cost_candidates',
        'policy_reconciliation_state', 'open',
        'reconciliation_cases', jsonb_build_array('RC-L0-COST-001','RC-L0-COSTLINE-001'),
        'historical_rule_keys', jsonb_build_array(
          'RULE-HIST-L0-COST-001',
          'RULE-HIST-L0-COST-002',
          'RULE-HIST-L0-COST-003'
        ),
        'candidate_keys', jsonb_build_array('CAND-L0-COST-LINEITEM-001'),
        'placeholder_treatment', 'Deferred historical monetary budgets are not approved controls',
        'completion_semantics', 'archaeology_complete_does_not_imply_activation'
      )
      when 32 then jsonb_build_object(
        'archaeology_disposition', 'original_text_recovered_and_preserved_as_historical_forward_controls',
        'policy_reconciliation_state', 'open',
        'reconciliation_cases', jsonb_build_array('RC-L0-FWD-001'),
        'historical_rule_keys', jsonb_build_array(
          'RULE-HIST-L0-FWD-001',
          'RULE-HIST-L0-FWD-002',
          'RULE-HIST-L0-FWD-003',
          'RULE-HIST-L0-FWD-004'
        ),
        'placeholder_treatment', 'Deferred historical quantum-resistant cryptography and treaty-compliance fields are not approved controls',
        'completion_semantics', 'archaeology_complete_does_not_imply_activation'
      )
    end
from source_document s
where q.source_document_id = s.id
  and q.section_number between 29 and 32;

commit;
