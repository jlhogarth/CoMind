#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CFR-001F verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost', '127.0.0.1', '::1', 'db') or p.path != '/comind_ci':
    print('Refusing CFR-001F verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

(
  cd "${root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_002_chatgpt_archive_quarantine.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_003_chatgpt_archive_access_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261025_007_native_chatgpt_live_reconciliation.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_role record;
  v_table text;
  v_api_role text;
  v_priv text;
BEGIN
  IF to_regclass('comind.cm_conversation_reconciliation_receipt') IS NULL
     OR to_regclass('comind.cm_conversation_reconciliation_candidate') IS NULL THEN
    RAISE EXCEPTION 'CFR-001F reconciliation tables are missing';
  END IF;

  SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO v_role
    FROM pg_roles
   WHERE rolname = 'comind_conversation_reconciler';
  IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
     OR v_role.rolcreaterole OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'Reconciler role is missing or over-privileged: %', row_to_json(v_role);
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation_reconciliation_receipt',
    'cm_conversation_reconciliation_candidate'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='comind' AND c.relname=v_table
         AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'Reconciliation table % is missing forced RLS', v_table;
    END IF;

    FOREACH v_api_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
        IF has_table_privilege(v_api_role, format('comind.%I',v_table), v_priv) THEN
          RAISE EXCEPTION 'Role % unexpectedly has % on reconciliation table %', v_api_role, v_priv, v_table;
        END IF;
      END LOOP;
    END LOOP;

    IF NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'SELECT')
       OR NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'INSERT')
       OR has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'DELETE')
       OR has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'TRUNCATE') THEN
      RAISE EXCEPTION 'Reconciler output privilege shape is incorrect for %', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation','cm_message','cm_conversation_capture_event','cm_assistant_generation',
    'cm_conversation_recovery_checkpoint','cm_archive_source','cm_archive_import',
    'cm_archive_conversation_observation','cm_archive_node_observation',
    'cm_archive_attachment_reference','cm_archive_parser_event','cm_archive_quarantine'
  ] LOOP
    IF NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'SELECT') THEN
      RAISE EXCEPTION 'Reconciler lacks source SELECT on %', v_table;
    END IF;
    IF has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'INSERT')
       OR has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_conversation_reconciler',format('comind.%I',v_table),'DELETE') THEN
      RAISE EXCEPTION 'Reconciler can mutate source table %', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege('comind_conversation_reconciler','comind.cm_reject_reconciliation_evidence_mutation()','EXECUTE') THEN
    RAISE EXCEPTION 'Reconciler can execute trigger helper directly';
  END IF;
END;
$$;
SQL

# Seed immutable source evidence as database owner. The reconciliation worker is
# intentionally unable to create or modify either source system.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO comind.cm_conversation (
  conv_id, source, title, external_ref, metadata, created_at
) VALUES (
  'f0010001-0000-4000-8000-000000000001',
  'native_chatgpt_live',
  'CFR-001F synthetic exact match',
  'native-conversation-1',
  '{"native_chatgpt_source_conversation_id":"native-conversation-1","source_system":"chatgpt"}'::jsonb,
  '2026-10-25T18:00:00Z'
);
INSERT INTO comind.cm_message (msg_id,conv_id,role,content,created_at) VALUES
  ('f0010001-0000-4000-8000-000000000011','f0010001-0000-4000-8000-000000000001','user','Preserve every consequential turn.','2026-10-25T18:00:00Z'),
  ('f0010001-0000-4000-8000-000000000012','f0010001-0000-4000-8000-000000000001','assistant','Capture first, interpret second.','2026-10-25T18:00:10Z');

