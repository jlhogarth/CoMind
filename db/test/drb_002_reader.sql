-- ISOLATED TEST CONTRACT ONLY. Not a production migration or deployment instruction.
-- The harness creates the dedicated login with a generated temporary password first.
begin;
revoke all on schema public from comind_runbook_query_login;
grant usage on schema comind_pm to comind_runbook_query_login;
grant select on comind_pm.pm_projects, comind_pm.pm_work_items, comind_pm.pm_events,
  comind_pm.pm_authorizations, comind_pm.pm_verifications to comind_runbook_query_login;
grant select on comind_pm.v_runbook_lane_state, comind_pm.v_runbook_timeline,
  comind_pm.v_runbook_authority, comind_pm.v_runbook_verification to comind_runbook_query_login;
-- Fixed server-administered project boundary. Never derive this from a user-settable GUC.
create policy drb_test_reader on comind_pm.pm_projects for select to comind_runbook_query_login
  using (project_key='COMIND');
create policy drb_test_reader on comind_pm.pm_work_items for select to comind_runbook_query_login
  using (project_id in (select id from comind_pm.pm_projects where project_key='COMIND'));
create policy drb_test_reader on comind_pm.pm_events for select to comind_runbook_query_login
  using (project_id in (select id from comind_pm.pm_projects where project_key='COMIND')
    and (work_item_id is null or work_item_id in (select id from comind_pm.pm_work_items)));
create policy drb_test_reader on comind_pm.pm_authorizations for select to comind_runbook_query_login
  using (project_id in (select id from comind_pm.pm_projects where project_key='COMIND')
    and (work_item_id is null or work_item_id in (select id from comind_pm.pm_work_items)));
create policy drb_test_reader on comind_pm.pm_verifications for select to comind_runbook_query_login
  using (project_id in (select id from comind_pm.pm_projects where project_key='COMIND')
    and (work_item_id is null or work_item_id in (select id from comind_pm.pm_work_items)));
commit;
