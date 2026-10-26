#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-A01 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CHIST-A01 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

# Reuse the already accepted CHIST source, certification, and archive-derivation fixtures.
bash "${root}/scripts/test_chist_001_conversation_history.sh"
bash "${root}/scripts/test_chist_001_archive_derivation.sh"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261026_008_conversation_history_personal_analytics.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261026_009_conversation_history_personal_analytics_hash_hardening.sql"

run_id="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "SELECT archive_derivation_run_id FROM comind.cm_archive_derivation_run WHERE import_id='c2080001-0000-4000-8000-000000000102'::uuid AND source_conversation_id='native-history-1' ORDER BY created_at LIMIT 1;")"
if [[ -z "$run_id" ]]; then
  echo 'CHIST-A01 could not locate the certified fixture archive derivation run.' >&2
  exit 1
fi

# First calculation creates the complete objective v1 fact set. A same-run retry is idempotent.
first_inserted="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'UTC';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_conversation_metrics('${run_id}'::uuid);
SQL
)"
second_inserted="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'America/Indiana/Indianapolis';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_conversation_metrics('${run_id}'::uuid);
SQL
)"
[[ "$first_inserted" == "24" ]] || { echo "Expected 24 first-run metric facts, got $first_inserted" >&2; exit 1; }
[[ "$second_inserted" == "0" ]] || { echo "Expected idempotent same-run retry to add 0 facts, got $second_inserted" >&2; exit 1; }

# Create a second deterministic derivation run over the exact same certified source and policy.
# This is synthetic acceptance evidence only. It lets us prove metric identities do not vary
# with session timezone or run UUID.
second_run_id='a2290001-0000-4000-8000-000000000001'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO comind.cm_archive_derivation_run (
  archive_derivation_run_id,import_id,source_conversation_id,policy_version,engine_kind,
  provider,model,prompt_template_sha256,archive_normalized_hash,archive_topology_hash,
  source_snapshot_sha256,run_identity_sha256,source_node_count,source_message_count,
  active_branch_node_count,result_state,source_stats,engine_metadata
)
SELECT
  '${second_run_id}'::uuid,import_id,source_conversation_id,policy_version,engine_kind,
  provider,model,prompt_template_sha256,archive_normalized_hash,archive_topology_hash,
  source_snapshot_sha256,repeat('9',64),source_node_count,source_message_count,
  active_branch_node_count,result_state,source_stats,engine_metadata
FROM comind.cm_archive_derivation_run
WHERE archive_derivation_run_id='${run_id}'::uuid;
SQL

third_inserted="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET TIME ZONE 'America/Indiana/Indianapolis';
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_compute_archive_conversation_metrics('${second_run_id}'::uuid);
SQL
)"
[[ "$third_inserted" == "24" ]] || { echo "Expected second-run metric set to add 24 facts, got $third_inserted" >&2; exit 1; }

