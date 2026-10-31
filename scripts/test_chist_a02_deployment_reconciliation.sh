#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-A02 reconciliation verification}"

# First prove migration 011 and all A02 functional/security acceptance behavior.
bash "${root}/scripts/test_chist_a02_sessionization.sh"

# Then apply the reviewed forward reconciliation that establishes the canonical
# function end state after the non-byte-identical initial Test execution rendering.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_012_conversation_history_sessionization_deployment_reconciliation.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_compute text;
  v_local text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_compute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='comind'
     AND p.proname='cm_compute_archive_sessions'
     AND pg_get_function_identity_arguments(p.oid)='p_import_id uuid, p_policy_key text, p_policy_version text';

  IF v_compute IS NULL THEN
    RAISE EXCEPTION 'CHIST-A02 canonical compute function is absent after migration 012';
  END IF;
  IF position('coalesce(p.normalized_message_hash::text,'''')' in v_compute)=0 THEN
    RAISE EXCEPTION 'CHIST-A02 compute function lacks canonical explicit normalized_message_hash::text identity form';
  END IF;
  IF position('SET search_path TO ''pg_catalog'', ''comind'', ''extensions''' in v_compute)=0 THEN
    RAISE EXCEPTION 'CHIST-A02 compute function search_path drifted';
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_local
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='comind'
     AND p.proname='cm_archive_local_hour_distribution'
     AND pg_get_function_identity_arguments(p.oid)='p_sessionization_run_id uuid, p_timezone text';

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'CHIST-A02 canonical local-hour function is absent after migration 012';
  END IF;
  IF position('ORDER BY 2;' in v_local)=0 THEN
    RAISE EXCEPTION 'CHIST-A02 local-hour projection lacks canonical positional ordering';
  END IF;
  IF position('SET search_path TO ''pg_catalog'', ''comind''' in v_local)=0 THEN
    RAISE EXCEPTION 'CHIST-A02 local-hour function search_path drifted';
  END IF;

  IF has_function_privilege('public','comind.cm_compute_archive_sessions(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly gained session calculator execution during reconciliation';
  END IF;
  IF has_function_privilege('comind_conversation_history_reader','comind.cm_compute_archive_sessions(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'History reader unexpectedly gained session calculator execution during reconciliation';
  END IF;
  IF NOT has_function_privilege('comind_conversation_history_deriver','comind.cm_compute_archive_sessions(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'History deriver lost session calculator execution during reconciliation';
  END IF;
  IF NOT has_function_privilege('comind_conversation_history_reader','comind.cm_archive_local_hour_distribution(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'History reader lost local-hour projection execution during reconciliation';
  END IF;
END
$$;
SQL

echo 'CHIST-A02 forward deployment reconciliation acceptance: PASS'
