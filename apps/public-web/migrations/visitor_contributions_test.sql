-- WEB-001 isolated Test storage. No clinical table, grant, or data is changed.
begin;

create schema if not exists web001_private;
revoke all on schema web001_private from public, anon, authenticated, service_role;
grant usage on schema web001_private to service_role;

create table if not exists web001_private.contributions (
  contribution_id uuid primary key,
  question text,
  why_it_matters text check (char_length(why_it_matters) <= 1500),
  known_context text check (char_length(known_context) <= 1500),
  uncertainty text check (char_length(uncertainty) <= 1500),
  consent_version text not null check (consent_version = 'web-curiosity-v1'),
  consent_purpose text not null default 'research_topic_review' check (consent_purpose = 'research_topic_review'),
  source_surface text not null default 'public_question_draft' check (source_surface = 'public_question_draft'),
  withdrawal_token_hash text not null check (withdrawal_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','withdrawn','expired')),
  reviewed_problem_key text check (reviewed_problem_key is null or (reviewed_problem_key ~ '^[a-z][a-z0-9_]{1,63}$' and status = 'approved')),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  scrubbed_at timestamptz,
  constraint contribution_expiry check (expires_at > consented_at and expires_at - consented_at <= interval '90 days'),
  check (
    (status in ('withdrawn','expired') and scrubbed_at is not null and question is null and
     why_it_matters is null and known_context is null and uncertainty is null and reviewed_problem_key is null)
    or
    (status in ('pending_review','approved','rejected') and scrubbed_at is null and
     question is not null and char_length(btrim(question)) between 10 and 1500)
  )
);
create index if not exists contributions_expiry_idx on web001_private.contributions (expires_at);
alter table web001_private.contributions enable row level security;
alter table web001_private.contributions force row level security;
revoke all on web001_private.contributions from public, anon, authenticated, service_role;
grant select, insert on web001_private.contributions to service_role;
grant update (status, scrubbed_at, question, why_it_matters, known_context, uncertainty, reviewed_problem_key)
  on web001_private.contributions to service_role;

create or replace function public.web001_submit(
  p_id uuid, p_hash text, p_consent_version text, p_question text, p_why text, p_known text, p_unknown text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  receipt jsonb;
  consent_time timestamptz := now();
begin
  insert into web001_private.contributions
    (contribution_id, withdrawal_token_hash, consent_version, question, why_it_matters, known_context, uncertainty,
     consented_at, expires_at)
  values (p_id, p_hash, p_consent_version, p_question, p_why, p_known, p_unknown,
          consent_time, consent_time + interval '2160 hours')
  on conflict (contribution_id) do nothing;

  select jsonb_build_object('contribution_id', contribution_id, 'created_at', consented_at, 'expires_at', expires_at)
  into receipt
  from web001_private.contributions
  where contribution_id = p_id and withdrawal_token_hash = p_hash and expires_at > now()
    and status in ('pending_review','approved','rejected')
    and consent_version = p_consent_version and question = p_question
    and why_it_matters is not distinct from p_why and known_context is not distinct from p_known
    and uncertainty is not distinct from p_unknown;
  return receipt;
end;
$$;

create or replace function public.web001_withdraw(p_id uuid, p_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update web001_private.contributions
  set status = 'withdrawn', scrubbed_at = now(), question = null, why_it_matters = null,
      known_context = null, uncertainty = null, reviewed_problem_key = null
  where contribution_id = p_id and withdrawal_token_hash = p_hash and expires_at > now()
    and status in ('pending_review','approved','rejected');
  if found then return true; end if;

  return exists (
    select from web001_private.contributions
    where contribution_id = p_id and withdrawal_token_hash = p_hash
      and status = 'withdrawn' and expires_at > now()
  );
end;
$$;

revoke all on function public.web001_submit(uuid,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.web001_withdraw(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.web001_submit(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.web001_withdraw(uuid,text) to service_role;

-- Mirror the SOAP entry shape in a nonclinical, live projection. Pending submissions remain in the review queue.
create or replace view web001_private.soap_research_candidates as
select contribution_id as source_contribution_id, consent_version, consent_purpose, source_surface, consented_at,
       question as subjective, null::text as objective, null::text as assessment,
       'Review the research question and seek independently attributable evidence.'::text as plan,
       why_it_matters as subjective_motivation, known_context as subjective_context,
       uncertainty as subjective_uncertainty
from web001_private.contributions
where status = 'approved' and expires_at > now();

-- A shared reviewer-assigned problem key is evidence for a candidate relation. No keyword or model inference.
create or replace view web001_private.cris_relationship_candidates as
select a.contribution_id as left_contribution_id, b.contribution_id as right_contribution_id,
       a.reviewed_problem_key, 'shared_reviewer_assigned_problem'::text as evidence_basis,
       'candidate'::text as review_state, null::real as confidence
from web001_private.contributions a
join web001_private.contributions b on a.contribution_id < b.contribution_id
  and a.reviewed_problem_key = b.reviewed_problem_key
where a.status = 'approved' and b.status = 'approved' and a.expires_at > now() and b.expires_at > now();
revoke all on web001_private.soap_research_candidates, web001_private.cris_relationship_candidates
  from public, anon, authenticated, service_role;

create or replace function web001_private.enforce_retention()
returns void
language sql
security invoker
set search_path = ''
as $$
  update web001_private.contributions
  set status = 'expired', scrubbed_at = now(), question = null, why_it_matters = null,
      known_context = null, uncertainty = null, reviewed_problem_key = null
  where expires_at <= now() and status in ('pending_review','approved','rejected');

  delete from web001_private.contributions
  where scrubbed_at <= now() - interval '30 days' or expires_at <= now() - interval '30 days';
$$;
revoke all on function web001_private.enforce_retention() from public, anon, authenticated, service_role;
select cron.schedule('web001-test-contribution-retention', '* * * * *', 'select web001_private.enforce_retention();');
notify pgrst, 'reload schema';

commit;
