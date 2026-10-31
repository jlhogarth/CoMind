#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-001 archive derivation verification}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261026_004_conversation_history_archive_derivation.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chist_archive_deriver_login') THEN
    DROP ROLE chist_archive_deriver_login;
  END IF;
  CREATE ROLE chist_archive_deriver_login LOGIN PASSWORD 'archive-deriver-test-password'
    NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT comind_conversation_history_deriver TO chist_archive_deriver_login WITH INHERIT FALSE, SET TRUE;
END
$$;
SQL

cd "${root}/server"
npm run build

export COMIND_DATABASE_PURPOSE=chatgpt_history_derivation
export CHATGPT_HISTORY_DERIVATION_DATABASE_URL='postgresql://chist_archive_deriver_login:archive-deriver-test-password@localhost:5432/comind_ci'

node dist/history/archive-derive-cli.js --preflight > /tmp/chist_archive_preflight.json
node dist/history/archive-derive-cli.js c2080001-0000-4000-8000-000000000102 native-history-1 > /tmp/chist_archive_first.json
node dist/history/archive-derive-cli.js c2080001-0000-4000-8000-000000000102 native-history-1 > /tmp/chist_archive_second.json

python3 - <<'PY'
import json
pre=json.load(open('/tmp/chist_archive_preflight.json'))
first=json.load(open('/tmp/chist_archive_first.json'))
second=json.load(open('/tmp/chist_archive_second.json'))
assert pre['ok'] is True
assert pre['preflight']['currentUser']=='comind_conversation_history_deriver'
assert first['reusedExistingRun'] is False
assert second['reusedExistingRun'] is True
assert first['archiveDerivationRunId']==second['archiveDerivationRunId']
assert first['runIdentitySha256']==second['runIdentitySha256']
assert first['resultState']=='completed'
assert first['activeBranchNodeCount']==2
assert first['excludedNodeCount']==0
assert first['derivationCount'] > 0
assert second['derivationCount']==first['derivationCount']
print('CHIST-001 archive-native deterministic derivation: PASS')
PY

# One immutable run, no duplicate evidence, no canonical memory promotion.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  run_count integer;
  derivation_count integer;
  memory_count integer;
BEGIN
  SELECT count(*) INTO run_count FROM comind.cm_archive_derivation_run
   WHERE import_id='c2080001-0000-4000-8000-000000000102'::uuid AND source_conversation_id='native-history-1';
  IF run_count <> 1 THEN RAISE EXCEPTION 'expected exactly one archive derivation run, got %',run_count; END IF;
  SELECT count(*) INTO derivation_count FROM comind.cm_archive_derivation;
  IF derivation_count <= 0 THEN RAISE EXCEPTION 'expected archive derivation evidence'; END IF;
  SELECT count(*) INTO memory_count FROM comind.cm_memory_node;
  IF memory_count <> 0 THEN RAISE EXCEPTION 'archive derivation unexpectedly created canonical memory'; END IF;
END
$$;
SQL

# Worker may not mutate preserved source or live CFR-G evidence.
if PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_deriver; UPDATE comind.cm_archive_conversation_observation SET title='forbidden' WHERE source_conversation_id='native-history-1';" >/tmp/chist_archive_forbidden.out 2>&1; then
  echo 'Archive history deriver unexpectedly mutated source evidence' >&2
  exit 1
fi
if PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_deriver; INSERT INTO comind.cm_conversation_derivation_run(conv_id,policy_version,engine_kind,source_snapshot_sha256,run_identity_sha256,source_message_count,source_capture_event_count,source_checkpoint_count,source_max_capture_sequence,result_state) VALUES ('c2080001-0000-4000-8000-000000000001','forbidden','deterministic',repeat('1',64),repeat('2',64),0,0,0,0,'completed');" >/tmp/chist_live_forbidden.out 2>&1; then
  echo 'Archive history deriver unexpectedly wrote live CFR-G derivation evidence' >&2
  exit 1
fi

echo 'CHIST-001 archive derivation acceptance: PASS'
