#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-A02 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CHIST-A02 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

# Establish the accepted CHIST + A01 schema and security boundary first.
bash "${root}/scripts/test_chist_a01_personal_analytics_fk_index.sh"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_011_conversation_history_sessionization.sql"

# Dedicated synthetic import: three conversations, seven timestamped messages,
# one untimestamped message, an exact 30-minute boundary, a 31-minute boundary,
# and two cross-conversation messages sharing the exact same timestamp.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_source_id uuid := 'a2350001-0000-4000-8000-000000000001';
  v_import_id uuid := 'a2350001-0000-4000-8000-000000000002';
  v_baseline_id uuid := 'a2350001-0000-4000-8000-000000000003';
  v_source_sha char(64) := encode(extensions.digest('chist-a02-multiconversation-source','sha256'),'hex');
  v_receipt jsonb := '{"synthetic":"chist-a02","purpose":"sessionization-acceptance"}'::jsonb;
  v_receipt_sha char(64);
BEGIN
  v_receipt_sha := encode(extensions.digest(v_receipt::text,'sha256'),'hex');

  INSERT INTO comind.cm_archive_source(
    source_archive_id,source_system,source_archive_name,source_archive_sha256,
    source_archive_bytes,source_uri,source_metadata
  ) VALUES (
    v_source_id,'chatgpt','chist-a02-synthetic.zip',v_source_sha,
    1,'synthetic://chist-a02','{"fixture":true}'::jsonb
  );

  INSERT INTO comind.cm_archive_import(
    import_id,source_archive_id,parser_version,schema_version,status,started_at
  ) VALUES (
    v_import_id,v_source_id,'chist-a02-fixture-v1','chatgpt-export-fixture-v1','PENDING','2026-10-26T09:59:00Z'
  );

  INSERT INTO comind.cm_archive_conversation_observation(
    import_id,source_conversation_id,title,created_at,updated_at,
    raw_source_hash,normalized_hash,topology_hash,node_count,message_count,
    attachment_reference_count,raw_conversation
  ) VALUES
  (v_import_id,'conv-a','A','2026-10-26T10:00:00Z','2026-10-26T10:39:59Z',
    encode(extensions.digest('conv-a-raw','sha256'),'hex'),encode(extensions.digest('conv-a-normalized','sha256'),'hex'),encode(extensions.digest('conv-a-topology','sha256'),'hex'),3,3,0,'{"id":"conv-a"}'::jsonb),
  (v_import_id,'conv-b','B','2026-10-26T11:09:59Z','2026-10-26T11:14:59Z',
    encode(extensions.digest('conv-b-raw','sha256'),'hex'),encode(extensions.digest('conv-b-normalized','sha256'),'hex'),encode(extensions.digest('conv-b-topology','sha256'),'hex'),2,2,0,'{"id":"conv-b"}'::jsonb),
  (v_import_id,'conv-c','C','2026-10-26T11:14:59Z','2026-10-26T11:45:59Z',
    encode(extensions.digest('conv-c-raw','sha256'),'hex'),encode(extensions.digest('conv-c-normalized','sha256'),'hex'),encode(extensions.digest('conv-c-topology','sha256'),'hex'),3,3,0,'{"id":"conv-c"}'::jsonb);

  INSERT INTO comind.cm_archive_node_observation(
    import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,
    source_message_id,role,created_at,content_type,raw_node_hash,normalized_message_hash,raw_node
  ) VALUES
  (v_import_id,'conv-a','a1',NULL,'["a2"]','ma1','user','2026-10-26T10:00:00Z','text',
    encode(extensions.digest('a1-raw','sha256'),'hex'),encode(extensions.digest('ma1-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["A1"]}}}'::jsonb),
  (v_import_id,'conv-a','a2','a1','["a3"]','ma2','assistant','2026-10-26T10:10:00Z','text',
    encode(extensions.digest('a2-raw','sha256'),'hex'),encode(extensions.digest('ma2-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["A2"]}}}'::jsonb),
  (v_import_id,'conv-a','a3','a2','[]','ma3','user','2026-10-26T10:39:59Z','text',
    encode(extensions.digest('a3-raw','sha256'),'hex'),encode(extensions.digest('ma3-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["A3"]}}}'::jsonb),
  (v_import_id,'conv-b','b1',NULL,'["b2"]','mb1','assistant','2026-10-26T11:09:59Z','text',
    encode(extensions.digest('b1-raw','sha256'),'hex'),encode(extensions.digest('mb1-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["B1"]}}}'::jsonb),
  (v_import_id,'conv-b','b2','b1','[]','mb2','user','2026-10-26T11:14:59Z','text',
    encode(extensions.digest('b2-raw','sha256'),'hex'),encode(extensions.digest('mb2-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["B2"]}}}'::jsonb),
  (v_import_id,'conv-c','c1',NULL,'["c2"]','mc1','assistant','2026-10-26T11:14:59Z','text',
    encode(extensions.digest('c1-raw','sha256'),'hex'),encode(extensions.digest('mc1-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["C1"]}}}'::jsonb),
  (v_import_id,'conv-c','c2','c1','["c3"]','mc2','user','2026-10-26T11:45:59Z','text',
    encode(extensions.digest('c2-raw','sha256'),'hex'),encode(extensions.digest('mc2-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["C2"]}}}'::jsonb),
  (v_import_id,'conv-c','c3','c2','[]','mc3','assistant',NULL,'text',
    encode(extensions.digest('c3-raw','sha256'),'hex'),encode(extensions.digest('mc3-normalized','sha256'),'hex'),'{"message":{"content":{"parts":["C3 untimestamped"]}}}'::jsonb);

  UPDATE comind.cm_archive_import
  SET status='PASS',
      completed_at='2026-10-26T12:00:00Z',
      source_conversation_count=3,source_message_count=8,source_node_count=8,source_attachment_count=0,
      imported_conversation_count=3,imported_message_count=8,imported_node_count=8,imported_attachment_count=0,
      reconciliation='{"synthetic":true}'::jsonb,
      receipt=v_receipt,
      receipt_sha256=v_receipt_sha
  WHERE import_id=v_import_id;

  INSERT INTO comind.cm_conversation_history_baseline(
    baseline_id,import_id,source_archive_id,source_archive_sha256,
    certification_version,source_kind,certified_by,certification_reason,evidence,certification_sha256,certified_at
  ) VALUES (
    v_baseline_id,v_import_id,v_source_id,v_source_sha,
    'chist-a02-fixture-cert-v1','native_openai_export','chist-a02-test',
    'Synthetic multi-conversation sessionization acceptance fixture.',
    '{"synthetic":true}'::jsonb,
    encode(extensions.digest(concat_ws('|',v_import_id::text,v_source_sha,'chist-a02-fixture-cert-v1'),'sha256'),'hex'),
    '2026-10-26T12:01:00Z'
  );
END
$$;
SQL

import_id='a2350001-0000-4000-8000-000000000002'

# The constrained derivation role, not the test owner, creates sessionization evidence.
run30="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'UTC';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_sessions('${import_id}'::uuid,'session_gap','30m-v1');
SQL
)"
[[ -n "$run30" ]] || { echo '30-minute sessionization returned no run id' >&2; exit 1; }

# Idempotent repeat under a different database session timezone must return the same run.
run30_again="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'America/Indiana/Indianapolis';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_sessions('${import_id}'::uuid,'session_gap','30m-v1');
SQL
)"
[[ "$run30_again" == "$run30" ]] || { echo '30-minute sessionization was not idempotent across session timezone' >&2; exit 1; }

run60="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'UTC';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_sessions('${import_id}'::uuid,'session_gap','60m-v1');
SQL
)"
[[ -n "$run60" && "$run60" != "$run30" ]] || { echo '60-minute comparison policy did not produce a distinct run' >&2; exit 1; }

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  v_count bigint;
  v_text text;
BEGIN
  SELECT count(*) INTO v_count FROM comind.cm_archive_session_policy;
  IF v_count <> 3 THEN RAISE EXCEPTION 'expected 3 session policies, got %',v_count; END IF;
  SELECT count(*) INTO v_count FROM comind.cm_archive_session_policy WHERE is_reference;
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected one reference session policy, got %',v_count; END IF;

  IF (SELECT source_message_count FROM comind.cm_archive_sessionization_run WHERE sessionization_run_id='${run30}'::uuid) <> 8 THEN RAISE EXCEPTION 'source_message_count mismatch'; END IF;
  IF (SELECT source_event_count FROM comind.cm_archive_sessionization_run WHERE sessionization_run_id='${run30}'::uuid) <> 7 THEN RAISE EXCEPTION 'source_event_count mismatch'; END IF;
  IF (SELECT excluded_untimestamped_message_count FROM comind.cm_archive_sessionization_run WHERE sessionization_run_id='${run30}'::uuid) <> 1 THEN RAISE EXCEPTION 'untimestamped coverage mismatch'; END IF;

  SELECT count(*) INTO v_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid;
  IF v_count <> 3 THEN RAISE EXCEPTION '30-minute policy expected 3 sessions, got %',v_count; END IF;

  IF (SELECT event_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=1) <> 3 THEN RAISE EXCEPTION 'session 1 event count mismatch'; END IF;
  IF (SELECT span_seconds FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=1) <> 2399 THEN RAISE EXCEPTION 'session 1 span mismatch'; END IF;
  IF (SELECT opening_gap_seconds FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=2) <> 1800 THEN RAISE EXCEPTION 'exact 30-minute boundary did not start session 2'; END IF;
  IF (SELECT event_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=2) <> 3 THEN RAISE EXCEPTION 'session 2 event count mismatch'; END IF;
  IF (SELECT conversation_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=2) <> 2 THEN RAISE EXCEPTION 'session 2 cross-conversation count mismatch'; END IF;
  IF (SELECT opening_gap_seconds FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid AND session_ordinal=3) <> 1860 THEN RAISE EXCEPTION '31-minute boundary did not start session 3'; END IF;

  SELECT string_agg(source_conversation_id || ':' || source_node_id,',' ORDER BY event_ordinal)
    INTO v_text
  FROM comind.cm_archive_session_event
  WHERE sessionization_run_id='${run30}'::uuid;
  IF v_text <> 'conv-a:a1,conv-a:a2,conv-a:a3,conv-b:b1,conv-b:b2,conv-c:c1,conv-c:c2' THEN
    RAISE EXCEPTION 'deterministic event ordering mismatch: %',v_text;
  END IF;

  SELECT count(*) INTO v_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run60}'::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION '60-minute policy expected one session, got %',v_count; END IF;
  IF (SELECT event_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run60}'::uuid AND session_ordinal=1) <> 7 THEN RAISE EXCEPTION '60-minute session event count mismatch'; END IF;
  IF (SELECT conversation_count FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run60}'::uuid AND session_ordinal=1) <> 3 THEN RAISE EXCEPTION '60-minute session conversation count mismatch'; END IF;
  IF (SELECT span_seconds FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run60}'::uuid AND session_ordinal=1) <> 6359 THEN RAISE EXCEPTION '60-minute session span mismatch'; END IF;

  SELECT count(*) INTO v_count FROM comind.cm_archive_temporal_rollup WHERE sessionization_run_id='${run30}'::uuid;
  IF v_count <> 5 THEN RAISE EXCEPTION 'expected 5 UTC rollup rows, got %',v_count; END IF;
  IF (SELECT event_count FROM comind.cm_archive_temporal_rollup WHERE sessionization_run_id='${run30}'::uuid AND grain='hour_utc' AND bucket_start_utc='2026-10-26T10:00:00Z') <> 3 THEN RAISE EXCEPTION '10 UTC rollup mismatch'; END IF;
  IF (SELECT event_count FROM comind.cm_archive_temporal_rollup WHERE sessionization_run_id='${run30}'::uuid AND grain='hour_utc' AND bucket_start_utc='2026-10-26T11:00:00Z') <> 4 THEN RAISE EXCEPTION '11 UTC rollup mismatch'; END IF;
  IF (SELECT session_count FROM comind.cm_archive_temporal_rollup WHERE sessionization_run_id='${run30}'::uuid AND grain='hour_utc' AND bucket_start_utc='2026-10-26T11:00:00Z') <> 2 THEN RAISE EXCEPTION '11 UTC session count mismatch'; END IF;
END
\$\$;
SQL

# Explicit user-local clock-hour projection. At this date Indianapolis is UTC-4,
# so the 10:xx UTC events project to hour 6 and 11:xx UTC events to hour 7.
local_distribution="$(PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -At -F '|' -v ON_ERROR_STOP=1 <<SQL
SET ROLE comind_conversation_history_reader;
SELECT local_hour,event_count
FROM comind.cm_archive_local_hour_distribution('${run30}'::uuid,'America/Indiana/Indianapolis')
ORDER BY local_hour;
SQL
)"
printf '%s\n' "$local_distribution" | grep -q '^6|3$' || { echo 'local hour 6 projection mismatch' >&2; exit 1; }
printf '%s\n' "$local_distribution" | grep -q '^7|4$' || { echo 'local hour 7 projection mismatch' >&2; exit 1; }

# Reader can inspect certified session evidence but cannot mutate it.
reader_sessions="$(PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_reader;
SELECT count(*) FROM comind.cm_archive_session_observation WHERE sessionization_run_id='${run30}'::uuid;
SQL
)"
[[ "$reader_sessions" == '3' ]] || { echo "history reader expected 3 sessions, got $reader_sessions" >&2; exit 1; }

if PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_reader; UPDATE comind.cm_archive_session_observation SET event_count=999 WHERE sessionization_run_id='${run30}'::uuid;" >/tmp/chist_a02_reader_mutation.out 2>&1; then
  echo 'History reader unexpectedly mutated session evidence.' >&2
  exit 1
fi

# Deriver can invoke the calculator but has no direct INSERT authority.
if PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_deriver; INSERT INTO comind.cm_archive_session_observation(sessionization_run_id,import_id,session_ordinal,session_identity_sha256,started_at,ended_at,span_seconds,event_count,conversation_count,user_message_count,assistant_message_count,system_message_count,tool_message_count,first_source_conversation_id,first_source_node_id,first_source_message_id,last_source_conversation_id,last_source_node_id,last_source_message_id) VALUES ('${run30}','${import_id}',99,repeat('9',64),now(),now(),0,1,1,1,0,0,0,'x','x','x','x','x','x');" >/tmp/chist_a02_deriver_insert.out 2>&1; then
  echo 'History deriver unexpectedly inserted session evidence directly.' >&2
  exit 1
fi

# A technically PASS but uncertified import must remain ineligible.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_source uuid := 'a2350001-0000-4000-8000-000000000010';
  v_import uuid := 'a2350001-0000-4000-8000-000000000011';
  v_sha char(64) := encode(extensions.digest('chist-a02-uncertified','sha256'),'hex');
  v_receipt jsonb := '{"synthetic":"uncertified"}'::jsonb;
BEGIN
  INSERT INTO comind.cm_archive_source(source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes)
  VALUES(v_source,'chatgpt','uncertified.zip',v_sha,1);
  INSERT INTO comind.cm_archive_import(import_id,source_archive_id,parser_version,schema_version,status)
  VALUES(v_import,v_source,'fixture','fixture','PENDING');
  UPDATE comind.cm_archive_import
  SET status='PASS',completed_at=now(),receipt=v_receipt,receipt_sha256=encode(extensions.digest(v_receipt::text,'sha256'),'hex')
  WHERE import_id=v_import;
END
$$;
SQL

if PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_deriver; SELECT comind.cm_compute_archive_sessions('a2350001-0000-4000-8000-000000000011'::uuid,'session_gap','30m-v1');" >/tmp/chist_a02_uncertified.out 2>&1; then
  echo 'Uncertified PASS import unexpectedly produced session evidence.' >&2
  exit 1
fi

# Ordinary Data API roles remain outside private Conversation History session evidence.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_role text;
DECLARE v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      FOREACH v_table IN ARRAY ARRAY[
        'cm_archive_sessionization_run','cm_archive_session_observation',
        'cm_archive_session_event','cm_archive_temporal_rollup'
      ] LOOP
        IF has_table_privilege(v_role,'comind.' || v_table,'SELECT') THEN
          RAISE EXCEPTION 'role % unexpectedly has SELECT on comind.%',v_role,v_table;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END
$$;
SQL

echo 'CHIST-A02 deterministic sessionization and temporal rollup acceptance: PASS'
