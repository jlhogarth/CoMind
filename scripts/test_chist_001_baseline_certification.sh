#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-001 certification verification}"

# Seed a realistic PASS import in the isolated database. This simulates the output shape
# of the accepted archive importer without using private user data.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO comind.cm_archive_source (
  source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata
) VALUES (
  'c2080001-0000-4000-8000-000000000501','chatgpt','chatgpt-export-2026-10-26.zip',repeat('2',64),4096,
  '{"acceptance_simulation":true,"private_user_data":false}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,
  parser_warning_count,parser_error_count,reconciliation,receipt,receipt_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000502','c2080001-0000-4000-8000-000000000501',
  'chatgpt-export-v0.1.0','comind-archive-v1','PASS','2026-10-26T19:00:00Z','2026-10-26T19:01:00Z',
  1,2,2,0,1,2,2,0,0,0,'{"countsMatch":true,"assetsInventoried":true}'::jsonb,
  '{"status":"PASS","acceptance_simulation":true}'::jsonb,repeat('3',64)
);
SQL

cd "${root}/server"
export COMIND_DATABASE_PURPOSE=chatgpt_history_certification
export CHATGPT_HISTORY_CERTIFICATION_DATABASE_URL='postgresql://chist_certifier_login:certifier-test-password@localhost:5432/comind_ci'

node dist/history/baseline-certify-cli.js --preflight > /tmp/chist_cert_preflight.json
node dist/history/baseline-certify-cli.js c2080001-0000-4000-8000-000000000502 \
  --certified-by isolated-test-operator \
  --reason 'Governed certification acceptance simulation with no private user data.' > /tmp/chist_cert_first.json
node dist/history/baseline-certify-cli.js c2080001-0000-4000-8000-000000000502 \
  --certified-by isolated-test-operator \
  --reason 'Governed certification acceptance simulation with no private user data.' > /tmp/chist_cert_second.json

python3 - <<'PY'
import json
pre=json.load(open('/tmp/chist_cert_preflight.json'))
first=json.load(open('/tmp/chist_cert_first.json'))
second=json.load(open('/tmp/chist_cert_second.json'))
assert pre['ok'] is True
assert pre['preflight']['currentUser']=='comind_conversation_history_certifier'
assert first['reusedExistingCertification'] is False
assert second['reusedExistingCertification'] is True
assert first['baselineId']==second['baselineId']
assert first['certificationSha256']==second['certificationSha256']
assert first['sourceArchiveSha256']=='2'*64
print('CHIST-001 governed baseline certification: PASS')
PY

# The governed certifier must reject the known synthetic PASS fixture even though
# isolated SQL acceptance previously certified it directly for reader testing.
if node dist/history/baseline-certify-cli.js c2080001-0000-4000-8000-000000000102 \
  --certified-by isolated-test-operator \
  --reason 'This synthetic fixture must be rejected.' >/tmp/chist_synthetic_cert.out 2>&1; then
  echo 'Governed certifier unexpectedly accepted synthetic archive evidence' >&2
  exit 1
fi

echo 'CHIST-001 synthetic certification rejection: PASS'
