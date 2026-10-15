#!/usr/bin/env bash
set -euo pipefail
SDN="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="$SDN/evidence"
COMPOSE=(docker compose -f "$SDN/compose.yaml")
mkdir -p "$EVIDENCE"

expect_guard_failure() {
  local name="$1"
  local expected="$2"
  local sql_file
  sql_file="$(mktemp)"
  cat > "$sql_file"
  if cat "$sql_file" | "${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 >"$EVIDENCE/${name}.stdout" 2>"$EVIDENCE/${name}.stderr"; then
    rm -f "$sql_file"
    echo "Guard case ${name} unexpectedly succeeded" >&2
    exit 1
  fi
  rm -f "$sql_file"
  grep -Fq "$expected" "$EVIDENCE/${name}.stderr" || {
    echo "Guard case ${name} failed for the wrong reason; expected: ${expected}" >&2
    cat "$EVIDENCE/${name}.stderr" >&2
    exit 1
  }
}

expect_guard_failure purge-missing-derivative 'lacks verified derivative' <<'SQL'
BEGIN;
INSERT INTO sdn_telemetry.events(event_pk,producer_id,event_id,schema_version,event_type,lifecycle_class,sensitivity_class,source_timestamp,source_environment,payload,payload_hash,canonicalization_version,policy_version_id,ingested_at)
VALUES ('f1000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000001','1.0.0','ops.state','E','internal',clock_timestamp()-interval '5 minutes','sdn-001-guard-test','{"guard":"missing-derivative"}'::jsonb,encode(digest('missing-derivative','sha256'),'hex'),'json-key-sort-v1','00000000-0000-4000-8000-000000000001',clock_timestamp()-interval '5 minutes');
INSERT INTO sdn_lifecycle.evaluations(evaluation_id,job_id,event_pk,producer_id,event_id,policy_version_id,lifecycle_class,outcome,details,evaluated_at)
VALUES (gen_random_uuid(),gen_random_uuid(),'f1000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','E','eligible','{"syntheticGuard":true}'::jsonb,clock_timestamp());
SET ROLE sdn_purge_user;
SELECT sdn_lifecycle.purge_eligible_event('f1000000-0000-4000-8000-000000000001');
COMMIT;
SQL

expect_guard_failure purge-incomplete-compaction 'lacks verified compaction manifest' <<'SQL'
BEGIN;
INSERT INTO sdn_telemetry.events(event_pk,producer_id,event_id,schema_version,event_type,lifecycle_class,sensitivity_class,source_timestamp,source_environment,payload,payload_hash,canonicalization_version,policy_version_id,ingested_at)
VALUES ('f1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000002','1.0.0','metric.sample','D','internal',clock_timestamp()-interval '5 minutes','sdn-001-guard-test','{"guard":"incomplete-compaction","value":1}'::jsonb,encode(digest('incomplete-compaction','sha256'),'hex'),'json-key-sort-v1','00000000-0000-4000-8000-000000000001',clock_timestamp()-interval '5 minutes');
INSERT INTO sdn_lifecycle.evaluations(evaluation_id,job_id,event_pk,producer_id,event_id,policy_version_id,lifecycle_class,outcome,details,evaluated_at)
VALUES (gen_random_uuid(),gen_random_uuid(),'f1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','D','eligible','{"syntheticGuard":true}'::jsonb,clock_timestamp());
INSERT INTO sdn_summary.summaries(summary_id,summary_kind,lifecycle_class,algorithm_id,algorithm_version,content,summary_hash,source_count,created_at,verified_at)
VALUES ('f3000000-0000-4000-8000-000000000002','metric-rollup-v1','D','deterministic-json','1','{"guard":"incomplete-compaction"}'::jsonb,encode(digest('guard-summary','sha256'),'hex'),1,clock_timestamp(),clock_timestamp());
INSERT INTO sdn_summary.summary_sources(summary_id,source_event_pk,source_producer_id,source_event_id,source_payload_hash)
VALUES ('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000002',encode(digest('incomplete-compaction','sha256'),'hex'));
INSERT INTO sdn_lifecycle.compaction_manifests(manifest_id,source_event_pk,policy_version_id,algorithm_id,algorithm_version,source_count,source_set_hash,derivative_summary_id,verification_status,created_at,verified_at)
VALUES ('f4000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','source-set-sha256','1',1,encode(digest('guard-source-set','sha256'),'hex'),'f3000000-0000-4000-8000-000000000002','prepared',clock_timestamp(),NULL);
SET ROLE sdn_purge_user;
SELECT sdn_lifecycle.purge_eligible_event('f1000000-0000-4000-8000-000000000002');
COMMIT;
SQL

expect_guard_failure purge-policy-mismatch 'lacks matching eligible evaluation' <<'SQL'
BEGIN;
INSERT INTO sdn_telemetry.events(event_pk,producer_id,event_id,schema_version,event_type,lifecycle_class,sensitivity_class,source_timestamp,source_environment,payload,payload_hash,canonicalization_version,policy_version_id,ingested_at)
VALUES ('f1000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000003','1.0.0','ops.state','E','internal',clock_timestamp()-interval '5 minutes','sdn-001-guard-test','{"guard":"policy-mismatch"}'::jsonb,encode(digest('policy-mismatch','sha256'),'hex'),'json-key-sort-v1','00000000-0000-4000-8000-000000000001',clock_timestamp()-interval '5 minutes');
INSERT INTO sdn_lifecycle.evaluations(evaluation_id,job_id,event_pk,producer_id,event_id,policy_version_id,lifecycle_class,outcome,details,evaluated_at)
VALUES (gen_random_uuid(),gen_random_uuid(),'f1000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000099','E','eligible','{"syntheticGuard":true}'::jsonb,clock_timestamp());
INSERT INTO sdn_summary.summaries(summary_id,summary_kind,lifecycle_class,algorithm_id,algorithm_version,content,summary_hash,source_count,created_at,verified_at)
VALUES ('f3000000-0000-4000-8000-000000000003','current-state-v1','E','deterministic-json','1','{"guard":"policy-mismatch"}'::jsonb,encode(digest('guard-policy-summary','sha256'),'hex'),1,clock_timestamp(),clock_timestamp());
INSERT INTO sdn_summary.summary_sources(summary_id,source_event_pk,source_producer_id,source_event_id,source_payload_hash)
VALUES ('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','f2000000-0000-4000-8000-000000000003',encode(digest('policy-mismatch','sha256'),'hex'));
SET ROLE sdn_purge_user;
SELECT sdn_lifecycle.purge_eligible_event('f1000000-0000-4000-8000-000000000003');
COMMIT;
SQL

printf '%s\n' 'All synthetic destructive guard failures were rejected for the expected reason.'
