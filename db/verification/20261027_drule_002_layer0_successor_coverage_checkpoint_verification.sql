-- DRULE-002 Layer-0 successor coverage checkpoint verification.
-- Read-only and fail-closed. No production mutation.

do $$
declare
  v_project_id uuid;
  v_source_document_id uuid;
  v_count integer;
  v_sections integer[];
begin
  select id into v_project_id
  from comind_pm.pm_projects
  where project_key = 'COMIND';

  if v_project_id is null then
    raise exception 'DRULE-002 verification failed: COMIND project not found';
  end if;

  select d.id into v_source_document_id
  from comind_pm.pm_rule_source_documents d
  where d.project_id = v_project_id
    and d.source_system = 'gdrive'
    and d.source_ref = 'https://drive.google.com/file/d/16Yeim-s_mujVYWIgTmLeabFcgYMHni1l/view';

  if v_source_document_id is null then
    raise exception 'DRULE-002 verification failed: canonical Layer-0 source not found';
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28;
  if v_count <> 28 then
    raise exception 'DRULE-002 verification failed: expected 28 Sections 1-28 rows, found %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.archaeology_status = 'in_progress'
    and q.completed_at is null;
  if v_count <> 28 then
    raise exception 'DRULE-002 verification failed: Sections 1-28 archaeology status changed unexpectedly; matching rows %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{recovery_sweep_2026_10_27,source_text_status}' = 'original_clause_text_missing';
  if v_count <> 28 then
    raise exception 'DRULE-002 verification failed: historical source-text gap was not preserved on all 28 rows; matching rows %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,assessment_key}' = 'DRULE-002-SC-001';
  if v_count <> 28 then
    raise exception 'DRULE-002 verification failed: successor assessment is not present on all 28 rows; matching rows %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_coverage_adequate';
  if v_count <> 16 then
    raise exception 'DRULE-002 verification failed: expected 16 adequate sections, found %', v_count;
  end if;

  select array_agg(q.section_number order by q.section_number) into v_sections
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_coverage_adequate';
  if v_sections is distinct from array[1,2,5,8,9,12,14,16,18,20,21,22,23,25,26,28] then
    raise exception 'DRULE-002 verification failed: adequate membership differs: %', v_sections;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_coverage_partial';
  if v_count <> 9 then
    raise exception 'DRULE-002 verification failed: expected 9 partial sections, found %', v_count;
  end if;

  select array_agg(q.section_number order by q.section_number) into v_sections
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_coverage_partial';
  if v_sections is distinct from array[4,6,7,10,11,15,19,24,27] then
    raise exception 'DRULE-002 verification failed: partial membership differs: %', v_sections;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_governance_gap';
  if v_count <> 3 then
    raise exception 'DRULE-002 verification failed: expected 3 current governance gaps, found %', v_count;
  end if;

  select array_agg(q.section_number order by q.section_number) into v_sections
  from comind_pm.pm_rule_archaeology_queue q
  where q.source_document_id = v_source_document_id
    and q.section_number between 1 and 28
    and q.metadata #>> '{successor_coverage_2026_10_27,state}' = 'modern_governance_gap';
  if v_sections is distinct from array[3,13,17] then
    raise exception 'DRULE-002 verification failed: governance-gap membership differs: %', v_sections;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_reconciliation_cases c
  where c.project_id = v_project_id
    and c.case_key in ('RC-L0-GAP-DCLASS-001','RC-L0-GAP-EGRESS-001','RC-L0-GAP-TENANCY-001')
    and c.case_type = 'source_gap'
    and c.status = 'open'
    and c.metadata #>> '{assessment_key}' = 'DRULE-002-SC-001'
    and c.metadata #>> '{gap_dimension}' = 'modern_governance_control'
    and c.metadata #>> '{historical_source_gap_remains_separate}' = 'true';
  if v_count <> 3 then
    raise exception 'DRULE-002 verification failed: expected three open current-governance gap cases, found %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rules r
  where r.project_id = v_project_id
    and r.metadata #>> '{assessment_key}' = 'DRULE-002-SC-001';
  if v_count <> 0 then
    raise exception 'DRULE-002 verification failed: successor assessment unexpectedly created or altered canonical rules; matching rows %', v_count;
  end if;

  select count(*) into v_count
  from comind_pm.pm_rule_candidates c
  where c.project_id = v_project_id
    and c.metadata #>> '{assessment_key}' = 'DRULE-002-SC-001';
  if v_count <> 0 then
    raise exception 'DRULE-002 verification failed: successor assessment unexpectedly created or promoted rule candidates; matching rows %', v_count;
  end if;

  raise notice 'DRULE-002 successor coverage verification passed: 28 historical source gaps preserved; 16 adequate, 9 partial, 3 current governance gaps; no rule activation or candidate promotion.';
end
$$;
