begin;

create or replace function comind_pm.validate_rule_evaluation_request()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_authority_project uuid;
begin
  select project_id into v_authority_project
  from comind_pm.pm_rule_authorities
  where id=new.authority_id;
  if not found then
    raise exception 'REE-001 authority % does not exist',new.authority_id;
  end if;
  if v_authority_project<>new.project_id then
    raise exception 'REE-001 evaluation request authority project mismatch';
  end if;
  if not comind_pm.ree_valid_evidence_claims(new.evidence_claims) then
    raise exception 'REE-001 evidence_claims must be an array of bounded typed evidence claims';
  end if;

  -- Request chronology used for authority decisions must be database-controlled.
  -- Caller-supplied historical/future timestamps remain untrusted input and are not preserved here.
  new.requested_at:=statement_timestamp();
  new.created_at:=statement_timestamp();
  return new;
end;
$$;

create or replace function comind_pm.ree_evaluate_request_rule(
  p_request_id uuid,
  p_rule_id uuid,
  p_rule_version integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request comind_pm.pm_rule_evaluation_requests%rowtype;
  v_rule comind_pm.pm_rules%rowtype;
  v_version comind_pm.pm_rule_versions%rowtype;
  v_existing comind_pm.pm_rule_evaluation_results%rowtype;
  v_readiness jsonb;
  v_contract_kind text;
  v_formalization_status text;
  v_formalization_reason text;
  v_authority_result jsonb:='{}'::jsonb;
  v_outcome text;
  v_reason text;
  v_diagnostics jsonb:='{}'::jsonb;
  v_evidence_refs jsonb:='[]'::jsonb;
  v_evaluator_version constant text:='ree-001/evidence-requirements-v2';
  v_result_id uuid;
  v_unsatisfied boolean:=false;
  v_authority_at timestamptz:=statement_timestamp();
begin
  select * into v_existing
  from comind_pm.pm_rule_evaluation_results
  where request_id=p_request_id
    and rule_id=p_rule_id
    and rule_version=p_rule_version
    and evaluator_version=v_evaluator_version;
  if found then
    return jsonb_build_object(
      'result_id',v_existing.id,
      'outcome',v_existing.outcome,
      'reason_code',v_existing.reason_code,
      'reused',true
    );
  end if;

  select * into v_request
  from comind_pm.pm_rule_evaluation_requests
  where id=p_request_id;
  if not found then
    raise exception 'REE-001 evaluation request % does not exist',p_request_id;
  end if;

  select * into v_rule
  from comind_pm.pm_rules
  where id=p_rule_id;
  if not found then
    raise exception 'REE-001 rule % does not exist',p_rule_id;
  end if;
  if v_rule.project_id<>v_request.project_id then
    raise exception 'REE-001 rule/request project mismatch';
  end if;

  select * into v_version
  from comind_pm.pm_rule_versions
  where rule_id=p_rule_id and version=p_rule_version;
  if not found then
    raise exception 'REE-001 rule version %.% does not exist',p_rule_id,p_rule_version;
  end if;

  v_readiness:=comind_pm.ree_rule_formalization_readiness(p_rule_id,p_rule_version);
  v_contract_kind:=coalesce(v_readiness->>'contract_kind','not_applicable');
  v_formalization_status:=coalesce(v_readiness->>'status','not_ready');
  v_formalization_reason:=coalesce(v_readiness->>'reason','unknown_readiness');

  if v_formalization_reason='rule_not_active' then
    v_outcome:='not_applicable';
    v_reason:='rule_not_active';
  elsif v_formalization_reason in ('rule_version_not_current','rule_version_not_approved') then
    v_outcome:='not_machine_evaluable';
    v_reason:=v_formalization_reason;
  elsif v_formalization_status='not_ready' and v_rule.enforcement_mode<>'review_required' then
    v_outcome:='not_machine_evaluable';
    v_reason:=v_formalization_reason;
  else
    v_authority_result:=comind_pm.resolve_authority_request(
      v_request.project_id,
      v_request.authority_id,
      v_request.capability,
      v_request.action,
      v_request.resource_class,
      v_request.environment,
      v_request.domain,
      v_request.context,
      v_authority_at
    );
    v_diagnostics:=jsonb_build_object('authority_evaluated_at',v_authority_at);

    if v_authority_result->>'determination'='unresolved' then
      v_outcome:='unresolved';
      v_reason:='authority_unresolved';
    elsif v_authority_result->>'determination'<>'sufficient' then
      v_outcome:='deny';
      v_reason:='authority_'||coalesce(v_authority_result->>'determination','unknown');
    elsif v_rule.enforcement_mode='review_required' then
      v_outcome:='require_review';
      v_reason:='human_review_required';
    elsif v_contract_kind<>'evidence_requirements_v1' then
      v_outcome:='not_machine_evaluable';
      v_reason:=v_formalization_reason;
    elsif v_rule.domain<>v_request.domain then
      v_outcome:='not_applicable';
      v_reason:='rule_domain_mismatch';
    elsif v_version.formal_rule->>'subject'<>v_request.subject_type then
      v_outcome:='not_applicable';
      v_reason:='subject_type_mismatch';
    elsif not (v_request.facts ? 'target_status') then
      v_outcome:='insufficient_evidence';
      v_reason:='missing_target_status_fact';
    elsif v_version.formal_rule->>'target_status'<>v_request.facts->>'target_status' then
      v_outcome:='not_applicable';
      v_reason:='target_status_mismatch';
    else
      v_diagnostics:=v_diagnostics || jsonb_build_object(
        'requirements',
        comind_pm.ree_evidence_requirement_diagnostics(
          v_version.formal_rule,
          v_request.evidence_claims
        )
      );
      select exists(
        select 1
        from jsonb_array_elements(v_diagnostics->'requirements') as d(item)
        where coalesce((d.item->>'satisfied')::boolean,false)=false
      ) into v_unsatisfied;

      select coalesce(jsonb_agg(distinct e.claim->>'evidence_ref'),'[]'::jsonb)
      into v_evidence_refs
      from jsonb_array_elements(v_request.evidence_claims) as e(claim)
      where nullif(btrim(e.claim->>'evidence_ref'),'') is not null;

      if v_unsatisfied then
        if v_rule.enforcement_mode='hard_constraint' then
          v_outcome:='deny';
          v_reason:='required_evidence_missing_hard_constraint';
        else
          v_outcome:='insufficient_evidence';
          v_reason:='required_evidence_missing';
        end if;
      else
        v_outcome:='allow';
        v_reason:='requirements_satisfied';
      end if;
    end if;
  end if;

  insert into comind_pm.pm_rule_evaluation_results(
    request_id,project_id,rule_id,rule_version,evaluator_version,contract_kind,
    formalization_status,formalization_reason,enforcement_mode,authority_result,
    outcome,reason_code,diagnostics,evidence_refs
  ) values (
    v_request.id,v_request.project_id,v_rule.id,p_rule_version,v_evaluator_version,v_contract_kind,
    v_formalization_status,v_formalization_reason,v_rule.enforcement_mode,v_authority_result,
    v_outcome,v_reason,v_diagnostics,v_evidence_refs
  )
  returning id into v_result_id;

  return jsonb_build_object(
    'result_id',v_result_id,
    'outcome',v_outcome,
    'reason_code',v_reason,
    'formalization_status',v_formalization_status,
    'formalization_reason',v_formalization_reason,
    'contract_kind',v_contract_kind,
    'authority_result',v_authority_result,
    'diagnostics',v_diagnostics,
    'reused',false
  );
end;
$$;

revoke all on function comind_pm.validate_rule_evaluation_request() from public,anon,authenticated;
revoke all on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) from service_role;
grant execute on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) to service_role;

commit;
