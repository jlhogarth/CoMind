#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-001 PIT verification}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261026_005_conversation_history_pit_diff.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chist_diff_login') THEN DROP ROLE chist_diff_login; END IF;
  CREATE ROLE chist_diff_login LOGIN PASSWORD 'diff-test-password'
    NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT comind_archive_ingestor TO chist_diff_login WITH INHERIT FALSE, SET TRUE;
END
$$;

INSERT INTO comind.cm_archive_source(source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata)
VALUES
 ('c2080001-0000-4000-8000-000000000601','chatgpt','baseline-real-shape.zip',repeat('4',64),4096,'{"pit_fixture":"baseline"}'),
 ('c2080001-0000-4000-8000-000000000701','chatgpt','comparison-real-shape.zip',repeat('5',64),4096,'{"pit_fixture":"comparison"}');

INSERT INTO comind.cm_archive_import(
 import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
 source_conversation_count,source_message_count,source_node_count,source_attachment_count,
 imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,
 parser_warning_count,parser_error_count,reconciliation,receipt,receipt_sha256
) VALUES
 ('c2080001-0000-4000-8000-000000000602','c2080001-0000-4000-8000-000000000601','chatgpt-export-v0.1.0','comind-archive-v1','PASS',
  '2026-10-01T00:00:00Z','2026-10-01T00:01:00Z',4,4,4,0,4,4,4,0,0,0,'{"countsMatch":true}','{"status":"PASS"}',repeat('6',64)),
 ('c2080001-0000-4000-8000-000000000702','c2080001-0000-4000-8000-000000000701','chatgpt-export-v0.1.0','comind-archive-v1','PASS',
  '2026-10-26T00:00:00Z','2026-10-26T00:01:00Z',4,4,4,0,4,4,4,0,0,0,'{"countsMatch":true}','{"status":"PASS"}',repeat('7',64));

-- A structural, B absent, D unchanged, E content-only change in baseline.
INSERT INTO comind.cm_archive_conversation_observation(
 import_id,source_conversation_id,title,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES
 ('c2080001-0000-4000-8000-000000000602','pit-A','Structural',repeat('1',64),repeat('1',64),repeat('a',64),1,1,0,'{"id":"pit-A"}'),
 ('c2080001-0000-4000-8000-000000000602','pit-B','Absent later',repeat('2',64),repeat('2',64),repeat('b',64),1,1,0,'{"id":"pit-B"}'),
 ('c2080001-0000-4000-8000-000000000602','pit-D','Unchanged',repeat('3',64),repeat('3',64),repeat('c',64),1,1,0,'{"id":"pit-D"}'),
 ('c2080001-0000-4000-8000-000000000602','pit-E','Content changed',repeat('4',64),repeat('4',64),repeat('d',64),1,1,0,'{"id":"pit-E"}');

-- A topology changes, C is new, D unchanged, E content changes with same topology.
INSERT INTO comind.cm_archive_conversation_observation(
 import_id,source_conversation_id,title,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES
 ('c2080001-0000-4000-8000-000000000702','pit-A','Structural',repeat('5',64),repeat('5',64),repeat('e',64),2,1,0,'{"id":"pit-A"}'),
 ('c2080001-0000-4000-8000-000000000702','pit-C','New later',repeat('6',64),repeat('6',64),repeat('f',64),1,1,0,'{"id":"pit-C"}'),
 ('c2080001-0000-4000-8000-000000000702','pit-D','Unchanged',repeat('3',64),repeat('3',64),repeat('c',64),1,1,0,'{"id":"pit-D"}'),
 ('c2080001-0000-4000-8000-000000000702','pit-E','Content changed',repeat('7',64),repeat('7',64),repeat('d',64),1,1,0,'{"id":"pit-E"}');

INSERT INTO comind.cm_conversation_history_baseline(
 baseline_id,import_id,source_archive_id,source_archive_sha256,certification_version,source_kind,
 certified_by,certification_reason,evidence,certification_sha256
) VALUES (
 'c2080001-0000-4000-8000-000000000603','c2080001-0000-4000-8000-000000000602','c2080001-0000-4000-8000-000000000601',repeat('4',64),
 'pit-test-cert-v1','native_openai_export','isolated-pit-test','PIT acceptance fixture only','{"synthetic":true}',repeat('8',64)
);
SQL

cd "${root}/server"
export CHATGPT_ARCHIVE_DATABASE_URL='postgresql://chist_diff_login:diff-test-password@localhost:5432/comind_ci'

node dist/archive/chatgpt-export-diff-cli.js --preflight > /tmp/chist_diff_preflight.json
node dist/archive/chatgpt-export-diff-cli.js c2080001-0000-4000-8000-000000000602 c2080001-0000-4000-8000-000000000702 > /tmp/chist_diff_first.json
node dist/archive/chatgpt-export-diff-cli.js c2080001-0000-4000-8000-000000000602 c2080001-0000-4000-8000-000000000702 > /tmp/chist_diff_second.json

python3 - <<'PY'
import json
pre=json.load(open('/tmp/chist_diff_preflight.json'))
first=json.load(open('/tmp/chist_diff_first.json'))
second=json.load(open('/tmp/chist_diff_second.json'))
assert pre['ok'] is True
assert pre['preflight']['currentUser']=='comind_archive_ingestor'
assert first['status']=='PASS'
assert first['reused'] is False and second['reused'] is True
assert first['diffReceiptId']==second['diffReceiptId']
assert first['receiptSha256']==second['receiptSha256']
assert first['observationCount']==5
expected={
 'unchanged':1,
 'content_changed':1,
 'structurally_changed':1,
 'new_in_comparison':1,
 'absent_in_comparison':1,
}
assert first['classificationCounts']==expected
print('CHIST-001 PIT five-way classification: PASS')
PY

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  receipt_count integer;
  detail_count integer;
  absence_semantics text;
BEGIN
  SELECT count(*) INTO receipt_count FROM comind.cm_archive_diff_receipt
   WHERE baseline_import_id='c2080001-0000-4000-8000-000000000602'::uuid
     AND comparison_import_id='c2080001-0000-4000-8000-000000000702'::uuid
     AND diff_version='chist-pit-diff-v1';
  IF receipt_count <> 1 THEN RAISE EXCEPTION 'expected one PIT receipt, got %',receipt_count; END IF;
  SELECT count(*) INTO detail_count FROM comind.cm_archive_diff_conversation_observation o
   JOIN comind.cm_archive_diff_receipt r USING(diff_receipt_id)
   WHERE r.baseline_import_id='c2080001-0000-4000-8000-000000000602'::uuid;
  IF detail_count <> 5 THEN RAISE EXCEPTION 'expected five PIT observations, got %',detail_count; END IF;
  SELECT evidence->>'epistemic_semantics' INTO absence_semantics
    FROM comind.cm_archive_diff_conversation_observation o
    JOIN comind.cm_archive_diff_receipt r USING(diff_receipt_id)
   WHERE r.baseline_import_id='c2080001-0000-4000-8000-000000000602'::uuid
     AND source_conversation_id='pit-B';
  IF absence_semantics NOT ILIKE '%does not establish deletion%' THEN
    RAISE EXCEPTION 'absence semantics failed to preserve non-deletion epistemic boundary';
  END IF;
END
$$;
SQL

echo 'CHIST-001 PIT diff acceptance: PASS'
