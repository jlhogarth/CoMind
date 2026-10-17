#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated LF-3 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('LF-3 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing LF-3 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

python3 "${repository_root}/scripts/verify_live_foundry_lf3_manifest.py"

# Reproduce the accepted LF-2 governed substrate without migration 007.
bash "${repository_root}/scripts/test_live_foundry_lf2_agent_substrate.sh"

# The current canonical base contains the Issue #78 conversation fast-path table
# cm_assistant_generation and already removes the old broad conversation/document
# policies. The accepted live initial build predates that repository-only change:
# live has no cm_assistant_generation and still has twelve unconditional policies.
# Normalize only this disposable database back to the exact accepted live LF-2
# pre-007 shape so migration 007 is tested against what would actually be deployed.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS comind.cm_assistant_generation CASCADE;

DROP POLICY IF EXISTS conv_modify_own ON comind.cm_conversation;
DROP POLICY IF EXISTS conv_select_all ON comind.cm_conversation;
DROP POLICY IF EXISTS conv_update_own ON comind.cm_conversation;
DROP POLICY IF EXISTS doc_modify_all ON comind.cm_doc;
DROP POLICY IF EXISTS doc_select_all ON comind.cm_doc;
DROP POLICY IF EXISTS doc_update_all ON comind.cm_doc;
DROP POLICY IF EXISTS chunk_modify_all ON comind.cm_doc_chunk;
DROP POLICY IF EXISTS chunk_select_all ON comind.cm_doc_chunk;
DROP POLICY IF EXISTS chunk_update_all ON comind.cm_doc_chunk;
DROP POLICY IF EXISTS msg_modify_all ON comind.cm_message;
DROP POLICY IF EXISTS msg_select_all ON comind.cm_message;
DROP POLICY IF EXISTS msg_update_all ON comind.cm_message;

CREATE POLICY conv_modify_own ON comind.cm_conversation FOR INSERT WITH CHECK (true);
CREATE POLICY conv_select_all ON comind.cm_conversation FOR SELECT USING (true);
CREATE POLICY conv_update_own ON comind.cm_conversation FOR UPDATE USING (true);
CREATE POLICY doc_modify_all ON comind.cm_doc FOR INSERT WITH CHECK (true);
CREATE POLICY doc_select_all ON comind.cm_doc FOR SELECT USING (true);
CREATE POLICY doc_update_all ON comind.cm_doc FOR UPDATE USING (true);
CREATE POLICY chunk_modify_all ON comind.cm_doc_chunk FOR INSERT WITH CHECK (true);
CREATE POLICY chunk_select_all ON comind.cm_doc_chunk FOR SELECT USING (true);
CREATE POLICY chunk_update_all ON comind.cm_doc_chunk FOR UPDATE USING (true);
CREATE POLICY msg_modify_all ON comind.cm_message FOR INSERT WITH CHECK (true);
CREATE POLICY msg_select_all ON comind.cm_message FOR SELECT USING (true);
CREATE POLICY msg_update_all ON comind.cm_message FOR UPDATE USING (true);
SQL

# Prove that the disposable fixture now matches the security shape migration 007
# is expected to transform. These are structural gates, not live deployment gates.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
    v_tables bigint;
    v_rls bigint;
    v_policies bigint;
    v_mutable bigint;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity)
      INTO v_tables, v_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relkind IN ('r','p');
    IF v_tables <> 94 OR v_rls <> 19 THEN
        RAISE EXCEPTION 'LF-3 isolated pre-shape drifted: tables %, RLS %', v_tables, v_rls;
    END IF;

    SELECT count(*) INTO v_policies
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind';
    IF v_policies <> 12 THEN
        RAISE EXCEPTION 'LF-3 isolated pre-shape policy count drifted: %', v_policies;
    END IF;

    SELECT count(*) INTO v_mutable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='comind'
       AND NOT EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) s(setting)
           WHERE setting LIKE 'search_path=%'
       );
    IF v_mutable <> 7 THEN
        RAISE EXCEPTION 'LF-3 isolated pre-shape mutable search-path count drifted: %', v_mutable;
    END IF;
END;
$$;
SQL

# Apply the exact reviewed migration twice to prove idempotent security behavior.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_007_foundry_security_prerequisites.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_007_foundry_security_prerequisites.sql"

security_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_007_foundry_security_prerequisites.sql")"
if [[ "${security_output%%|*}" != "pass" ]]; then
  echo "LF-3 generic migration 007 verification failed: ${security_output}" >&2
  exit 1
fi

# Migration 007 must preserve the accepted LF-2 service-role grant boundary.
service_role_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/verify_live_foundry_lf2_service_role.sql")"
if [[ "${service_role_output%%|*}" != "pass" ]]; then
  echo "LF-3 changed LF-2 service_role behavior: ${service_role_output}" >&2
  exit 1
