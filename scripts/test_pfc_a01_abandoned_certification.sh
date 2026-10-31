#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required for isolated PFC-A01 certification proof}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing PFC-A01 certification proof outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

# Recovery authority must remain distinct from certification authority.
archive_can_certify="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c \
  "SELECT has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','INSERT');")"
if [[ "${archive_can_certify}" != "f" ]]; then
  echo 'Archive recovery authority unexpectedly has baseline certification INSERT privilege' >&2
  exit 1
fi

# Seed one terminal ABANDONED attempt under an immutable ChatGPT source.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO comind.cm_archive_source (
  source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata
) VALUES (
  'c2410001-0000-4000-8000-000000000501','chatgpt','pfc-a01-abandoned.zip','34272eab6aa7a420c8868539968d6ae0e4abe725eb2876e29b47b4c99d808da1',512,
  '{"pfc_a01":true,"private_user_data":false}'::jsonb
)
ON CONFLICT (source_system,source_archive_sha256) DO NOTHING;

INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,attempt_number,
  started_at,completed_at,reconciliation,receipt,receipt_sha256
) VALUES (
  'c2410001-0000-4000-8000-000000000502',
  'c2410001-0000-4000-8000-000000000501',
  'pfc-a01-cert-v1','comind-archive-v1','ABANDONED',1,
  '2026-10-26T23:00:00Z','2026-10-26T23:01:00Z',
  '{"recoveryDisposition":"abandoned_after_interruption","completeImportClaimed":false}'::jsonb,
  '{"status":"ABANDONED","sourceEvidencePreserved":true,"deletionPerformed":false}'::jsonb,
  repeat('6',64)
)
ON CONFLICT (source_archive_id,parser_version,schema_version,attempt_number) DO NOTHING;
SQL

set +e
cert_output="$(
  PGPASSWORD=certifier-test-password psql -h localhost -U chist_certifier_login -d comind_ci -X -v ON_ERROR_STOP=1 2>&1 <<'SQL'
SET ROLE comind_conversation_history_certifier;
INSERT INTO comind.cm_conversation_history_baseline (
  baseline_id,import_id,source_archive_id,source_archive_sha256,certification_version,
  source_kind,certified_by,certification_reason,evidence,certification_sha256
) VALUES (
  'c2410001-0000-4000-8000-000000000503',
  'c2410001-0000-4000-8000-000000000502',
  'c2410001-0000-4000-8000-000000000501','34272eab6aa7a420c8868539968d6ae0e4abe725eb2876e29b47b4c99d808da1','pfc-a01-cert-v1',
  'native_openai_export','isolated-pfc-a01-certifier','ABANDONED attempts must never certify.',
  '{"pfc_a01":true,"synthetic":true}'::jsonb,repeat('7',64)
);
SQL
)"
cert_status=$?
set -e

if [[ ${cert_status} -eq 0 ]]; then
  echo 'PFC-A01 certifier unexpectedly accepted an ABANDONED archive attempt' >&2
  exit 1
fi
if ! grep -Fq 'Conversation History baseline requires a PASS archive import' <<<"${cert_output}"; then
  echo 'PFC-A01 ABANDONED certification failed for an unexpected reason' >&2
  printf '%s\n' "${cert_output}" >&2
  exit 1
fi

baseline_count="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) FROM comind.cm_conversation_history_baseline WHERE import_id='c2410001-0000-4000-8000-000000000502';")"
if [[ "${baseline_count}" != "0" ]]; then
  echo 'PFC-A01 ABANDONED import produced baseline evidence despite rejection' >&2
  exit 1
fi

echo 'PFC-A01 ABANDONED baseline certification rejection: PASS'
