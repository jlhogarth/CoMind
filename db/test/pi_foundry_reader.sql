-- Disposable Test contract only. Never apply as an application migration.
REVOKE ALL ON SCHEMA public FROM comind_foundry_query_login;
GRANT USAGE ON SCHEMA comind TO comind_foundry_query_login;
GRANT SELECT ON comind.cm_foundry_authorization_request TO comind_foundry_query_login;
DROP POLICY IF EXISTS pi_foundry_reader_test ON comind.cm_foundry_authorization_request;
CREATE POLICY pi_foundry_reader_test ON comind.cm_foundry_authorization_request
  FOR SELECT TO comind_foundry_query_login
  USING (project_id = '11111111-1111-4111-8111-111111111111'::uuid);
