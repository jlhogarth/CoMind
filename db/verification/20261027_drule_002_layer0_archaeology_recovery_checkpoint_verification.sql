-- DRULE-002 Layer-0 archaeology recovery checkpoint verification.
-- Read-only except for exception signaling inside the verification transaction.

begin;

set local transaction_read_only = on;

do $$
declare
  v_project_id uuid;
  v_source_id uuid;
  v_in_progress integer;
  v_complete integer;
  v_partial integer;
  v_case_count integer;
  v_bad_case_count integer;
  v_bad_historical_status integer;
  v_bad_candidate_promotion integer;
  v_int_members integer;
  v_fwd_members integer;
begin
  select id into v_project_id
  from comind_pm.pm_projects
  where project_key = 'COMIND';

  if v_project_id is null then
    raise exception 'DRULE-002 verification: COMIND project not found';
  end if;

  select id into v_source_id
  from comind_pm.pm_rule_source_documents
  where project_id = v_project_id
    and source_system = 'gdrive'
    and source_ref = 'https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view';

  if v_source_id is null then
    raise exception 'DRULE-002 verification: canonical Layer-0 source not found';
  end if;

  if not exists (
    select 1
    from comind_pm.pm_rule_source_documents
    where id = v_source_id
      and ingestion_status = 'reviewed'
      and retrieval_completeness = 'partial'
      and metadata @> '{"recovery_sweep_2026_10_27":{"drive_revision_count":1,"alternate_rulebook_source_found":false}}'::jsonb
  ) then
    raise exception 'DRULE-002 verification: source recovery metadata is incomplete';
  end if;

  select count(*) filter (where archaeology_status = 'in_progress'),
         count(*) filter (where archaeology_status = 'complete'),
         count(*) filter (where archaeology_status = 'partial')
    into v_in_progress, v_complete, v_partial
  from comind_pm.pm_rule_archaeology_queue
  where project_id = v_project_id
    and source_document_id = v_source_id;

  if v_in_progress <> 28 or v_complete <> 4 or v_partial <> 0 then
    raise exception 'DRULE-002 verification: expected 28 in_progress, 4 complete, 0 partial; got %, %, %',
      v_in_progress, v_complete, v_partial;
  end if;

  if exists (
    select 1
    from comind_pm.pm_rule_archaeology_queue
    where project_id = v_project_id
      and source_document_id = v_source_id
      and section_number between 1 and 28
      and (
        archaeology_status <> 'in_progress'
        or metadata->'recovery_sweep_2026_10_27'->>'source_text_status' <> 'original_clause_text_missing'
        or metadata->'recovery_sweep_2026_10_27'->>'successor_evidence_treatment' <> 'reconciliation_only_not_verbatim_recovery'
      )
  ) then
    raise exception 'DRULE-002 verification: Sections 1-28 recovery-gap semantics are inconsistent';
  end if;

  if exists (
    select 1
    from comind_pm.pm_rule_archaeology_queue
    where project_id = v_project_id
      and source_document_id = v_source_id
      and section_number between 29 and 32
      and (
        archaeology_status <> 'complete'
        or completed_at is null
        or metadata->>'policy_reconciliation_state' <> 'open'
        or metadata->>'completion_semantics' not like 'archaeology_complete%'
      )
  ) then
    raise exception 'DRULE-002 verification: Sections 29-32 completion semantics are inconsistent';
  end if;

  select count(*) into v_case_count
  from comind_pm.pm_rule_reconciliation_cases
  where project_id = v_project_id
    and case_key in (
      'RC-L0-SLA-001',
      'RC-L0-INT-001',
      'RC-L0-COST-001',
      'RC-L0-COSTLINE-001',
      'RC-L0-FWD-001'
    );

  if v_case_count <> 5 then
    raise exception 'DRULE-002 verification: expected five Layer-0 Section 29-32 reconciliation cases, got %', v_case_count;
  end if;

  select count(*) into v_bad_case_count
  from comind_pm.pm_rule_reconciliation_cases
  where project_id = v_project_id
    and case_key in (
      'RC-L0-SLA-001',
      'RC-L0-INT-001',
      'RC-L0-COST-001',
      'RC-L0-COSTLINE-001',
      'RC-L0-FWD-001'
    )
    and status <> 'open';

  if v_bad_case_count <> 0 then
    raise exception 'DRULE-002 verification: archaeology incorrectly closed current-policy reconciliation cases';
  end if;

  select count(*) into v_int_members
  from comind_pm.pm_rule_reconciliation_cases c
  join comind_pm.pm_rule_reconciliation_members m on m.case_id = c.id
  join comind_pm.pm_rules r on r.id = m.rule_id
  where c.project_id = v_project_id
    and c.case_key = 'RC-L0-INT-001'
    and r.rule_key = 'RULE-HIST-L0-INT-001';

  if v_int_members <> 1 then
    raise exception 'DRULE-002 verification: Section 30 historical rule is not linked exactly once';
  end if;

  select count(*) into v_fwd_members
  from comind_pm.pm_rule_reconciliation_cases c
  join comind_pm.pm_rule_reconciliation_members m on m.case_id = c.id
  join comind_pm.pm_rules r on r.id = m.rule_id
  where c.project_id = v_project_id
    and c.case_key = 'RC-L0-FWD-001'
    and r.rule_key in (
      'RULE-HIST-L0-FWD-001',
      'RULE-HIST-L0-FWD-002',
      'RULE-HIST-L0-FWD-003',
      'RULE-HIST-L0-FWD-004'
    );

  if v_fwd_members <> 4 then
    raise exception 'DRULE-002 verification: expected four Section 32 historical rule members, got %', v_fwd_members;
  end if;

  select count(*) into v_bad_historical_status
  from comind_pm.pm_rules
  where project_id = v_project_id
    and rule_key in (
      'RULE-HIST-L0-SLA-001',
      'RULE-HIST-L0-SLA-002',
      'RULE-HIST-L0-SLA-003',
      'RULE-HIST-L0-SLA-004',
      'RULE-HIST-L0-SLA-005',
      'RULE-HIST-L0-INT-001',
      'RULE-HIST-L0-COST-001',
      'RULE-HIST-L0-COST-002',
      'RULE-HIST-L0-COST-003',
      'RULE-HIST-L0-FWD-001',
      'RULE-HIST-L0-FWD-002',
      'RULE-HIST-L0-FWD-003',
      'RULE-HIST-L0-FWD-004'
    )
    and status <> 'candidate';

  if v_bad_historical_status <> 0 then
    raise exception 'DRULE-002 verification: one or more historical rules were activated unexpectedly';
  end if;

  select count(*) into v_bad_candidate_promotion
  from comind_pm.pm_rule_candidates
  where project_id = v_project_id
    and candidate_key in ('CAND-L0-SLA-PAD-001','CAND-L0-COST-LINEITEM-001')
    and promoted_rule_id is not null;

  if v_bad_candidate_promotion <> 0 then
    raise exception 'DRULE-002 verification: archaeology promoted a historical review candidate';
  end if;
end
$$;

rollback;
