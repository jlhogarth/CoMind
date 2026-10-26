#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CFR-001G verification}"
: "${DERIVATION_WORKER_DATABASE_URL:?DERIVATION_WORKER_DATABASE_URL required}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CFR-001G verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

(
  cd "${root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cfr_001g_worker') THEN
    DROP ROLE cfr_001g_worker;
  END IF;
  CREATE ROLE cfr_001g_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'cfr001g-local-only';
  GRANT comind_conversation_deriver TO cfr_001g_worker WITH INHERIT FALSE, SET TRUE;
END
$$;

DO $$
DECLARE v_role record; v_table text;
BEGIN
  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  INTO v_role FROM pg_roles WHERE rolname='comind_conversation_deriver';
  IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolinherit OR v_role.rolsuper OR v_role.rolcreatedb
     OR v_role.rolcreaterole OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'Deriver role missing or over-privileged: %', row_to_json(v_role);
  END IF;
  FOREACH v_table IN ARRAY ARRAY['cm_conversation_derivation_run','cm_conversation_derivation','cm_conversation_promotion_candidate'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='comind' AND c.relname=v_table AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'Derivation evidence table % lacks forced RLS', v_table; END IF;
    IF NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'SELECT')
       OR NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'INSERT')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'DELETE') THEN
      RAISE EXCEPTION 'Derivation evidence privilege shape invalid for %', v_table;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['cm_conversation','cm_message','cm_assistant_generation','cm_conversation_capture_event','cm_conversation_recovery_checkpoint'] LOOP
    IF NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'SELECT')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'INSERT')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'DELETE') THEN
      RAISE EXCEPTION 'Source privilege shape invalid for %', v_table;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['cm_message_analytics','cm_conversation_analytics'] LOOP
    IF NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'SELECT')
       OR NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'INSERT')
       OR NOT has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_conversation_deriver',format('comind.%I',v_table),'DELETE') THEN
      RAISE EXCEPTION 'Projection privilege shape invalid for %', v_table;
    END IF;
  END LOOP;
END
$$;
SQL

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/verification/cfr_001g_execution_fixture.sql"

export COMIND_DATABASE_PURPOSE=conversation_derivation
export CONVERSATION_DERIVATION_DATABASE_URL="${DERIVATION_WORKER_DATABASE_URL}"

node "${root}/server/dist/analytics/conversation-derive-cli.js" --preflight-only >/tmp/cfr001g-preflight.json
node "${root}/server/dist/analytics/conversation-derive-cli.js" --conversation-id 71000000-0000-4000-8000-000000000001 >/tmp/cfr001g-first.json
node "${root}/server/dist/analytics/conversation-derive-cli.js" --conversation-id 71000000-0000-4000-8000-000000000001 >/tmp/cfr001g-second.json

python3 - <<'PY'
import json
pre = json.load(open('/tmp/cfr001g-preflight.json'))
first = json.load(open('/tmp/cfr001g-first.json'))
second = json.load(open('/tmp/cfr001g-second.json'))
assert pre['ok'] is True
assert first['ok'] is True and second['ok'] is True
assert first['result']['reusedExistingRun'] is False
assert second['result']['reusedExistingRun'] is True
assert first['result']['derivationRunId'] == second['result']['derivationRunId']
assert first['result']['runIdentitySha256'] == second['result']['runIdentitySha256']
assert first['result']['derivationCount'] > 0
assert first['result']['promotionCandidateCount'] > 0
assert first['result']['interruptedPartialCount'] == 1
print('CFR-001G governed CLI idempotency: PASS')
PY

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE comind.cm_conversation_derivation SET value_text='mutated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable derivation evidence%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Derivation UPDATE was not blocked'; END IF;
END
$$;
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    DELETE FROM comind.cm_conversation_promotion_candidate;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable derivation evidence%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Promotion candidate DELETE was not blocked'; END IF;
END
$$;

DO $$
DECLARE
  v_runs bigint; v_partials bigint; v_unresolved bigint; v_candidates bigint;
  v_message_projection bigint; v_conversation_projection bigint; v_memory bigint;
BEGIN
  SELECT count(*) INTO v_runs FROM comind.cm_conversation_derivation_run WHERE conv_id='71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_partials FROM comind.cm_conversation_derivation WHERE conv_id='71000000-0000-4000-8000-000000000001' AND source_kind='live_partial';
  SELECT count(*) INTO v_unresolved FROM comind.cm_conversation_derivation WHERE conv_id='71000000-0000-4000-8000-000000000001' AND derivation_kind='unresolved_thread';
  SELECT count(*) INTO v_candidates FROM comind.cm_conversation_promotion_candidate WHERE conv_id='71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_message_projection FROM comind.cm_message_analytics ma JOIN comind.cm_message m ON m.msg_id=ma.msg_id WHERE m.conv_id='71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_conversation_projection FROM comind.cm_conversation_analytics WHERE conv_id='71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_memory FROM comind.cm_memory_node;
  IF v_runs <> 1 OR v_partials < 1 OR v_unresolved < 1 OR v_candidates < 1
     OR v_message_projection <> 3 OR v_conversation_projection <> 1 OR v_memory <> 0 THEN
    RAISE EXCEPTION 'CFR-001G acceptance failed runs=% partials=% unresolved=% candidates=% msg_projection=% conv_projection=% memory=%',
      v_runs,v_partials,v_unresolved,v_candidates,v_message_projection,v_conversation_projection,v_memory;
  END IF;
  IF EXISTS (SELECT 1 FROM comind.cm_message_analytics WHERE sentiment IS NOT NULL) THEN
    RAISE EXCEPTION 'CFR-001G deterministic projection must not invent sentiment';
  END IF;
END
$$;

SELECT 'PASS' AS cfr_001g_governed_derivation;
SQL
