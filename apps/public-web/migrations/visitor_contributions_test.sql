-- WEB-001 private visitor contributions. Review and apply only in approved Test migration lane.
create table if not exists public.comind_visitor_contributions (
  contribution_id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 10 and 1500),
  why_it_matters text check (why_it_matters is null or char_length(why_it_matters)<=1500),
  known_context text check (known_context is null or char_length(known_context)<=1500),
  uncertainty text check (uncertainty is null or char_length(uncertainty)<=1500),
  consent_version text not null check (consent_version='web-curiosity-v1'),
  consent_purpose text not null default 'research_topic_review' check (consent_purpose='research_topic_review'),
  consented_at timestamptz not null default now(),
  source_surface text not null default 'public_question_draft' check (source_surface='public_question_draft'),
  withdrawal_token_hash text not null unique check (withdrawal_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','withdrawn')),
  soap_case_id uuid references comind.cm_soap_case(case_id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '90 days'),
  withdrawn_at timestamptz,
  constraint contribution_expiry check (expires_at > created_at)
);
create index if not exists comind_visitor_contributions_review_idx on public.comind_visitor_contributions(status,created_at);
create index if not exists comind_visitor_contributions_expiry_idx on public.comind_visitor_contributions(expires_at);
alter table public.comind_visitor_contributions enable row level security;
revoke all on public.comind_visitor_contributions from public, anon, authenticated;
grant select,insert,update,delete on public.comind_visitor_contributions to service_role;
-- No public policies: deny anonymous/authenticated reads and writes.
comment on table public.comind_visitor_contributions is 'WEB-001 opt-in minimized research questions. Private review queue; no PTSD data; purge expired/withdrawn records under governed retention.';