# Verify exact deterministic values from the synthetic two-message fixture.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM comind.cm_archive_metric_definition;
  IF v_count <> 24 THEN RAISE EXCEPTION 'expected 24 v1 metric definitions, got %',v_count; END IF;

  IF EXISTS (SELECT 1 FROM comind.cm_archive_metric_definition WHERE semantic_class <> 'objective') THEN
    RAISE EXCEPTION 'CHIST-A01 v1 unexpectedly includes interpretive metrics';
  END IF;

  SELECT count(*) INTO v_count FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid;
  IF v_count <> 24 THEN RAISE EXCEPTION 'expected 24 first-run facts, got %',v_count; END IF;

  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.node_count') <> 2 THEN RAISE EXCEPTION 'node_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.message_count') <> 2 THEN RAISE EXCEPTION 'message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.attachment_reference_count') <> 1 THEN RAISE EXCEPTION 'attachment_reference_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.active_branch_node_count') <> 2 THEN RAISE EXCEPTION 'active_branch_node_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.null_message_node_count') <> 0 THEN RAISE EXCEPTION 'null_message_node_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.branch_point_count') <> 0 THEN RAISE EXCEPTION 'branch_point_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.leaf_node_count') <> 1 THEN RAISE EXCEPTION 'leaf_node_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.edge_count') <> 1 THEN RAISE EXCEPTION 'edge_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.max_graph_depth') <> 2 THEN RAISE EXCEPTION 'max_graph_depth mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.user_message_count') <> 1 THEN RAISE EXCEPTION 'user_message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.assistant_message_count') <> 1 THEN RAISE EXCEPTION 'assistant_message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.system_message_count') <> 0 THEN RAISE EXCEPTION 'system_message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.tool_message_count') <> 0 THEN RAISE EXCEPTION 'tool_message_count mismatch'; END IF;
  IF (SELECT value_numeric FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.user_assistant_message_ratio') <> 1 THEN RAISE EXCEPTION 'user_assistant_message_ratio mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.text_character_count') <> 99 THEN RAISE EXCEPTION 'text_character_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.text_word_count') <> 11 THEN RAISE EXCEPTION 'text_word_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.question_mark_count') <> 0 THEN RAISE EXCEPTION 'question_mark_count mismatch'; END IF;
  IF (SELECT value_timestamp FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.first_message_at') <> '2026-10-26T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'first_message_at mismatch'; END IF;
  IF (SELECT value_timestamp FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.last_message_at') <> '2026-10-26T18:00:10Z'::timestamptz THEN RAISE EXCEPTION 'last_message_at mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='conversation.message_span_seconds') <> 10 THEN RAISE EXCEPTION 'message_span_seconds mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='activity.timestamped_message_count') <> 2 THEN RAISE EXCEPTION 'timestamped_message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='activity.untimestamped_message_count') <> 0 THEN RAISE EXCEPTION 'untimestamped_message_count mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='activity.message_count_by_hour_utc' AND dimension='{"hour_utc":18}'::jsonb) <> 2 THEN RAISE EXCEPTION 'hour bucket mismatch'; END IF;
  IF (SELECT value_integer FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid AND metric_key='activity.message_count_by_weekday_utc' AND dimension='{"weekday_utc":1}'::jsonb) <> 2 THEN RAISE EXCEPTION 'weekday bucket mismatch'; END IF;
END
\$\$;
SQL

# Same source + policy + values must yield the same metric hashes even when computed in a different timezone and run UUID.
mismatch_count="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 <<SQL
SELECT count(*)
FROM comind.cm_archive_metric_fact a
FULL JOIN comind.cm_archive_metric_fact b
  ON b.archive_derivation_run_id='${second_run_id}'::uuid
 AND a.metric_key=b.metric_key
 AND a.metric_version=b.metric_version
 AND a.dimension_sha256=b.dimension_sha256
WHERE a.archive_derivation_run_id='${run_id}'::uuid
  AND (b.archive_metric_fact_id IS NULL OR a.metric_fact_sha256<>b.metric_fact_sha256);
SQL
)"
[[ "$mismatch_count" == "0" ]] || { echo "Metric hash determinism mismatch count: $mismatch_count" >&2; exit 1; }

# Reader may read certified facts but cannot mutate them.
reader_count="$(PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_reader;
SELECT count(*) FROM comind.cm_archive_metric_fact WHERE archive_derivation_run_id='${run_id}'::uuid;
SQL
)"
[[ "$reader_count" == "24" ]] || { echo "History reader expected 24 metric facts, got $reader_count" >&2; exit 1; }

if PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_reader; UPDATE comind.cm_archive_metric_fact SET value_integer=999 WHERE archive_derivation_run_id='${run_id}'::uuid;" >/tmp/chist_a01_reader_mutation.out 2>&1; then
  echo 'History reader unexpectedly mutated archive metric evidence.' >&2
  exit 1
fi

# Deriver receives no direct INSERT authority; facts can only be produced through the governed calculator.
if PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_deriver; INSERT INTO comind.cm_archive_metric_fact(archive_derivation_run_id,import_id,source_conversation_id,metric_key,metric_version,calculation_policy_version,dimension,dimension_sha256,fact_state,value_integer,metric_fact_sha256) VALUES ('${run_id}','c2080001-0000-4000-8000-000000000102','native-history-1','conversation.node_count','v1','forbidden','{}',repeat('1',64),'computed',999,repeat('2',64));" >/tmp/chist_a01_deriver_direct_insert.out 2>&1; then
  echo 'Archive deriver unexpectedly inserted a metric fact directly.' >&2
  exit 1
fi

# Ordinary Data API roles must not inherit private analytics access.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role)
       AND has_table_privilege(v_role,'comind.cm_archive_metric_fact','SELECT') THEN
      RAISE EXCEPTION 'role % unexpectedly has SELECT on private archive metric facts',v_role;
    END IF;
  END LOOP;
END
$$;
SQL

echo 'CHIST-A01 governed archive-native personal analytics acceptance: PASS'
