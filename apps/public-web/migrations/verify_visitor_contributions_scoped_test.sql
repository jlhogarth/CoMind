-- Run against the Test migration with a direct privileged connection. Fixtures roll back.
begin;

do $$
declare
  role_name text;
  signature text;
begin
  if not exists (
    select from pg_class where oid = 'web001_private.contributions'::regclass and relrowsecurity and relforcerowsecurity
  ) then raise exception 'RLS is missing'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_schema_privilege(role_name, 'web001_private', 'USAGE') or
       has_table_privilege(role_name, 'web001_private.contributions', 'SELECT,INSERT,UPDATE,DELETE') or
       (role_name <> 'service_role' and has_schema_privilege(role_name, 'comind', 'USAGE')) or
       has_table_privilege(role_name, 'comind.cm_soap_case', 'SELECT') or
       has_table_privilege(role_name, 'comind.cm_cris_mapping', 'SELECT') then
      raise exception 'Unexpected privileges for %', role_name;
    end if;
    foreach signature in array array[
      'web001_private.web001_submit(uuid,text,text,text,text,text,text)', 'web001_private.web001_withdraw(uuid,text)'
    ] loop
      if has_function_privilege(role_name, signature, 'EXECUTE') then
        raise exception 'Unexpected RPC privileges for %', role_name;
      end if;
    end loop;
    execute format('set local role %I', role_name);
    begin
      perform question from web001_private.contributions;
      raise exception 'Contribution SELECT unexpectedly succeeded';
    exception when insufficient_privilege then null;
    end;
    begin
      perform web001_private.web001_withdraw(gen_random_uuid(), repeat('a', 64));
      raise exception 'Withdrawal RPC unexpectedly succeeded';
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  if has_table_privilege('web001_ingest', 'web001_private.contributions', 'SELECT,INSERT,UPDATE,DELETE')
     or has_any_column_privilege('web001_ingest', 'web001_private.contributions', 'SELECT,INSERT,UPDATE')
     or pg_has_role('web001_ingest', 'web001_ingest_ops', 'MEMBER')
     or has_schema_privilege('web001_ingest', 'comind', 'USAGE')
     or has_function_privilege('web001_ingest', 'web001_private.enforce_retention()', 'EXECUTE')
     or not has_function_privilege('web001_ingest', 'web001_private.web001_withdraw(uuid,text)', 'EXECUTE')
     or not has_function_privilege('web001_ingest', 'web001_private.web001_submit(uuid,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'Scoped ingest role has unexpected privileges';
  end if;
  if not exists (select from cron.job where jobname = 'web001-test-contribution-retention' and active
      and schedule = '* * * * *' and command = 'select web001_private.enforce_retention();') then
    raise exception 'Retention job is inactive or incorrect';
  end if;
end;
$$;

do $$
declare
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  expired_id uuid := gen_random_uuid();
  old_id uuid := gen_random_uuid();
  token_hash text := repeat('a',64);
  receipt jsonb;
  question_text text := 'Synthetic: How can visitors verify a public claim?';
begin
  set local role web001_ingest;
  begin
    perform web001_private.web001_submit(gen_random_uuid(),token_hash,'invalid',question_text,null,null,null);
    raise exception 'Invalid consent unexpectedly succeeded';
  exception when check_violation then null;
  end;
  receipt := web001_private.web001_submit(first_id,token_hash,'web-curiosity-v1',question_text,'Evidence exercise',null,null);
  if receipt is null or (receipt->>'contribution_id')::uuid is distinct from first_id or
    web001_private.web001_submit(first_id,token_hash,'web-curiosity-v1',question_text,'Evidence exercise',null,null)
      is distinct from receipt or
    web001_private.web001_submit(first_id,token_hash,'web-curiosity-v1',question_text,null,null,null) is not null or
    web001_private.web001_submit(first_id,repeat('b',64),'web-curiosity-v1',question_text,'Evidence exercise',null,null)
      is not null then
    raise exception 'Receipt or idempotency contract failed';
  end if;
  perform web001_private.web001_submit(second_id,token_hash,'web-curiosity-v1','Synthetic: Where can readers find claim provenance?',null,null,null);
  reset role;
  if not exists (select from web001_private.contributions where contribution_id=first_id
      and status='pending_review' and consent_purpose='research_topic_review' and source_surface='public_question_draft'
      and consented_at=now() and expires_at-consented_at=interval '90 days') or
     exists (select from web001_private.soap_research_candidates where source_contribution_id=first_id) then
    raise exception 'Consent provenance or human review gate failed';
  end if;
  update web001_private.contributions set status='approved', reviewed_problem_key='synthetic_claim_provenance'
    where contribution_id in (first_id, second_id);
  if not exists (select from web001_private.soap_research_candidates where source_contribution_id=first_id
      and subjective=question_text and objective is null and assessment is null and plan is not null) or
     not exists (select from web001_private.cris_relationship_candidates
      where left_contribution_id=least(first_id,second_id) and right_contribution_id=greatest(first_id,second_id)
        and evidence_basis='shared_reviewer_assigned_problem' and review_state='candidate' and confidence is null) then
    raise exception 'SOAP or CRIS projection failed';
  end if;

  set local role web001_ingest;
  if web001_private.web001_withdraw(first_id,repeat('b',64)) then raise exception 'Wrong token accepted'; end if;
  if not web001_private.web001_withdraw(first_id,token_hash) then raise exception 'Withdrawal failed'; end if;
  if not web001_private.web001_withdraw(first_id,token_hash) then raise exception 'Withdrawal retry failed'; end if;
  if web001_private.web001_submit(first_id,token_hash,'web-curiosity-v1',question_text,'Evidence exercise',null,null) is not null then
    raise exception 'Withdrawn contribution was restored';
  end if;
  reset role;
  if exists (select from web001_private.soap_research_candidates where source_contribution_id=first_id) or
     exists (select from web001_private.cris_relationship_candidates where first_id in (left_contribution_id,right_contribution_id)) or
     not exists (select from web001_private.contributions where contribution_id=first_id and status='withdrawn'
      and question is null and why_it_matters is null and known_context is null and uncertainty is null
      and reviewed_problem_key is null and scrubbed_at=now() and consent_version='web-curiosity-v1') then
    raise exception 'Withdrawal scrubbing or audit evidence failed';
  end if;

  insert into web001_private.contributions
    (contribution_id, question, withdrawal_token_hash, consent_version, consented_at, expires_at)
  values
    (expired_id,question_text,token_hash,'web-curiosity-v1',now()-interval '90 days',now()-interval '1 minute'),
    (old_id,question_text,token_hash,'web-curiosity-v1',now()-interval '120 days',now()-interval '31 days');
  set local role web001_ingest;
  if web001_private.web001_withdraw(expired_id,token_hash) then raise exception 'Expired token accepted'; end if;
  reset role;
  perform web001_private.enforce_retention();
  if not exists (select from web001_private.contributions where contribution_id=expired_id and status='expired'
      and question is null and scrubbed_at=now()) or
     exists (select from web001_private.contributions where contribution_id=old_id) then
    raise exception 'Retention scrubbing or purge failed';
  end if;
end;
$$;
select 'PASS: privileges, RLS flags, consent, duplicate handling, SOAP/CRIS, withdrawal and retention' as verification;
rollback;
