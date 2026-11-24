-- Metadata-only readback. Do not disclose the Auth subject or actor UUID.
SELECT
  count(*) = 1 AS exactly_one_verified_synthetic_binding,
  bool_and(a.email IS NULL AND a.display_name IS NULL AND a.kind = 'person') AS no_personal_profile_copied,
  bool_and(u.email_confirmed_at IS NOT NULL) AS auth_account_confirmed
FROM comind.cm_identity i
JOIN comind.cm_identity_provider p ON p.idp_id = i.idp_id
JOIN comind.cm_actor a ON a.actor_id = i.actor_id
JOIN auth.users u ON u.id::text = i.subject
WHERE p.name = 'supabase-auth-test'
  AND a.handle = 'prism-ger-005-synthetic-test-actor'
  AND p.config = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb
  AND a.meta = '{"owner":"GER-005","environment":"Test","synthetic":true}'::jsonb;

SELECT
  has_schema_privilege('authenticated','comind','USAGE') AS authenticated_private_schema_usage,
  has_table_privilege('authenticated','comind.cm_identity'::regclass,'SELECT') AS authenticated_identity_table_select,
  has_table_privilege('authenticated','comind.cm_epistemic_case'::regclass,'SELECT') AS authenticated_ger_case_select,
  has_table_privilege('comind_ger_runtime','comind.cm_epistemic_case'::regclass,'SELECT') AS constrained_ger_case_select;