INSERT INTO comind.cm_archive_source (
  source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata
) VALUES (
  'f0010001-0000-4000-8000-000000000101','chatgpt','cfr-001f-fixture.zip',repeat('1',64),100,'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,
  reconciliation,receipt,receipt_sha256
) VALUES (
  'f0010001-0000-4000-8000-000000000102','f0010001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,2,2,0,1,2,2,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('2',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,source_created_at,source_updated_at,created_at,updated_at,
  raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0010001-0000-4000-8000-000000000102','native-conversation-1','CFR-001F synthetic exact match',
  '1792941600'::jsonb,'1792941610'::jsonb,'2026-10-25T18:00:00Z','2026-10-25T18:00:10Z',
  repeat('3',64),repeat('4',64),repeat('5',64),2,2,0,
  '{"id":"native-conversation-1","mapping":{}}'::jsonb
);
SQL

SET_ROLE_SQL=$(cat <<'SQL'
SET ROLE comind_conversation_reconciler;
INSERT INTO comind.cm_conversation_reconciliation_receipt (
  reconciliation_id,import_id,source_conversation_id,reconciliation_version,
  archive_normalized_hash,archive_topology_hash,live_snapshot_cutoff,live_candidate_set_sha256,
  result,selected_conv_id,match_method,classification_counts,conflicts,unresolved,evidence,receipt_sha256
) VALUES (
  'f0010001-0000-4000-8000-000000000201',
  'f0010001-0000-4000-8000-000000000102','native-conversation-1','cfr-001f-v1',
  repeat('4',64),repeat('5',64),'2026-10-25T18:01:00Z',repeat('6',64),
  'exact_match','f0010001-0000-4000-8000-000000000001','explicit_source_id',
  '{"exact_candidate":1}'::jsonb,'[]'::jsonb,'[]'::jsonb,
  '{"synthetic":true,"source_mutated":false}'::jsonb,repeat('7',64)
);
INSERT INTO comind.cm_conversation_reconciliation_candidate (
  reconciliation_id,conv_id,candidate_rank,match_method,match_strength,classification,selected,evidence,candidate_sha256
) VALUES (
  'f0010001-0000-4000-8000-000000000201','f0010001-0000-4000-8000-000000000001',1,
  'explicit_source_id','strong','exact_candidate',true,'{"explicitIdentity":true}'::jsonb,repeat('8',64)
);
RESET ROLE;
SQL
)
printf '%s\n' "${SET_ROLE_SQL}" | psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE comind.cm_conversation_reconciliation_receipt
       SET result='compatible_extension'
     WHERE reconciliation_id='f0010001-0000-4000-8000-000000000201';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='conversation reconciliation evidence is immutable' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Receipt mutation was not blocked'; END IF;
END;
$$;

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    DELETE FROM comind.cm_conversation_reconciliation_candidate
     WHERE reconciliation_id='f0010001-0000-4000-8000-000000000201';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='conversation reconciliation evidence is immutable' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Candidate deletion was not blocked'; END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_conversation_reconciliation_receipt (
      import_id,source_conversation_id,reconciliation_version,archive_normalized_hash,archive_topology_hash,
      live_snapshot_cutoff,live_candidate_set_sha256,result,selected_conv_id,match_method,
      classification_counts,conflicts,unresolved,evidence,receipt_sha256
    ) VALUES (
      'f0010001-0000-4000-8000-000000000102','native-conversation-1','cfr-001f-v1',repeat('4',64),repeat('5',64),
      '2026-10-25T18:01:00Z',repeat('6',64),'exact_match','f0010001-0000-4000-8000-000000000001','explicit_source_id',
      '{}'::jsonb,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,repeat('9',64)
    );
    RAISE EXCEPTION 'Duplicate immutable input tuple unexpectedly created a second receipt';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

SELECT CASE WHEN
  (SELECT count(*) FROM comind.cm_conversation_reconciliation_receipt) = 1
  AND (SELECT count(*) FROM comind.cm_conversation_reconciliation_candidate) = 1
  AND (SELECT count(*) FROM comind.cm_message WHERE conv_id='f0010001-0000-4000-8000-000000000001') = 2
  AND (SELECT count(*) FROM comind.cm_archive_conversation_observation WHERE import_id='f0010001-0000-4000-8000-000000000102') = 1
THEN 'PASS' ELSE 'FAIL' END AS cfr_001f_reconciliation_substrate;
SQL
