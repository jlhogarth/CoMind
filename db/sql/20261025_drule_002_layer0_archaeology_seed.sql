begin;

-- DRULE-002 initial Layer-0 archaeology seed.
-- Stable project/source keys only. No generated UUID is hard-coded.

with project as (
  select id from comind_pm.pm_projects where project_key = 'COMIND'
), seed(source_system,source_ref,title,source_class,authority_status,source_date,version_label,ingestion_status,retrieval_completeness,notes,metadata) as (
  values
  ('gdrive','https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view','CoMind Layer-0 Rulebook v2','drive_document','historical','2025-08-30'::timestamptz,'v2','partial','partial','Recovered artifact exposes the complete 32-domain taxonomy and substantive clauses for sections 29-32. Sections 1-28 remain source-recovery gaps.','{"source_family":"layer0"}'::jsonb),
  ('chat','chat:2025-08-30T21:59:30Z','Layer-0 governance expansion approval conversation','conversation','approved','2025-08-30T21:59:30Z'::timestamptz,null,'reviewed','partial','Founder approved adding SLA, interoperability and cost/resource governance, applying 40 percent timing padding to SLAs, retaining line-item cost controls while exact monetary values remained deferred, and navigable PDF structure.','{"source_family":"layer0","approval_evidence":true}'::jsonb),
  ('chat','chat:2025-08-30T22:01:27Z','Layer-0 top-shelf expansion approval','conversation','approved','2025-08-30T22:01:27Z'::timestamptz,null,'reviewed','partial','Founder accepted adding missing top-shelf and forward-looking controls while deferring exact budget numbers.','{"source_family":"layer0","approval_evidence":true}'::jsonb)
)
insert into comind_pm.pm_rule_source_documents(
  project_id,source_system,source_ref,title,source_class,authority_status,source_date,
  version_label,ingestion_status,retrieval_completeness,notes,metadata
)
select project.id,s.* from project cross join seed s
on conflict (project_id,source_system,source_ref) do update set
  title=excluded.title,
  source_class=excluded.source_class,
  authority_status=excluded.authority_status,
  source_date=excluded.source_date,
  version_label=excluded.version_label,
  ingestion_status=excluded.ingestion_status,
  retrieval_completeness=excluded.retrieval_completeness,
  notes=excluded.notes,
  metadata=comind_pm.pm_rule_source_documents.metadata || excluded.metadata,
  updated_at=now();

with project as (
  select id from comind_pm.pm_projects where project_key = 'COMIND'
), source_document as (
  select d.id
  from comind_pm.pm_rule_source_documents d
  join project p on p.id=d.project_id
  where d.source_system='gdrive'
    and d.source_ref='https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view'
), q(section_number,section_title,archaeology_status,priority,expected_rule_family,gap_statement) as (
values
(1,'Constitutional & Priority','open',1,'constitutional governance','Full clause text not recovered from current artifact.'),
(2,'Identity, Roles & Access Control','open',1,'identity and access','Full clause text not recovered from current artifact.'),
(3,'Data Classification & Tagging','open',1,'data governance','Full clause text not recovered from current artifact.'),
(4,'Secrets, Keys & Cryptography','open',1,'security','Full clause text not recovered from current artifact.'),
(5,'Memory Write (Consolidation)','open',1,'memory governance','Full clause text not recovered from current artifact.'),
(6,'Memory Retrieval','open',1,'memory governance','Full clause text not recovered from current artifact.'),
(7,'Episodic Edit & Selective Forget','open',1,'memory governance','Full clause text not recovered from current artifact.'),
(8,'Contradiction & Conflict Resolution','open',1,'epistemic governance','Full clause text not recovered from current artifact.'),
(9,'Provenance & Truth Scoring','open',1,'provenance and epistemics','Full clause text not recovered from current artifact.'),
(10,'Compliance (HIPAA, SOC2, etc.)','open',2,'compliance','Full clause text not recovered from current artifact; historical framework names require modern applicability review.'),
(11,'Safety: Prompt Injection & Exfiltration','open',1,'security','Full clause text not recovered from current artifact.'),
(12,'Agent Orchestration & Tool Use','open',1,'agent governance','Full clause text not recovered from current artifact.'),
(13,'Network & Egress Control','open',1,'security','Full clause text not recovered from current artifact.'),
(14,'Storage, Backups & Recovery','open',1,'continuity and recovery','Full clause text not recovered from current artifact.'),
(15,'Break-Glass & Overrides','open',1,'authority','Full clause text not recovered from current artifact.'),
(16,'Versioning, Change-Control & Testing','open',1,'change governance','Full clause text not recovered from current artifact.'),
(17,'Multi-Tenancy & Isolation','open',1,'security and tenancy','Full clause text not recovered from current artifact.'),
(18,'Telemetry, Metrics & Alerts','open',2,'observability','Full clause text not recovered from current artifact.'),
(19,'Export, Portability & Data Residency','open',1,'continuity and data governance','Full clause text not recovered from current artifact.'),
(20,'IP, Licensing & Third-Party Code','open',1,'legal and IP','Full clause text not recovered from current artifact.'),
(21,'Supply Chain & Dependency Security','open',1,'security and dependency governance','Full clause text not recovered from current artifact.'),
(22,'Reasoning Governance (SEAL, SOAP, CRIS, Causal)','open',1,'reasoning governance','Full clause text not recovered from current artifact.'),
(23,'Temporal & Identity Consistency','open',1,'continuity and identity','Full clause text not recovered from current artifact.'),
(24,'Fairness, Bias & Sensitive Use','open',2,'fairness and sensitive use','Full clause text not recovered from current artifact.'),
(25,'Error Handling, Rate Limits & Resilience','open',1,'resilience','Full clause text not recovered from current artifact.'),
(26,'Content Controls & Misinformation Defense','open',1,'epistemic and content governance','Full clause text not recovered from current artifact.'),
(27,'Research, Logging & Privacy','open',1,'research and privacy','Full clause text not recovered from current artifact.'),
(28,'Governance, Ownership & Accountability','open',1,'governance','Full clause text not recovered from current artifact.'),
(29,'Service Level Agreements (SLAs)','partial',2,'service levels','Surviving clauses extracted; historical numeric targets require reconciliation against current measured baselines and service commitments.'),
(30,'Interoperability & Standards','partial',2,'standards','Surviving clauses include placeholders and dated terminology; authoritative-source and applicability reconciliation required.'),
(31,'Cost & Resource Governance','partial',1,'cost governance','Surviving clauses extracted; reconcile with current FinOps Resource Governor.'),
(32,'Emerging/Forward Controls','partial',2,'forward controls','Surviving clauses extracted; reconcile current, superseded, and aspirational controls.')
)
insert into comind_pm.pm_rule_archaeology_queue(
  project_id,queue_key,source_document_id,section_number,section_title,archaeology_status,
  priority,expected_rule_family,gap_statement,assigned_to,metadata
)
select p.id,'L0-'||lpad(q.section_number::text,2,'0'),d.id,q.section_number,q.section_title,
       q.archaeology_status,q.priority,q.expected_rule_family,q.gap_statement,'DRULE-002',
       jsonb_build_object('source_generation','Layer-0 v2','source_date','2025-08-30')