fi

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
    v_tables bigint;
    v_rls bigint;
    v_policies bigint;
    v_fixed bigint;
    v_select bigint;
    v_insert bigint;
    v_update bigint;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity)
      INTO v_tables, v_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relkind IN ('r','p');
    IF v_tables <> 94 OR v_rls <> 94 THEN
        RAISE EXCEPTION 'LF-3 post-shape RLS coverage failed: tables %, RLS %', v_tables, v_rls;
    END IF;

    SELECT count(*) INTO v_policies
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind';
    IF v_policies <> 0 THEN
        RAISE EXCEPTION 'LF-3 expected zero comind policies after migration 007, found %', v_policies;
    END IF;

    SELECT count(*) INTO v_fixed
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='comind'
       AND p.proname IN ('set_updated_at','fn_belief_update_beta','fn_create_causal_node_from_memory','set_current_actor','current_actor','set_updated_at_checklist','set_updated_at_research_refs')
       AND EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) s(setting)
           WHERE setting='search_path=comind, public, pg_temp'
       );
    IF v_fixed <> 7 THEN
        RAISE EXCEPTION 'LF-3 target function search-path hardening incomplete: %', v_fixed;
    END IF;

    SELECT
        count(*) FILTER (WHERE has_table_privilege('service_role',c.oid,'SELECT')),
        count(*) FILTER (WHERE has_table_privilege('service_role',c.oid,'INSERT')),
        count(*) FILTER (WHERE has_table_privilege('service_role',c.oid,'UPDATE'))
      INTO v_select, v_insert, v_update
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relkind IN ('r','p');
    IF v_select <> 15 OR v_insert <> 15 OR v_update <> 0 THEN
        RAISE EXCEPTION 'LF-3 service_role table privilege drift: select %, insert %, update %', v_select, v_insert, v_update;
    END IF;

    IF (SELECT count(*) FROM comind.cm_agent) <> 0
       OR (SELECT count(*) FROM comind.cm_agent_run) <> 0
       OR (SELECT count(*) FROM comind_pm.pm_agent_runs) <> 0 THEN
        RAISE EXCEPTION 'LF-3 verification created Agent execution evidence';
    END IF;

    IF to_regclass('comind.cm_foundry_adapter_operation_result') IS NOT NULL
       OR to_regclass('comind.cm_foundry_execution_outcome') IS NOT NULL THEN
        RAISE EXCEPTION 'LF-3 verification crossed into migration 008';
    END IF;
END;
$$;
SQL

# Add only disposable boundaries needed to evaluate the exact live postdeploy SQL.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.operator_console_relation_registry (
    schema_name text NOT NULL,
    relation_name text NOT NULL,
    browser_read boolean NOT NULL,
    admin_insert boolean NOT NULL,
    admin_update boolean NOT NULL,
    admin_delete boolean NOT NULL,
    destructive_allowed boolean NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (schema_name, relation_name)
);
INSERT INTO public.operator_console_relation_registry (
    schema_name, relation_name, browser_read, admin_insert, admin_update,
    admin_delete, destructive_allowed, enabled
) VALUES
    ('public','comments',true,true,true,false,false,true),
    ('public','operator_console_verification_records',false,true,true,true,true,true),
    ('public','posts',true,true,true,false,false,true),
    ('public','users',true,true,true,false,false,true)
ON CONFLICT (schema_name, relation_name) DO UPDATE SET
    browser_read=EXCLUDED.browser_read,
    admin_insert=EXCLUDED.admin_insert,
    admin_update=EXCLUDED.admin_update,
    admin_delete=EXCLUDED.admin_delete,
    destructive_allowed=EXCLUDED.destructive_allowed,
    enabled=EXCLUDED.enabled;

TRUNCATE supabase_migrations.schema_migrations;
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
('20261005213616','comind_base_v2_initial_build'),
('20261006051527','comind_pm_ledger_maintenance_package_v0_1'),
('20261006051627','comind_pm_ledger_hardening_v0_1_1'),
('20261015211851','operator_console_live_activation_v0_2'),
('20261015212201','operator_console_service_role_least_privilege_v0_2_1'),
('20261015212719','operator_console_explicit_deny_policies_v0_2_2'),
('20261016031254','live_foundry_stage1_finops_current_runtime_projection_v1'),
('20261016031412','live_foundry_stage1_paid_provider_budget_authority_hardening_v1'),
('20261016031511','live_foundry_stage1_current_runtime_budget_authority_adapter_v1'),
('20261016031947','live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1'),
('20261016032259','live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1'),
('20261016032328','live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1'),
('20261017002923','live_foundry_lf2_agent_substrate_v1'),
('20990101000000','live_foundry_lf3_security_prerequisites_v1');
SQL

contract_output="$(psql "${DATABASE_URL}" -X -q -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_lf3_postdeploy.sql")"
CONTRACT_OUTPUT="${contract_output}" python3 <<'PY'
import json
import os
import sys

payload = json.loads(os.environ['CONTRACT_OUTPUT'].strip())
checks = payload.get('checks')
if not isinstance(checks, dict):
    print('LF-3 postdeploy contract did not return checks.', file=sys.stderr)
    raise SystemExit(1)

# These gates bind the actual Supabase production database or its current public
# Advisor proxy shape and are intentionally allowed to differ in comind_ci.
allowed_fixture_differences = {
    'database_ok',
    'server_version_ok',
    'expected_rls_no_policy_catalog_shape_ok',
}
failed = sorted(k for k,v in checks.items() if v is not True and k not in allowed_fixture_differences)
if failed:
    print('LF-3 portable postdeploy gates failed: ' + ', '.join(failed), file=sys.stderr)
    raise SystemExit(1)
missing = sorted(k for k in allowed_fixture_differences if k not in checks)
if missing:
    print('LF-3 contract missing production-specific gates: ' + ', '.join(missing), file=sys.stderr)
    raise SystemExit(1)
print('LF-3 exact postdeploy SQL evaluated successfully in isolated production shape.')
PY

printf 'LF-3 isolated readiness passed: %s; %s\n' "${security_output}" "${service_role_output}"