from project p cross join source_document d cross join q
on conflict (project_id,queue_key) do update set
  source_document_id=excluded.source_document_id,
  section_number=excluded.section_number,
  section_title=excluded.section_title,
  archaeology_status=excluded.archaeology_status,
  priority=excluded.priority,
  expected_rule_family=excluded.expected_rule_family,
  gap_statement=excluded.gap_statement,
  assigned_to=excluded.assigned_to,
  metadata=comind_pm.pm_rule_archaeology_queue.metadata || excluded.metadata,
  updated_at=now();

with project as (
  select id from comind_pm.pm_projects where project_key='COMIND'
), candidates(candidate_key,source_ref,source_excerpt,normalized_statement,proposed_title,proposed_domain,proposed_rule_type,proposed_modality,status,review_notes,metadata) as (
values
('CAND-L0-CONST-001','https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view','Layer-0 rules are described as constitutional, non-negotiable constraints enforced beneath probabilistic reasoning.','Layer-0 governance constraints are non-negotiable beneath probabilistic model and agent reasoning and must be evaluated before probabilistic proposals can proceed.','Layer-0 constitutional priority','Governance','constitutional','MUST','ready_for_review','Reconcile with modern C0-C4, T0-T3, EIK and Durable Rulebook governance before activation.','{"historical":true}'::jsonb),
('CAND-L0-SLA-PAD-001','chat:2025-08-30T21:59:30Z','Apply 40% timing padding to all SLAs.','Layer-0 SLA timing targets should include a 40 percent safety pad over the unpadded baseline unless a later approved service-level policy replaces the method.','Historical 40 percent SLA timing pad','Service Levels','sla','SHOULD','ready_for_review','No current approved enterprise SLA policy has yet been established.','{"historical":true}'::jsonb),
('CAND-L0-COST-LINEITEM-001','chat:2025-08-30T21:59:30Z','Budget numbers deferred, but address cost controls line-item level.','Cost governance must operate at line-item or causal-resource granularity even when exact monetary thresholds are configurable or not yet approved.','Line-item cost control with configurable thresholds','FinOps','cost_governance','MUST','possible_conflict','Likely predecessor to current FinOps economic envelopes and causal cost lineage.','{"historical":true}'::jsonb),
('CAND-L0-TOPSHELF-001','chat:2025-08-30T22:01:27Z','Accepted adding anything missed, with creative forward controls.','The Layer-0 governance inventory was explicitly authorized to expand beyond initially enumerated categories when missing controls were necessary for comprehensive governance, provided additions remained evidence-reviewed and versioned.','Layer-0 rulebook may expand under governed review','Governance','change_control','MAY','ready_for_review','Authority to expand scope is not authority to activate arbitrary rules.','{"historical":true}'::jsonb)
)
insert into comind_pm.pm_rule_candidates(
  project_id,candidate_key,source_document_id,source_excerpt,normalized_statement,proposed_title,
  proposed_domain,proposed_rule_type,proposed_modality,discovery_confidence,authority_confidence,
  extraction_method,candidate_status,review_notes,metadata
)
select p.id,c.candidate_key,d.id,c.source_excerpt,c.normalized_statement,c.proposed_title,
       c.proposed_domain,c.proposed_rule_type,c.proposed_modality,1.0,
       case when d.authority_status='approved' then 1.0 else 0.85 end,
       'rule_archaeology_seed',c.status,c.review_notes,c.metadata
from project p
join candidates c on true
join comind_pm.pm_rule_source_documents d
  on d.project_id=p.id and d.source_ref=c.source_ref
on conflict (project_id,candidate_key) do update set
  source_document_id=excluded.source_document_id,
  source_excerpt=excluded.source_excerpt,
  normalized_statement=excluded.normalized_statement,
  proposed_title=excluded.proposed_title,
  proposed_domain=excluded.proposed_domain,
  proposed_rule_type=excluded.proposed_rule_type,
  proposed_modality=excluded.proposed_modality,
  discovery_confidence=excluded.discovery_confidence,
  authority_confidence=excluded.authority_confidence,
  candidate_status=excluded.candidate_status,
  review_notes=excluded.review_notes,
  metadata=comind_pm.pm_rule_candidates.metadata || excluded.metadata,
  updated_at=now();

commit;
